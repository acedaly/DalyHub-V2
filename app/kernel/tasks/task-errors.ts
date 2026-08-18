/**
 * TODAY-02 Tasks kernel — domain errors.
 *
 * The TaskRepository signals failure with these explicit, typed errors rather
 * than leaking storage internals. Messages are safe to surface: they never
 * include SQL text, query parameters, database paths, bindings, environment
 * values or another workspace's record existence (AGENTS.md §17, ADR-028). The D1
 * adapter catches raw storage failures and re-raises them as `TaskStorageError`
 * with a generic message.
 *
 * Cross-workspace safety: a task that lives in another workspace — or does not
 * exist at all — is INDISTINGUISHABLE. `TaskNotFoundError` is used for both,
 * disclosing nothing about other workspaces.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type TaskErrorCode =
  | "validation"
  | "not_found"
  | "storage"
  | "corrupt"
  | "project_archived"
  | "checklist_item_not_found"
  | "checklist_full";

/** Base class for every kernel task error. */
export abstract class TaskError extends Error {
  abstract readonly code: TaskErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields a validation failure can point at. */
export type TaskValidationField =
  | "id"
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "scheduledDate"
  | "description"
  | "limit"
  | "waitingTarget"
  | "waitingTargetId"
  | "waitingNote"
  // TASKS-01 (ADR-043) additive fields.
  | "timeSector"
  | "commitmentState"
  | "delegateTo"
  | "delegatedOn"
  | "followUpOn"
  | "delegationNote"
  | "view"
  | "sort"
  | "cursor"
  | "dimension"
  // TASKS-03 (collection experience) additive filter/sort fields.
  | "direction"
  | "dueState"
  | "plannedState"
  | "parentKind"
  | "recencyWindow"
  | "completedVisibility"
  | "group"
  | "savedView"
  | "savedViewName"
  | "recurrence"
  // TASKS-13 (checklists) additive fields. A checklist item is not a Task, so
  // its rejections are named after the checklist rather than borrowing "title"
  // and "id" from the Task that owns it -- a form showing both must be able to
  // put each message beside the control it belongs to.
  | "checklistTitle"
  | "checklistItem"
  | "checklistOrder"
  | "checklist"
  /**
   * The mutation was rejected because the task is completed (TODAY-04): planning
   * applies to open work only. The id/input are valid — the STATE is not — so this
   * is a validation-family rejection, not a not-found.
   */
  | "completed";

/** A caller-supplied input that failed kernel-boundary validation. */
export class TaskValidationError extends TaskError {
  readonly code = "validation" as const;
  readonly field: TaskValidationField;

  constructor(field: TaskValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * No task with the given id exists (and is active, unless deleted was requested)
 * in the bound workspace. Used for a nonexistent id, a soft-deleted id where an
 * active one was required, AND a cross-workspace id — never distinguished.
 */
export class TaskNotFoundError extends TaskError {
  readonly code = "not_found" as const;

  constructor(message = "Task not found") {
    super(message);
  }
}

/**
 * The underlying storage failed. The original cause is attached (via `cause`) for
 * server-side logging but is never rendered into the public message, so raw
 * database details do not escape the kernel boundary.
 */
export class TaskStorageError extends TaskError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * A stored task row was structurally impossible (e.g. a `task_details` row whose
 * status is outside the closed set the schema CHECK is designed to make
 * unreachable). Surfaced as a safe, generic error rather than silently coercing
 * corrupt data through the adapter.
 */
export class CorruptTaskRecordError extends TaskError {
  readonly code = "corrupt" as const;

  constructor(message = "A stored task record is corrupt") {
    super(message);
  }
}

/**
 * The mutation was rejected because this Task's direct parent PROJECT is
 * archived (PROJ-05 / ADR-037) — an archived Project is read-only until
 * restored. The task itself is perfectly valid; the PARENT's state blocks the
 * write, so this is its own error family rather than `TaskValidationError` or
 * `TaskNotFoundError`.
 */
export class TaskProjectArchivedError extends TaskError {
  readonly code = "project_archived" as const;

  constructor(
    message = "This task's project is archived and read-only — restore it to make changes",
  ) {
    super(message);
  }
}

/**
 * TASKS-13 — no checklist item with the given id belongs to the given Task in
 * the bound workspace.
 *
 * Its own error rather than `TaskNotFoundError` because the two say different
 * things to the surface: the Task is right there and still open, and it is the
 * ITEM that has gone (deleted on another device, or named by a stale id). Like
 * every other not-found in this family, a missing item, an item belonging to a
 * DIFFERENT Task and an item in another workspace are indistinguishable.
 */
export class TaskChecklistItemNotFoundError extends TaskError {
  readonly code = "checklist_item_not_found" as const;

  constructor(message = "That checklist item is no longer there") {
    super(message);
  }
}

/**
 * TASKS-13 — the Task's checklist already holds the maximum number of items.
 *
 * A refusal with a reason, never a silent drop: the owner is told the checklist
 * is full so they can decide what the work actually is, rather than typing an
 * item that quietly does not appear.
 */
export class TaskChecklistFullError extends TaskError {
  readonly code = "checklist_full" as const;

  constructor(limit: number) {
    super(
      `A checklist holds at most ${limit} items. Remove one, or make this its own Task.`,
    );
  }
}
