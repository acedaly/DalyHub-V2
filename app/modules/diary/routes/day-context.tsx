/**
 * DIARY-02 — the day-context candidates endpoint (`GET /diary/:entryId/day-context`).
 *
 * A resource route (no UI) that answers ONE question about an entry: *what else
 * does the workspace already know about the day this entry is filed under?* It
 * returns Meetings that started on that owner-calendar day and Tasks due on it, so
 * the reader can turn "I wrote about Tuesday" into a real relationship in one tap.
 *
 * Three properties matter more than the feature itself:
 *
 *   1. **It never writes anything.** A same-day record is a CANDIDATE, not a
 *      relationship. DalyHub does not infer links from dates, titles, shared words
 *      or timing (AGENTS.md §8 — the AI, and by the same rule the product, is a
 *      proposer). The only way one of these becomes a relationship is the user
 *      pressing Link, which posts to the ordinary `/links` endpoint and creates the
 *      ordinary `link.related` EntityLink.
 *   2. **It is bounded and indexed.** Meetings come from ONE statement over the
 *      existing `meeting_details_collection` index; Tasks from ONE bounded page of
 *      the existing workspace query filtered to `due_today` against the ENTRY's
 *      day. Neither loads a day of every entity type, and neither is an N+1.
 *   3. **It fails closed.** The entry id is resolved through the reserved
 *      `DiaryRepository`, so a missing, soft-deleted, wrong-type or cross-workspace
 *      id is the same calm 404 the read endpoint gives, disclosing nothing.
 *
 * Records already linked to the entry are excluded — an existing relationship is
 * shown under "Related", and offering to link it again would misrepresent the
 * state of the record.
 *
 * Deliberately NOT offered: "completed on this day". Completion is a UTC instant on
 * `spine_records` with no index behind it, so answering it for an arbitrary past
 * day would be an unbounded scan. Tasks DUE on the day are offered whether they are
 * open or complete, which covers the case the day surface is actually for. This
 * bound is documented in `DIARY_MODULE.md` rather than silently applied.
 */

import { env } from "cloudflare:workers";

import { toLocalDayKey } from "~/kernel/diary";
import { loadLinkedItems } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { endOfLocalDayUtc, startOfLocalDayUtc } from "../occurred-time";
import type { Route } from "./+types/day-context";

/** Bounds. Small on purpose: this is an offer beside an entry, not a collection. */
const MEETING_LIMIT = 8;
const TASK_LIMIT = 8;
/** The most candidates the surface will ever render, across both kinds. */
const TOTAL_LIMIT = 10;
/** How many existing relationships are read to exclude already-linked records. */
const LINKED_SCAN_LIMIT = 50;

/** One same-day record the reader may choose to link. Never itself a link. */
export type DayContextCandidate = {
  readonly id: string;
  /** The kernel entity type, for the shared icon and label. */
  readonly type: "meeting" | "task";
  readonly title: string;
  /** One supporting fact — a start time, a due date. Never a body. */
  readonly detail: string | null;
};

export type DayContextResponse = {
  /** The owner-calendar day the entry is filed under (`YYYY-MM-DD`). */
  readonly dayKey: string;
  readonly candidates: readonly DayContextCandidate[];
};

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // AUDIT-14 — the owner's timezone from the ONE scope-level authority, so
  // "which day is this entry about?" is answered here exactly as it is by the
  // entry read, the timeline and every other module. It degrades to the
  // documented default on a read failure rather than taking the surface down.
  const timezone = await scope.ownerTimeZone();

  const entry = await scope.diary.get(params.entryId);
  if (!entry) {
    throw new Response("Not Found", { status: 404 });
  }

  const dayKey = toLocalDayKey(entry.occurredAt, timezone);
  const from = startOfLocalDayUtc(dayKey, timezone);
  const to = endOfLocalDayUtc(dayKey, timezone);
  if (!from || !to) {
    return json({ dayKey, candidates: [] });
  }

  // Everything already related to this entry, so a candidate is never an offer to
  // create a relationship that exists. One bounded read of the same projection the
  // Related section renders — not a second link model.
  let linkedIds: ReadonlySet<string>;
  try {
    const linked = await loadLinkedItems(
      { entities: scope.entities, entityLinks: scope.entityLinks },
      entry.id,
      { limit: LINKED_SCAN_LIMIT },
    );
    linkedIds = new Set(linked.items.map((item) => item.target.id));
  } catch {
    linkedIds = new Set();
  }

  const candidates: DayContextCandidate[] = [];

  try {
    const meetings = await scope.meetings.listStartingBetween({
      from,
      to,
      limit: MEETING_LIMIT,
    });
    for (const meeting of meetings) {
      if (linkedIds.has(meeting.id)) continue;
      candidates.push({
        id: meeting.id,
        type: "meeting",
        title: meeting.title,
        detail: formatTime(meeting.startsAt, timezone),
      });
    }
  } catch {
    // A module that cannot be read contributes nothing; the offer degrades, the
    // entry never does.
  }

  try {
    const tasks = await scope.tasks.listWorkspaceTasks({
      view: "all",
      // `todayIso` is the ENTRY's day, not the reader's — that is what makes the
      // derived `due_today` state mean "due on the day this entry is about".
      todayIso: dayKey,
      timezone,
      filters: { dueState: "due_today", completedVisibility: "include" },
      limit: TASK_LIMIT,
    });
    for (const task of tasks.items) {
      if (linkedIds.has(task.id)) continue;
      candidates.push({
        id: task.id,
        type: "task",
        title: task.title,
        detail: task.completedAt !== null ? "Completed" : "Due this day",
      });
    }
  } catch {
    // Same rule as Meetings above.
  }

  return json({ dayKey, candidates: candidates.slice(0, TOTAL_LIMIT) });
}

function formatTime(instant: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(instant);
  } catch {
    return null;
  }
}

function json(data: DayContextResponse): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
