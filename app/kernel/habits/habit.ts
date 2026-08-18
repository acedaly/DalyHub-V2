/**
 * HABITS-01 Habits kernel — the storage-independent Habit contract.
 *
 * The application-facing shape of a Habit: the shared entity header (id,
 * workspaceId, title, timestamps, deletedAt) plus the small detail slice
 * (`habit_details`), its effective-dated schedule versions, and the Goal/Area
 * context resolved from its EntityLinks. It speaks only domain terms — camelCase,
 * `Date`s, closed unions, wall-calendar `YYYY-MM-DD` strings — and imports no D1,
 * Cloudflare, SQL or storage-row types.
 *
 * A Habit's **completion history is not part of this record**. Check-ins are
 * their own rows, read as bounded date ranges, because a record that carried its
 * whole history would grow without bound and would have to be re-read in full to
 * tick one day.
 *
 * `archivedAt` is a reversible put-away state distinct from `deletedAt`
 * soft-deletion (mirrors a Person's and a Project's): an archived Habit still
 * exists, keeps every completion it earned and remains readable; a deleted Habit
 * reads as "not found" everywhere.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

import type { HabitSchedule, HabitScheduleVersion } from "./habit-schedule";

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A related spine record, resolved for display from the Habit's EntityLink.
 *
 * Titles and identity are READ through the join, never copied into a Habit's own
 * row: renaming an Area must rename it everywhere at once, and a Habit that
 * stored the name would be the one place it did not.
 */
export interface HabitLinkedRecord {
  readonly id: string;
  readonly title: string;
  /** The Area's stable 0-based colour rank, or `null` for the neutral container. */
  readonly colourRank?: number | null;
  readonly iconKey?: string | null;
  readonly colourSlot?: string | null;
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A Habit: the entity header, its detail slice, its schedule history and the
 * two optional relationships it may hold.
 *
 * `versions` is the COMPLETE, ordered (oldest first) chain of schedule versions.
 * It is small by nature — one entry per time the owner changed their cadence —
 * and carrying it whole is what lets every historical figure be computed from
 * the schedule that was actually in force, without a second query per period.
 */
export interface Habit {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly archivedAt: Date | null;
  /** The owner-local calendar date the Habit was archived on, or `null`. */
  readonly archivedOn: string | null;
  /** The current schedule — the newest version's, for editing and display. */
  readonly schedule: HabitSchedule;
  readonly versions: readonly HabitScheduleVersion[];
  readonly goal: HabitLinkedRecord | null;
  readonly area: HabitLinkedRecord | null;
}

/** One Habit on the collection page. The same shape as a full record: a Habit is
 * small, and a second "list item" projection would be a second thing to keep in
 * step for no saved bytes. */
export type HabitListItem = Habit;

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Input to create a Habit.
 *
 * There is deliberately NO `workspaceId` — scope comes from the repository's
 * bound `WorkspaceContext` (ADR-010) — and no `effectiveFrom`: a Habit's first
 * schedule version always begins on the owner's calendar day the Habit was
 * created, which the repository resolves from the owner's timezone rather than
 * accepting from a request.
 */
export interface CreateHabitInput {
  readonly title: string;
  readonly notes?: string | null;
  readonly schedule: HabitSchedule;
  /** The Goal this behaviour supports, if any. */
  readonly goalId?: string | null;
  /** The Area this behaviour belongs to, if any. */
  readonly areaId?: string | null;
}

/**
 * Input to update a Habit's editable state.
 *
 * `undefined` means "leave unchanged"; an explicit `null` clears a relationship
 * or the notes. `schedule` is handled separately from the rest because changing
 * it CLOSES the current version and opens a new one — it is not an in-place
 * field edit, and conflating the two is exactly how historical truth is lost.
 */
export interface UpdateHabitInput {
  readonly title?: string;
  readonly notes?: string | null;
  readonly goalId?: string | null;
  readonly areaId?: string | null;
}

/** The lifecycle filter a collection listing applies. */
export type HabitListStatus = "active" | "archived" | "all";

export interface ListHabitsInput {
  readonly status?: HabitListStatus;
  readonly query?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface HabitPage {
  readonly items: readonly HabitListItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface GetHabitOptions {
  readonly includeDeleted?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Completions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One check-in: a Habit, the owner-local calendar date it counts for, and the
 * instant it was recorded.
 *
 * The DATE is the identity — `(workspace, habit, date)` is the table's primary
 * key — and the instant is provenance. That is what makes a check-in idempotent,
 * makes a double tap produce one completion, and makes "at most once per day"
 * a property of the DATABASE rather than of a control's disabled state.
 */
export interface HabitCompletion {
  readonly habitId: string;
  readonly completedOn: string;
  readonly recordedAt: Date;
}

/** What a check-in call actually did. */
export type HabitCheckInOutcome =
  /** A new completion was written. */
  | "recorded"
  /** The date was already checked in — an idempotent no-op. */
  | "already_recorded"
  /** The completion was removed. */
  | "removed"
  /** There was nothing to remove — an idempotent no-op. */
  | "already_absent";

export interface HabitCheckInResult {
  readonly habitId: string;
  readonly date: string;
  readonly outcome: HabitCheckInOutcome;
  readonly changed: boolean;
}

/** A bounded read of completions across a set of Habits and a date window. */
export interface HabitCompletionRangeInput {
  readonly habitIds: readonly string[];
  readonly fromIso: string;
  readonly toIso: string;
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export interface HabitChangeResult {
  readonly habit: Habit;
  readonly changed: boolean;
}

export type HabitLifecycleOutcome =
  "archived" | "already_archived" | "restored" | "already_active";

export interface HabitLifecycleResult {
  readonly habit: Habit;
  readonly outcome: HabitLifecycleOutcome;
  readonly changed: boolean;
}

/** What a schedule change actually did. */
export type HabitScheduleChangeOutcome =
  /** A new version was opened and the previous one closed. */
  | "versioned"
  /** The current version began TODAY and was corrected in place. */
  | "amended"
  /** The requested schedule is the one already in force — nothing happened. */
  | "unchanged";

export interface HabitScheduleChangeResult {
  readonly habit: Habit;
  readonly outcome: HabitScheduleChangeOutcome;
  readonly changed: boolean;
}
