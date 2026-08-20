/**
 * TODAY-03 Waiting — task-domain identifiers and bounds.
 *
 * The trusted kernel constants for the Waiting workflow: the reserved EntityLink
 * type a task uses to record an ENTITY it is waiting on, the closed set of entity
 * types a task may wait on, and the free-text subject length bound. These are
 * kernel-owned literals (like the spine's structural link identifiers), never
 * caller data — the TaskRepository writes `task.waiting_on` directly and
 * atomically, so the generic EntityLink repository REFUSES it (see
 * {@link RESERVED_TASK_LINK_TYPES}).
 */

/**
 * The reserved link type that records the ENTITY a task is waiting on (directed
 * task → subject). One active link per task (a partial unique index enforces it).
 * Only the TaskRepository mutates it, atomically alongside the `waiting_since`
 * state, so the stored waiting state and the link can never diverge.
 */
export const TASK_WAITING_ON = "task.waiting_on";

/*
 * TASKS-12 — the dependency link type is defined beside the dependency model
 * (`task-dependencies.ts`) and re-exported here only so the reserved-type set
 * below can name it. Its meaning, its bounds and the reason it is an EntityLink
 * rather than a new table all live with the model.
 */
export { TASK_BLOCKS } from "./task-dependencies";
import { TASK_BLOCKS } from "./task-dependencies";

/**
 * The closed set of entity types a task may wait ON. A task can wait on a Person
 * (delegation), a Project/Goal/Area (a body of work reaching a state) or another
 * Task (a dependency) — but never a Note, Meeting or the task itself. Anything not
 * in this set is rejected server-side.
 */
export const WAITING_TARGET_TYPES = [
  "person",
  "project",
  "goal",
  "area",
  "task",
] as const;

export type WaitingTargetType = (typeof WAITING_TARGET_TYPES)[number];

/** True when `type` is an allowed waiting-target entity type. */
export function isWaitingTargetType(type: string): type is WaitingTargetType {
  return (WAITING_TARGET_TYPES as readonly string[]).includes(type);
}

/**
 * The reserved task-domain link types the generic EntityLink repository must
 * refuse (mirroring the spine's `RESERVED_SPINE_LINK_TYPES`). Only the
 * TaskRepository may create or clear a `task.waiting_on` link, so waiting metadata
 * always stays consistent with the `waiting_since` state and can only ever attach
 * to a task anchor.
 */
export const RESERVED_TASK_LINK_TYPES: ReadonlySet<string> = new Set([
  TASK_WAITING_ON,
  // TASKS-12 — a dependency edge. Reserved for exactly the reason waiting is:
  // `task.blocks` carries invariants the generic link repository knows nothing
  // about (Task-only endpoints, no cycles, a bounded fan-in and fan-out), and the
  // TaskRepository enforces all of them inside the write. A link the picker could
  // create would be a second, unchecked way to build the graph.
  TASK_BLOCKS,
]);

/** True when `type` is a reserved task-domain link type. */
export function isReservedTaskLinkType(type: string): boolean {
  return RESERVED_TASK_LINK_TYPES.has(type);
}

/**
 * Maximum length (Unicode code points) of a free-text waiting subject. Generous
 * enough for a real phrase ("finance sign-off on the Q3 budget") but bounded so a
 * subject stays a short label, never a document.
 */
export const WAITING_NOTE_MAX_LENGTH = 200;

/** Activity: a task entered the waiting state (was not waiting before). */
export const TASK_WAITING_STARTED = "task.waiting_started";

/** Activity: an already-waiting task's subject was replaced. */
export const TASK_WAITING_CHANGED = "task.waiting_changed";

/** Activity: a task's waiting state was cleared (returned to normal work). */
export const TASK_WAITING_CLEARED = "task.waiting_cleared";

/**
 * TODAY-04 Planning — the planning Activity types. Planning is the deliberate use
 * of the EXISTING scheduled date as the owner's commitment ("I intend to work on
 * this today"); these three types make planning changes legible in the shared
 * Timeline WITHOUT a second history model. Payloads carry only the non-sensitive
 * calendar dates (safe to log) — never free text.
 */

/** Activity: a task was planned (a scheduled date set where there was none). */
export const TASK_PLANNED = "task.planned";

/** Activity: a planned task was moved to a different scheduled date. */
export const TASK_RESCHEDULED = "task.rescheduled";

/** Activity: a task's plan (scheduled date) was removed. */
export const TASK_PLAN_CLEARED = "task.plan_cleared";

/**
 * TASKS-04 Recurrence — the ONE structural event a repeating Task adds (ADR-062).
 *
 * Setting, changing or removing a recurrence RULE is an ordinary task-detail edit and
 * uses the existing `entity.updated` event (no per-field event types). Creating the
 * next OCCURRENCE is different: it brings a new Task into existence because another
 * was completed, and the timeline has to be able to say so. Its two subjects are the
 * completed occurrence (`subject`) and the occurrence it produced (`successor`); its
 * payload carries only calendar dates and the series identity — never free text.
 */
export const TASK_RECURRENCE_OCCURRENCE_CREATED =
  "task.recurrence_occurrence_created";

/**
 * TASKS-04 — Activity appended when undoing a completion WITHDRAWS the successor that
 * completion had created (the safe-undo path). Subjects mirror the creation event, so
 * a series reads as a coherent pair of entries rather than a silent disappearance.
 */
export const TASK_RECURRENCE_OCCURRENCE_WITHDRAWN =
  "task.recurrence_occurrence_withdrawn";

/**
 * TASKS-07 — Activity appended when an occurrence is SKIPPED: moved forward to the
 * series' next date without being completed.
 *
 * It is deliberately its own event rather than a completion or a reschedule. Marking
 * work "done" that was not done corrupts the one record the owner relies on, and a
 * bare `task.rescheduled` would not say the series advanced. The payload carries the
 * date skipped from, the date skipped to and the series identity — calendar data
 * only, never free text.
 */
export const TASK_RECURRENCE_OCCURRENCE_SKIPPED =
  "task.recurrence_occurrence_skipped";

/**
 * TASKS-01 — the four planning dimensions (Time Sector, priority, commitment,
 * workflow status) and delegation are edited through the SAME atomic write path as
 * every other task-detail field and recorded with the ONE existing `entity.updated`
 * Activity event, whose payload already carries per-field before/after `changes`
 * (ADR-043 §8 — no second history model, no per-dimension event type). Bulk field
 * mutations emit one guarded `entity.updated` per task that actually changed.
 */

/** The maximum length (code points) of a plain-text delegatee label. */
export const DELEGATE_TO_MAX_LENGTH = 200;

/** The maximum length (code points) of a plain-text delegation note. */
export const DELEGATION_NOTE_MAX_LENGTH = 500;

/**
 * The maximum number of tasks a single bulk-planning operation may touch. Bulk
 * planning is ATOMIC (one transaction) and calm — a bound keeps the batch small
 * and predictable rather than an unbounded "plan everything".
 */
export const MAX_PLAN_BATCH_SIZE = 100;

/**
 * TASKS-12 — the TWO dependency events, and the two that deliberately do not
 * exist.
 *
 * Adding and removing a dependency are DECISIONS the owner made about how work
 * relates, so they belong in the record's history: each carries the blocked Task
 * (`subject`) and the blocker (`blocker`) as its two subjects, so the entry reads
 * as the relationship it is and appears on both Tasks' timelines. The payload
 * carries the two ids and nothing else — never a title, never free text.
 *
 * There is NO `task.blocked` and NO `task.unblocked`. Blocked state is DERIVED
 * from the edges plus the blockers' completion (see `task-dependencies.ts`), so a
 * Task becoming unblocked is not an event that happened to it — it is a
 * consequence of `task.completed` on another Task, which the timeline already
 * records. Logging the consequence as well would put two entries in history for
 * one act, and would leave DalyHub with derived facts written into an append-only
 * log that could then disagree with the data they were derived from. The decision
 * and its reasoning are recorded in `TASKS_MODULE.md` and ADR-106.
 */
export const TASK_DEPENDENCY_ADDED = "task.dependency_added";

/** Activity: a dependency was removed. See {@link TASK_DEPENDENCY_ADDED}. */
export const TASK_DEPENDENCY_REMOVED = "task.dependency_removed";
