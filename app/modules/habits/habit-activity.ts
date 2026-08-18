/**
 * HABITS-01 — the Habit record's Activity Timeline model.
 *
 * Layered over the shared descriptors exactly as the Goal and Project timelines
 * are: the kernel lifecycle defaults, then the cross-module set, then the five
 * Habit-owned events last. Every other registered type falls through to the
 * shared safe generic fallback — no Habits-only switch statement and no raw
 * payload rendering.
 *
 * ── What a Habit's timeline deliberately does NOT contain ───────────────────
 * Check-ins. A daily Habit would put hundreds of near-identical rows a year into
 * this timeline AND into the workspace-wide feed, burying the events that
 * actually describe the record. The Habit's own completion history is the
 * record's history strip, which shows every day at a glance rather than as a
 * scroll (ADR-102 §7).
 */

import {
  HABIT_ARCHIVED,
  HABIT_CREATED,
  HABIT_RESTORED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_UPDATED,
} from "~/kernel/habits";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

/** How many events a single Habit Timeline page loads. Bounded. */
export const HABIT_ACTIVITY_PAGE_SIZE = 30;

export const HABIT_ACTIVITY_DESCRIPTORS: Record<
  string,
  ActivityTypeDescriptor
> = {
  [HABIT_CREATED]: { label: "Created habit", entityType: "habit" },
  [HABIT_UPDATED]: { label: "Updated habit", entityType: "habit" },
  [HABIT_SCHEDULE_CHANGED]: {
    // Worded as what it IS. A schedule change applies from today and leaves
    // every earlier day with the cadence it had, and the timeline says so
    // rather than implying the past was rewritten.
    label: "Changed the schedule, from today",
    entityType: "habit",
  },
  [HABIT_ARCHIVED]: { label: "Archived habit", entityType: "habit" },
  [HABIT_RESTORED]: { label: "Restored habit", entityType: "habit" },
};

export const HABIT_ACTIVITY_DESCRIPTOR_MAP = buildWorkspaceActivityDescriptors(
  [],
  HABIT_ACTIVITY_DESCRIPTORS,
);

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedHabitActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of a Habit's Activity Timeline. */
export interface HabitActivityPage {
  readonly items: readonly SerializedHabitActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
