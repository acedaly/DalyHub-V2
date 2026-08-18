/**
 * HABITS-01 Habits kernel — the authoritative domain repository contract.
 *
 * The storage-independent interface owning a Habit's detail slice, its
 * effective-dated schedule chain, its Goal/Area relationships and its check-in
 * history. It speaks only domain terms (camelCase `Habit`s, closed unions, typed
 * errors) and never exposes D1, SQL or Cloudflare types.
 *
 * The repository is WORKSPACE-BOUND (ADR-010): constructed with a single
 * `WorkspaceContext`, every method operates only within that workspace, no method
 * accepts a `workspaceId`, and the trusted Activity actor is bound at
 * construction — module code cannot pass, select or spoof scope or actor. The
 * generic Entity repository refuses to CREATE a `habit` (so a Habit can never
 * exist without its detail row and its first schedule version) but still owns a
 * Habit's soft-delete and restore, exactly as it does for a Person.
 *
 * ── There is ONE check-in authority ─────────────────────────────────────────
 * `checkIn` and `undoCheckIn` are it. Today, the Habits collection and the Habit
 * record all reach them through the same route, so a tick made in one place is
 * the same fact in every other, and no surface owns a completion path of its own.
 *
 * ── Every read is BOUNDED and BATCHED ───────────────────────────────────────
 * There is deliberately no `getCompletions(habitId)`: a per-Habit read is how a
 * collection of twenty Habits becomes twenty-one queries. Completions are read
 * for a SET of Habits over a DATE WINDOW in one statement
 * (`listCompletionsInRange`), which is the shape every surface actually needs —
 * Today wants this week for every active Habit, the record wants four weeks for
 * one — and it costs the same one query either way.
 */

import type {
  CreateHabitInput,
  GetHabitOptions,
  Habit,
  HabitChangeResult,
  HabitCheckInResult,
  HabitCompletion,
  HabitCompletionRangeInput,
  HabitLifecycleResult,
  HabitPage,
  HabitScheduleChangeResult,
  ListHabitsInput,
  UpdateHabitInput,
} from "./habit";
import type { HabitSchedule } from "./habit-schedule";

/**
 * The kernel's authoritative Habit storage contract.
 *
 * Atomicity (ADR-012): `create` writes the `entities` row, the `habit_details`
 * row, the first `habit_schedules` version and one `habit.created` event as ONE
 * D1 transaction that rolls back entirely on any failure. `update`,
 * `changeSchedule`, `archive` and `restore` fold their precondition and
 * change-detection into the mutating SQL, atomic with their Activity append; an
 * idempotent no-op changes nothing and appends no Activity.
 *
 * Error semantics (thrown as the typed errors in `habit-errors.ts`):
 *   - invalid input                → `HabitValidationError` (no data written)
 *   - unknown / cross-workspace id → `HabitNotFoundError`
 *   - check-in against an archive  → `HabitArchivedError`
 *   - concurrent conflicting write → `HabitConflictError`
 *   - bad cursor                   → `InvalidHabitCursorError`
 *   - storage failure              → `HabitStorageError`
 */
export interface HabitRepository {
  /**
   * Create a Habit from a title and a schedule, plus optional notes and
   * relationships. Atomically writes the entity, its detail row, its FIRST
   * schedule version (effective from the owner's calendar day) and
   * `habit.created`.
   */
  create(input: CreateHabitInput): Promise<Habit>;

  /**
   * Read one Habit by id within the bound workspace, with its complete schedule
   * chain and resolved Goal/Area context. Returns `null` when there is no
   * matching Habit here — including when it exists in another workspace, which
   * is indistinguishable from "does not exist". Soft-deleted Habits are excluded
   * unless `options.includeDeleted`. Archived Habits ARE returned.
   */
  get(id: string, options?: GetHabitOptions): Promise<Habit | null>;

  /**
   * List Habits in the bound workspace, filtered by lifecycle `status` and an
   * optional text `query`, using bounded cursor pagination ordered
   * deterministically newest-first by `(createdAt, id)`.
   *
   * A FIXED number of statements whatever the page holds: the Habits themselves
   * with their Goal/Area joins, then every schedule version for the page's ids.
   * Never one query per row.
   */
  list(input?: ListHabitsInput): Promise<HabitPage>;

  /**
   * Update a Habit's title, notes and relationships. Only fields present in
   * `changes` are touched; a change that normalises to the current value is an
   * idempotent no-op (no `updatedAt` churn, no Activity). The SCHEDULE is
   * deliberately not updatable here — see `changeSchedule`.
   */
  update(id: string, changes: UpdateHabitInput): Promise<HabitChangeResult>;

  /**
   * Change a Habit's cadence FROM TODAY, preserving what every earlier day
   * expected.
   *
   * The current version is closed at yesterday and a new one opened at the
   * owner's calendar day, so no historical figure is recomputed. When the
   * current version already begins today (the owner corrected a cadence they set
   * this morning) it is amended in place rather than leaving a zero-length
   * version behind. Requesting the schedule that is already in force does
   * nothing at all.
   */
  changeSchedule(
    id: string,
    schedule: HabitSchedule,
  ): Promise<HabitScheduleChangeResult>;

  /**
   * Archive a Habit: set `archivedAt`, advance the detail `updatedAt` and append
   * `habit.archived`, atomically. Archiving an already-archived Habit is a no-op.
   * Archiving never deletes a completion — history is kept.
   */
  archive(id: string): Promise<HabitLifecycleResult>;

  /** Restore an archived Habit to active, appending `habit.restored`. */
  restore(id: string): Promise<HabitLifecycleResult>;

  /**
   * Record a check-in for one owner-local calendar date.
   *
   * Idempotent by construction: the completion's primary key IS
   * `(workspace, habit, date)`, so a second call — including a genuinely
   * concurrent one — writes nothing and reports `already_recorded` rather than
   * arbitrating in application code. A future date is refused by validation; an
   * archived Habit is refused by the statement's own guard.
   */
  checkIn(id: string, dateIso: string): Promise<HabitCheckInResult>;

  /** Remove a check-in for one owner-local calendar date. Idempotent. */
  undoCheckIn(id: string, dateIso: string): Promise<HabitCheckInResult>;

  /**
   * Every completion for a SET of Habits inside a date window, in ONE bounded,
   * workspace-scoped statement. The window and the id set are both bounded by
   * the caller; the result is ordered `(habitId, completedOn)`.
   */
  listCompletionsInRange(
    input: HabitCompletionRangeInput,
  ): Promise<readonly HabitCompletion[]>;

  /**
   * The active Habits attached to a set of Goals or Areas, for the SUPPORTING
   * sections those records draw.
   *
   * One statement for the whole set, so a Goal gallery never becomes a query per
   * card. The returned Habits carry their schedule chain, so the caller can say
   * what each one asks for without a second read.
   */
  listSupportingHabits(input: {
    readonly anchorIds: readonly string[];
    readonly relation: "goal" | "area";
    readonly limitPerAnchor?: number;
  }): Promise<ReadonlyMap<string, readonly Habit[]>>;
}
