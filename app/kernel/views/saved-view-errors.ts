/**
 * X-02 — the saved-view error family, shared by every saved-view KIND.
 *
 * Generalised from TASKS-03's family (whose names remain exported as aliases from
 * `~/kernel/task-views`, so Tasks callers are unchanged and `instanceof` still
 * matches — these are the SAME classes, not parallel ones).
 *
 * Mirrors the task/preferences families: a typed base, a validation error carrying
 * the offending field, a not-found that never distinguishes "wrong workspace" from
 * "does not exist", and a storage error that keeps its cause off the wire.
 */

/** Base class for every saved-view failure. */
export class SavedViewError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The field a saved-view validation failure refers to. */
export type SavedViewValidationField = "name" | "config" | "id" | "ownerId";

/** The input crossing the saved-view boundary was invalid. Nothing was written. */
export class SavedViewValidationError extends SavedViewError {
  readonly field: SavedViewValidationField;

  constructor(field: SavedViewValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * No such saved view exists for this owner in this workspace. Deliberately does
 * NOT distinguish a nonexistent id from another owner's or another workspace's —
 * that distinction would be an enumeration oracle.
 */
export class SavedViewNotFoundError extends SavedViewError {
  constructor(message = "Saved view not found") {
    super(message);
  }
}

/** The owner already has a saved view with this name (names are unique per owner). */
export class SavedViewNameTakenError extends SavedViewError {
  constructor(message = "You already have a view with that name") {
    super(message);
  }
}

/** The owner has reached the saved-view limit. */
export class SavedViewLimitError extends SavedViewError {
  constructor(message: string) {
    super(message);
  }
}

/** The underlying storage failed. The cause is attached but never surfaced to a user. */
export class SavedViewStorageError extends SavedViewError {
  constructor(options?: { cause?: unknown }) {
    super("Saved view storage failed", options);
  }
}
