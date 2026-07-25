/**
 * DIARY-01 / DIARY-01B — the single-entry read endpoint (`GET /diary/:entryId`).
 *
 * A resource route (no default export/UI): the trusted server boundary the docked
 * details panel fetches to populate its read view and its edit form, including on a
 * deep link to `/diary?inspector=view:<id>` where the entry may not be on the
 * loaded page. Fails CLOSED — a missing, soft-deleted, wrong-type or cross-workspace
 * id all return the same calm 404 (the `DiaryRepository.get` contract never
 * distinguishes them, disclosing nothing about ids the caller may not see).
 *
 * The entry's occurred instant is returned BOTH as the stored UTC ISO string and
 * as the owner-local wall-clock the editor's `datetime-local` control edits, so the
 * client never re-derives the display zone. Presentation-ready labels (type label,
 * occurred date/time, created/updated) are resolved server-side in the explicit
 * display zone so the read view fabricates nothing and stays hydration-safe. Body
 * content is the EXACT stored Markdown source.
 */

import { env } from "cloudflare:workers";

import { createDiaryEntryTypeRegistry, toLocalDayKey } from "~/kernel/diary";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { resolveEntryTypeLabel } from "../diary-view";
import {
  DIARY_DISPLAY_TIME_ZONE,
  formatZonedDateLong,
  formatZonedDateTimeLong,
  formatZonedTime,
  utcToOwnerLocal,
} from "../occurred-time";
import type { Route } from "./+types/entry";

/** The entry payload the details panel reads (read view + edit form seed). */
export type DiaryEntryEditData = {
  readonly id: string;
  readonly title: string;
  readonly entryType: string;
  /** The resolved human label for the type (registry label or safe fallback). */
  readonly entryTypeLabel: string;
  readonly bodySource: string;
  readonly occurredAtIso: string;
  /** The occurred instant as an owner-local `YYYY-MM-DDTHH:MM` wall-clock. */
  readonly occurredLocal: string;
  /** A friendly `"20 May 2024"` occurred date, resolved in the display zone. */
  readonly occurredDateLabel: string;
  /** The local `HH:MM` occurred time, resolved in the display zone. */
  readonly occurredTimeLabel: string;
  /** True when the moment occurred on an earlier local day than it was recorded. */
  readonly backdated: boolean;
  /** A friendly `"20 May 2024 at 06:30"` created stamp. */
  readonly createdLabel: string;
  /** A friendly `"20 May 2024 at 06:30"` last-updated stamp. */
  readonly updatedLabel: string;
  /** Whether the record has been edited since creation (updated later). */
  readonly edited: boolean;
  readonly timezone: string;
};

export type DiaryEntryEditResponse = { readonly entry: DiaryEntryEditData };

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const entry = await scope.diary.get(params.entryId);
  if (!entry) {
    throw new Response("Not Found", { status: 404 });
  }

  const tz = DIARY_DISPLAY_TIME_ZONE;
  const registry = createDiaryEntryTypeRegistry();
  const occurredDay = toLocalDayKey(entry.occurredAt, tz);
  const createdDay = toLocalDayKey(entry.createdAt, tz);

  const payload: DiaryEntryEditResponse = {
    entry: {
      id: entry.id,
      title: entry.title,
      entryType: entry.entryType,
      entryTypeLabel: resolveEntryTypeLabel(entry.entryType, registry),
      bodySource: entry.body ?? "",
      occurredAtIso: entry.occurredAt.toISOString(),
      occurredLocal: utcToOwnerLocal(entry.occurredAt, tz),
      occurredDateLabel: formatZonedDateLong(entry.occurredAt, tz),
      occurredTimeLabel: formatZonedTime(entry.occurredAt, tz),
      backdated: occurredDay < createdDay,
      createdLabel: formatZonedDateTimeLong(entry.createdAt, tz),
      updatedLabel: formatZonedDateTimeLong(entry.updatedAt, tz),
      edited: entry.updatedAt.getTime() > entry.createdAt.getTime(),
      timezone: entry.timezone,
    },
  };
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
