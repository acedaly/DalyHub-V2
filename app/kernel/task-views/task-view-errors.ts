/**
 * TASKS-03 — the saved-view error family. Mirrors the task/preferences families:
 * a typed base, a validation error carrying the offending field, a not-found that
 * never distinguishes "wrong workspace" from "does not exist", and a storage error
 * that keeps its cause off the wire.
 */

/** Base class for every saved-view failure. */
export class TaskViewError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The field a saved-view validation failure refers to. */
export type TaskViewValidationField = "name" | "config" | "id" | "ownerId";

/** The input crossing the saved-view boundary was invalid. Nothing was written. */
export class TaskViewValidationError extends TaskViewError {
  readonly field: TaskViewValidationField;

  constructor(field: TaskViewValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * No such saved view exists for this owner in this workspace. Deliberately does
 * NOT distinguish a nonexistent id from another owner's or another workspace's —
 * that distinction would be an enumeration oracle.
 */
export class TaskViewNotFoundError extends TaskViewError {
  constructor(message = "Saved view not found") {
    super(message);
  }
}

/** The owner already has a saved view with this name (names are unique per owner). */
export class TaskViewNameTakenError extends TaskViewError {
  constructor(message = "You already have a view with that name") {
    super(message);
  }
}

/** The owner has reached the saved-view limit. */
export class TaskViewLimitError extends TaskViewError {
  constructor(message: string) {
    super(message);
  }
}

/** The underlying storage failed. The cause is attached but never surfaced to a user. */
export class TaskViewStorageError extends TaskViewError {
  constructor(options?: { cause?: unknown }) {
    super("Saved view storage failed", options);
  }
}
