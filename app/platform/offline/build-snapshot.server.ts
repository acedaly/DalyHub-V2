/**
 * PWA-04 — build the seven-day offline snapshot from a workspace scope.
 *
 * The server half of the offline data model. It reads through the SAME
 * workspace-bound repositories every online loader uses — so a snapshot can never
 * see across the FND-03 isolation boundary, and there is no second query path to
 * keep in step — and reduces what it reads to the minimised
 * `OfflineSnapshot` contract.
 *
 * ── The shape of the work ────────────────────────────────────────────────────
 * Reads are bounded and, per section, a fixed number of statements: no per-record
 * follow-up query, and no "load the workspace and filter in JavaScript". The one
 * place a per-record read is unavoidable is meeting attendees, which are
 * EntityLinks rather than a column; that read is explicitly capped and the cap is
 * documented at the call site rather than left to be discovered.
 *
 * ── Degradation ──────────────────────────────────────────────────────────────
 * Every section is independently guarded. A section whose read fails contributes
 * nothing and the snapshot is still built and still stored, because a device with
 * five of six sections is far better than a device with none — and the offline UI
 * shows what it has rather than claiming completeness. A failure NEVER produces a
 * partially-written section: the guard wraps the whole section.
 */

import {
  OFFLINE_SNAPSHOT_LIMITS,
  OFFLINE_SNAPSHOT_VERSION,
  addCalendarDays,
  deriveOfflineNamespace,
  offlineWindow,
  toExcerpt,
  windowInstantBounds,
  type OfflineDiaryEntry,
  type OfflineMeeting,
  type OfflineNote,
  type OfflineReference,
  type OfflineSnapshot,
  type OfflineTask,
  type OfflineTodaySummary,
  type OfflineWindow,
} from "~/kernel/offline";
import { MEETING_ATTENDEE_LINK } from "~/kernel/meetings";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso, ownerLocalToUtc } from "~/shared/datetime";

/**
 * How many meetings have their attendee labels resolved. Attendees are
 * EntityLinks, so each meeting costs one bounded link query — the only per-record
 * read in the snapshot. Twenty-five covers a fortnight of a very busy calendar;
 * beyond it the meeting is still stored, just without attendee names, which the
 * offline meeting card renders as "attendees need a connection" rather than as an
 * empty list.
 */
const ATTENDEE_RESOLUTION_LIMIT = 25;

/** How many attendee names one meeting contributes. */
const ATTENDEES_PER_MEETING = 8;

/** Run a section read, returning the fallback if it fails for any reason. */
async function section<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/** The instant bounds of the window, in the owner's timezone. */
function boundsFor(window: OfflineWindow) {
  return windowInstantBounds(window, ownerLocalToUtc);
}

/**
 * Tasks in the window: everything due or scheduled inside it, everything overdue
 * and still open (regardless of how far back it slipped — an overdue task from
 * three weeks ago is exactly the thing the owner needs offline), and everything
 * completed inside the past half of the window.
 *
 * `listPlanningTasks` is reused rather than a new query: it is the established,
 * bounded planning read that already returns scheduled work first, the backlog,
 * and recent completions in one call.
 */
async function buildTasks(
  scope: WorkspaceScope,
  window: OfflineWindow,
): Promise<{
  readonly tasks: readonly OfflineTask[];
  readonly references: readonly OfflineReference[];
  readonly bounded: boolean;
}> {
  const page = await scope.tasks.listPlanningTasks({
    todayIso: window.todayIso,
    scheduledLimit: OFFLINE_SNAPSHOT_LIMITS.tasks,
    backlogLimit: 60,
    completedLimit: 120,
  });

  const references = new Map<string, OfflineReference>();
  const tasks: OfflineTask[] = [];

  for (const item of page.items) {
    const completedIso = item.completedAt
      ? ownerCalendarIso(item.completedAt, window.timezone)
      : null;
    const planningIso = item.scheduledDate ?? item.dueDate;

    // Completion in DalyHub is `completedAt`, NOT a status value: the status set
    // is todo/in_progress/on_hold/cancelled and a completed task keeps whichever
    // it had (ADR-014). Reading completion off `completedAt` is what keeps the
    // offline view agreeing with every online surface.
    const isCompleted = item.completedAt !== null;
    const retained =
      // Open and planned inside the window.
      (!isCompleted &&
        planningIso !== null &&
        planningIso >= window.startIso &&
        planningIso <= window.endIso) ||
      // Open and overdue — retained however old, because it is still owed.
      (!isCompleted && planningIso !== null && planningIso < window.todayIso) ||
      // Completed inside the past half of the window.
      (completedIso !== null &&
        completedIso >= window.startIso &&
        completedIso <= window.todayIso);

    if (!retained) continue;
    if (tasks.length >= OFFLINE_SNAPSHOT_LIMITS.tasks) break;

    if (item.parent && references.size < OFFLINE_SNAPSHOT_LIMITS.references) {
      // ONLY the parents actually referenced by a retained task reach the device.
      // There is no bulk Projects or Areas copy (a hard constraint of this
      // milestone), and no field beyond the id and the label the card renders.
      const kind = item.parent.kind === "area" ? "area" : "project";
      references.set(item.parent.id, {
        id: item.parent.id,
        kind,
        label: item.parent.title,
      });
    }

    tasks.push({
      id: item.id,
      title: item.title,
      status: isCompleted ? "completed" : "open",
      priority: item.priority ?? null,
      timeSector: item.timeSector ?? null,
      dueDate: item.dueDate,
      scheduledDate: item.scheduledDate,
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
      updatedAt: item.updatedAt.toISOString(),
      parentId: item.parent?.id ?? null,
      parentLabel: item.parent?.title ?? null,
      waiting: item.waiting !== null,
    });
  }

  return {
    tasks,
    references: [...references.values()],
    bounded: page.items.length >= OFFLINE_SNAPSHOT_LIMITS.tasks,
  };
}

/** Notes created or updated inside the past half of the window. */
async function buildNotes(
  scope: WorkspaceScope,
  window: OfflineWindow,
): Promise<{
  readonly notes: readonly OfflineNote[];
  readonly bounded: boolean;
}> {
  const page = await scope.notes.list({
    state: "active",
    sort: "recent",
    limit: OFFLINE_SNAPSHOT_LIMITS.notes,
  });
  const notes: OfflineNote[] = [];
  for (const item of page.items) {
    const updatedIso = ownerCalendarIso(
      item.effectiveUpdatedAt,
      window.timezone,
    );
    if (updatedIso < window.startIso) continue;
    // `excerpt` is the collection's own bounded, syntax-free opening excerpt —
    // the offline card shows exactly what the online card shows. The full
    // Markdown body is deliberately NOT retained: a seven-day window of complete
    // note bodies is unbounded, and it is the most sensitive text in the product.
    //
    // `truncated` therefore means "there is more note than this", which is true
    // whenever the note has a body at all — the offline copy is NEVER the whole
    // note. It is not "the snapshot shortened it", because the shortening
    // already happened in the collection projection. Saying otherwise would
    // imply a short excerpt was the complete note.
    const { excerpt } = toExcerpt(item.excerpt);
    notes.push({
      id: item.id,
      title: item.title,
      excerpt,
      truncated: excerpt.length > 0,
      tags: item.tags,
      updatedAt: item.effectiveUpdatedAt.toISOString(),
    });
  }
  return { notes, bounded: page.hasMore };
}

/** Diary entries whose moment falls inside the window. */
async function buildDiary(
  scope: WorkspaceScope,
  window: OfflineWindow,
): Promise<{
  readonly diary: readonly OfflineDiaryEntry[];
  readonly bounded: boolean;
}> {
  const { startUtc, endUtc } = boundsFor(window);
  const page = await scope.diary.list({
    order: "newest",
    limit: OFFLINE_SNAPSHOT_LIMITS.diary,
    occurredFrom: startUtc,
    occurredTo: endUtc,
  });
  return {
    diary: page.items.map((entry) => {
      const { excerpt, truncated } = toExcerpt(entry.body);
      return {
        id: entry.id,
        title: entry.title,
        entryType: entry.entryType,
        occurredAt: entry.occurredAt.toISOString(),
        excerpt,
        truncated,
      };
    }),
    bounded: page.hasMore,
  };
}

/** Meetings that start inside the window, with bounded attendee labels. */
async function buildMeetings(
  scope: WorkspaceScope,
  window: OfflineWindow,
): Promise<{
  readonly meetings: readonly OfflineMeeting[];
  readonly references: readonly OfflineReference[];
  readonly bounded: boolean;
}> {
  const { startUtc, endUtc } = boundsFor(window);
  // Two views because the repository models "upcoming" and "recent" separately;
  // both are bounded, and the window filter below is what actually decides.
  const [upcoming, recent] = await Promise.all([
    scope.meetings.list({
      view: "upcoming",
      sort: "start",
      limit: OFFLINE_SNAPSHOT_LIMITS.meetings,
    }),
    scope.meetings.list({
      view: "recent",
      sort: "start",
      limit: OFFLINE_SNAPSHOT_LIMITS.meetings,
    }),
  ]);

  const byId = new Map<string, (typeof upcoming.items)[number]>();
  for (const meeting of [...upcoming.items, ...recent.items]) {
    if (meeting.startsAt < startUtc || meeting.startsAt >= endUtc) continue;
    byId.set(meeting.id, meeting);
  }
  const inWindow = [...byId.values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, OFFLINE_SNAPSHOT_LIMITS.meetings);

  const references = new Map<string, OfflineReference>();
  const meetings: OfflineMeeting[] = [];

  for (const [index, meeting] of inWindow.entries()) {
    let attendeeLabels: string[] = [];
    if (index < ATTENDEE_RESOLUTION_LIMIT) {
      try {
        const links = await scope.entityLinks.listForEntity(meeting.id, {
          direction: "both",
          limit: 50,
        });
        for (const view of links.items) {
          if (view.link.type !== MEETING_ATTENDEE_LINK) continue;
          if (attendeeLabels.length >= ATTENDEES_PER_MEETING) break;
          attendeeLabels.push(view.counterpart.title);
          if (references.size < OFFLINE_SNAPSHOT_LIMITS.references) {
            // Only the NAME and id — never contact details, never the Person
            // record. People data is the most sensitive in the product
            // (`AGENTS.md §5`), and an attendee chip needs nothing else.
            references.set(view.counterpart.id, {
              id: view.counterpart.id,
              kind: "person",
              label: view.counterpart.title,
            });
          }
        }
      } catch {
        attendeeLabels = [];
      }
    }
    meetings.push({
      id: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      heldAt: meeting.heldAt ? meeting.heldAt.toISOString() : null,
      attendeeLabels,
    });
  }

  return {
    meetings,
    references: [...references.values()],
    bounded: upcoming.hasMore || recent.hasMore,
  };
}

/** Derive the Today counts from the retained tasks and meetings. */
export function summariseToday(
  tasks: readonly OfflineTask[],
  meetings: readonly OfflineMeeting[],
  window: OfflineWindow,
  timezone: string,
  toCalendarIso: (instant: Date, timeZone: string) => string = ownerCalendarIso,
): OfflineTodaySummary {
  const upcomingEnd = addCalendarDays(window.todayIso, 7);
  let dueTodayCount = 0;
  let overdueCount = 0;
  let upcomingCount = 0;
  let completedRecentlyCount = 0;

  for (const task of tasks) {
    if (task.status === "completed") {
      completedRecentlyCount += 1;
      continue;
    }
    const planned = task.scheduledDate ?? task.dueDate;
    if (planned === null) continue;
    if (planned < window.todayIso) overdueCount += 1;
    else if (planned === window.todayIso) dueTodayCount += 1;
    else if (planned <= upcomingEnd) upcomingCount += 1;
  }

  const meetingsTodayCount = meetings.filter(
    (meeting) =>
      toCalendarIso(new Date(meeting.startsAt), timezone) === window.todayIso,
  ).length;

  return {
    dueTodayCount,
    overdueCount,
    upcomingCount,
    completedRecentlyCount,
    meetingsTodayCount,
  };
}

/** Everything the snapshot builder needs that is not a repository. */
export interface BuildSnapshotContext {
  readonly scope: WorkspaceScope;
  /** The authenticated subject — used ONLY to derive the namespace digest. */
  readonly subject: string;
  /** A safe display identity (the owner's verified email). */
  readonly identityLabel: string;
  readonly workspaceLabel: string;
  readonly timezone: string;
  readonly now: Date;
}

/** Build the complete snapshot. */
export async function buildOfflineSnapshot(
  context: BuildSnapshotContext,
): Promise<OfflineSnapshot> {
  const window = offlineWindow(
    ownerCalendarIso(context.now, context.timezone),
    context.timezone,
  );

  const namespace = await deriveOfflineNamespace({
    subject: context.subject,
    workspaceId: context.scope.context.workspaceId,
  });

  const [taskResult, noteResult, diaryResult, meetingResult] =
    await Promise.all([
      section(() => buildTasks(context.scope, window), {
        tasks: [] as readonly OfflineTask[],
        references: [] as readonly OfflineReference[],
        bounded: false,
      }),
      section(() => buildNotes(context.scope, window), {
        notes: [] as readonly OfflineNote[],
        bounded: false,
      }),
      section(() => buildDiary(context.scope, window), {
        diary: [] as readonly OfflineDiaryEntry[],
        bounded: false,
      }),
      section(() => buildMeetings(context.scope, window), {
        meetings: [] as readonly OfflineMeeting[],
        references: [] as readonly OfflineReference[],
        bounded: false,
      }),
    ]);

  const references = new Map<string, OfflineReference>();
  for (const reference of [
    ...taskResult.references,
    ...meetingResult.references,
  ]) {
    if (references.size >= OFFLINE_SNAPSHOT_LIMITS.references) break;
    references.set(reference.id, reference);
  }

  return {
    snapshotVersion: OFFLINE_SNAPSHOT_VERSION,
    namespace,
    identityLabel: context.identityLabel,
    workspaceLabel: context.workspaceLabel,
    generatedAt: context.now.toISOString(),
    window,
    today: summariseToday(
      taskResult.tasks,
      meetingResult.meetings,
      window,
      context.timezone,
    ),
    tasks: taskResult.tasks,
    notes: noteResult.notes,
    diary: diaryResult.diary,
    meetings: meetingResult.meetings,
    references: [...references.values()],
    bounded:
      taskResult.bounded ||
      noteResult.bounded ||
      diaryResult.bounded ||
      meetingResult.bounded,
  };
}
