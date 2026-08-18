/**
 * HABITS-01 Habits kernel — the shared, stable domain identifiers.
 *
 * A **Habit** is a behaviour the owner is trying to practise consistently. It is
 * NOT a recurring Task, and this distinction is the whole reason the module
 * exists (ADR-102):
 *
 *   - a recurring **Task** is an OBLIGATION. It has a due date, it can become
 *     overdue, it belongs to a Project, it counts towards a Project's progress
 *     and it appears in the planning queue until it is placed and finished;
 *   - a **Habit** is a BEHAVIOUR. It has a cadence rather than a deadline, it
 *     cannot be late, it never becomes an overdue Task, it never enters a Task
 *     count, and what it measures is CONSISTENCY over time.
 *
 * Consequently a Habit generates NO Task, ever. There is no occurrence row, no
 * daily materialisation and no hidden flag on a Task. A Habit's history is its
 * own `habit_completions` table, and nothing else in DalyHub reads it.
 *
 * A Habit is an ordinary `entities` row of type `habit` PLUS a `habit_details`
 * row (its notes and archive state), its effective-dated `habit_schedules`
 * versions, and its `habit_completions` check-ins. Habits are NOT part of the
 * Area → Goal → Project → Task spine (AGENTS.md §4) and add no `spine_records`
 * row — they sit ADJACENT to the spine and attach across it through EntityLinks
 * (ADR-002), exactly as People, Notes and Assets do.
 *
 * This module is intentionally dependency-light: plain string constants, readonly
 * sets and precise string-literal unions, importing no D1, Cloudflare, React or
 * storage types. Nothing here is a database enum — every identifier stays an
 * ordinary validated string (ADR-009/011/012), so the open Entity / EntityLink /
 * Activity contracts are unchanged. Habits simply RESERVES the `habit` entity
 * type for its own authoritative repository, exactly as People reserves `person`.
 */

/* -------------------------------------------------------------------------- */
/* Entity type                                                                */
/* -------------------------------------------------------------------------- */

/** The Habit entity type: a behaviour practised on a cadence. */
export const HABIT_ENTITY_TYPE = "habit";

/**
 * The entity types RESERVED for the `HabitRepository`. The generic Entity
 * repository must refuse to CREATE a record of one of these types (a Habit can
 * never exist without its `habit_details` row AND its first schedule version);
 * only the `HabitRepository` creates one, atomically. Rename, soft-delete and
 * restore of a `habit` entity stay generic (mirrors People's create-only
 * reservation).
 */
export const RESERVED_HABIT_ENTITY_TYPES: ReadonlySet<string> = new Set([
  HABIT_ENTITY_TYPE,
]);

/** True when `type` is the reserved `habit` entity type. */
export function isReservedHabitEntityType(type: string): boolean {
  return RESERVED_HABIT_ENTITY_TYPES.has(type);
}

/* -------------------------------------------------------------------------- */
/* Activity event types                                                       */
/* -------------------------------------------------------------------------- */

/** Activity event appended when a Habit is created. */
export const HABIT_CREATED = "habit.created";
/** Activity event appended when a Habit's notes change. */
export const HABIT_UPDATED = "habit.updated";
/** Activity event appended when a Habit's SCHEDULE changes (a new version). */
export const HABIT_SCHEDULE_CHANGED = "habit.schedule_changed";
/** Activity event appended when a Habit is archived (a reversible put-away). */
export const HABIT_ARCHIVED = "habit.archived";
/** Activity event appended when an archived Habit is restored to active. */
export const HABIT_RESTORED = "habit.restored";

/**
 * Every Habit-owned Activity event type, in a stable order.
 *
 * A CHECK-IN is deliberately absent, and that absence is a decision rather than
 * an omission (ADR-102 §7). A daily Habit produces ~365 check-ins a year, each
 * carrying one bit of information; appending every one to the ONE shared
 * Activity stream would drown the events that genuinely are the owner's history
 * — the same reasoning ADR-012 applies to calendar synchronisation and ADR-073
 * to the AI usage ledger. A Habit's own completion history is
 * `habit_completions`, which the record renders in full; the general timeline
 * keeps the five events above, each of which is the owner CHANGING the record.
 */
export const HABIT_ACTIVITY_TYPES = [
  HABIT_CREATED,
  HABIT_UPDATED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_ARCHIVED,
  HABIT_RESTORED,
] as const;

/* -------------------------------------------------------------------------- */
/* EntityLink types (Habits ↔ the intentional side of the spine)              */
/* -------------------------------------------------------------------------- */

/**
 * The two structural relationships a Habit owns. Direction is always
 * habit → target (the Habit is the link's `source`), matching
 * `goal.belongs_to_area`.
 *
 * They are EntityLinks rather than columns because DalyHub already has exactly
 * one relationship primitive and it fits (AGENTS.md §9.5): a link is
 * workspace-scoped, soft-deletable, bidirectionally queryable and already
 * records its own Activity, so "this Habit supports that Goal" is visible from
 * the Goal without the Goals module knowing Habits exist. A `habit_goal_id`
 * column plus a `goal_habits` join table would have been a second linking model
 * for a relationship the first one already expresses.
 *
 * A Habit may hold AT MOST ONE active link of each type — it belongs in one part
 * of a life and supports at most one outcome. That is a repository invariant,
 * not a schema one, exactly as a spine record's single structural parent is.
 */
export const HABIT_SUPPORTS_GOAL = "habit.supports_goal";
export const HABIT_BELONGS_TO_AREA = "habit.belongs_to_area";

/** Every Habit-owned EntityLink type, in a stable order. */
export const HABIT_LINK_TYPES = [
  HABIT_SUPPORTS_GOAL,
  HABIT_BELONGS_TO_AREA,
] as const;
