/**
 * NOTIFY-01 — assemble the facts a digest is rendered from.
 *
 * Every one of them is a read that already exists and is already trusted:
 *
 *   - the attention facts (Inbox, waiting, obligations, drifting projects) come
 *     from the SHARED facts layer Today's rail is built from, so the digest and
 *     the page cannot state two different numbers for one thing;
 *   - today's due and overdue counts come from the canonical `today` and
 *     `overdue` system views — the same views `/tasks` filters by;
 *   - the day's schedule comes from the ONE schedule read the Today, Tomorrow
 *     and Next 7 Days surfaces share.
 *
 * Nothing is derived here. This module reads and shapes; the digest's WORDS are
 * `renderDigest`'s and the numbers' MEANING belongs to whichever evaluator
 * already owned it.
 */

import type { DigestFacts } from "~/kernel/notifications";
import {
  countSystemView,
  readAttentionFacts,
} from "~/platform/attention/attention-facts.server";
import {
  EMPTY_SCHEDULE_WINDOW,
  loadScheduleWindow,
  scheduleForDate,
} from "~/platform/calendar/schedule-load.server";
import type { WorkspaceScope } from "~/platform/workspaces";

/** A read that degrades to a fallback rather than failing the whole tick. */
async function safely<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/**
 * Today's facts, for the owner whose zone and calendar date are supplied.
 *
 * The date is the OWNER's, resolved from the notification timezone — not the
 * runtime's. A Worker runs in UTC, so a 07:00 Sydney digest is assembled at
 * 21:00 the previous UTC day, and reading "today" from the runtime would send
 * yesterday's day every morning.
 */
export async function readDigestFacts(
  scope: WorkspaceScope,
  input: {
    readonly now: Date;
    readonly timeZone: string;
    readonly localDate: string;
  },
): Promise<DigestFacts> {
  const { now, timeZone, localDate } = input;
  const [attention, dueToday, overdue, scheduleWindow] = await Promise.all([
    readAttentionFacts(scope, { now, timezone: timeZone, todayIso: localDate }),
    safely(() => countSystemView(scope, "today", localDate, timeZone), 0),
    safely(() => countSystemView(scope, "overdue", localDate, timeZone), 0),
    safely(
      () =>
        loadScheduleWindow(scope, {
          fromDateIso: localDate,
          toDateIso: localDate,
          timeZone,
        }),
      EMPTY_SCHEDULE_WINDOW,
    ),
  ]);

  const schedule = scheduleForDate(scheduleWindow, {
    dateIso: localDate,
    timeZone,
    now,
    isToday: true,
  });

  return {
    localDate,
    dueToday,
    overdue,
    inboxCount: attention.inboxCount,
    waiting: attention.waiting,
    obligations: {
      visibleCount: attention.obligations.items.length,
      first:
        attention.obligations.items[0] === undefined
          ? null
          : {
              title: attention.obligations.items[0].title,
              subjectTitle:
                attention.obligations.items[0].subject?.title ?? null,
              text: attention.obligations.items[0].text,
            },
    },
    projects: attention.projects
      .filter((project) => project.needsAttention)
      .map((project) => ({
        title: project.title,
        statusLabel: project.statusLabel,
      })),
    // All-day items first, then the timed ones — the order the day is read in.
    events: [...schedule.allDay, ...schedule.timed].map((entry) => ({
      title: entry.title,
      timeLabel: entry.timeLabel,
    })),
  };
}
