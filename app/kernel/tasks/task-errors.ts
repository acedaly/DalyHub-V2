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
export type TaskErrorCode = "validation" | "not_found" | "storage" | "corrupt";

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
