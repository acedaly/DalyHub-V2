/**
 * FND-02 Data kernel — domain errors.
 *
 * Repository operations signal failure with these explicit, typed errors rather
 * than leaking storage internals. Messages are safe to surface: they never
 * include SQL text, query parameters, database paths, bindings or other
 * sensitive internals (see AGENTS.md §17). The D1 adapter is responsible for
 * catching raw storage failures and re-raising them as `EntityStorageError`
 * with a generic message.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type EntityErrorCode =
  "validation" | "not_found" | "invalid_cursor" | "invalid_state" | "storage";

/** Base class for every kernel entity error. */
export abstract class EntityError extends Error {
  abstract readonly code: EntityErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields a validation failure can point at. */
export type EntityValidationField =
  "id" | "workspaceId" | "type" | "title" | "limit" | "cursor";

/** A caller supplied input that failed kernel-boundary validation. */
export class EntityValidationError extends EntityError {
  readonly code = "validation" as const;
  readonly field: EntityValidationField;

  constructor(field: EntityValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/** No entity with the given id exists in the given workspace. */
export class EntityNotFoundError extends EntityError {
  readonly code = "not_found" as const;

  constructor(message = "Entity not found") {
    super(message);
  }
}

/** A pagination cursor could not be decoded or is malformed. */
export class InvalidCursorError extends EntityError {
  readonly code = "invalid_cursor" as const;

  constructor(message = "Invalid pagination cursor") {
    super(message);
  }
}

/** A requested lifecycle transition is not valid from the current state. */
export class InvalidStateTransitionError extends EntityError {
  readonly code = "invalid_state" as const;

  constructor(message: string) {
    super(message);
  }
}

/**
 * The underlying storage failed. The original cause is attached (via `cause`)
 * for server-side logging but is never rendered into the public message, so raw
 * database details do not escape the kernel boundary.
 */
export class EntityStorageError extends EntityError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
