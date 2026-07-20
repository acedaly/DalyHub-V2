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
