/**
 * FND-04 EntityLinks kernel — domain errors.
 *
 * Link operations signal failure with these explicit, typed errors rather than
 * leaking storage internals. Messages are safe to surface: they never include
 * SQL text, query parameters, database paths, bindings or other sensitive
 * internals (see AGENTS.md §17). The D1 adapter catches raw storage failures and
 * re-raises them as `EntityLinkStorageError` with a generic message.
 *
 * A note on cross-workspace safety (ADR-011): an endpoint that lives in another
 * workspace — or does not exist at all — must be INDISTINGUISHABLE. Both surface
 * as `EntityLinkEndpointNotFoundError`; nothing ever reveals that an entity
 * exists elsewhere. Likewise a link in another workspace appears simply "not
 * found".
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type EntityLinkErrorCode =
  | "validation"
  | "endpoint_not_found"
  | "not_found"
  | "invalid_cursor"
  | "invalid_state"
  | "conflict"
  | "storage";

/** Base class for every kernel entity-link error. */
export abstract class EntityLinkError extends Error {
  abstract readonly code: EntityLinkErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields a validation failure can point at. */
export type EntityLinkValidationField =
  | "id"
  | "sourceEntityId"
  | "targetEntityId"
  | "type"
  | "limit"
  | "cursor"
  | "direction"
  | "selfLink";

/** A caller-supplied input that failed kernel-boundary validation. */
export class EntityLinkValidationError extends EntityLinkError {
  readonly code = "validation" as const;
  readonly field: EntityLinkValidationField;

  constructor(field: EntityLinkValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * A referenced endpoint entity is unavailable for the requested operation: it
 * does not exist, is soft-deleted, or lives in another workspace. These cases
 * are DELIBERATELY not distinguished — a cross-workspace endpoint is reported
 * exactly like a nonexistent one, disclosing nothing about other workspaces.
 */
export class EntityLinkEndpointNotFoundError extends EntityLinkError {
  readonly code = "endpoint_not_found" as const;

  constructor(message = "A linked entity is unavailable") {
    super(message);
  }
}

/** No link with the given id exists in the bound workspace. */
export class EntityLinkNotFoundError extends EntityLinkError {
  readonly code = "not_found" as const;

  constructor(message = "Entity link not found") {
    super(message);
  }
}

/** A pagination cursor could not be decoded or does not match its query scope. */
export class InvalidEntityLinkCursorError extends EntityLinkError {
  readonly code = "invalid_cursor" as const;

  constructor(message = "Invalid entity-link pagination cursor") {
    super(message);
  }
}

/** A requested lifecycle transition is not valid from the current state. */
export class EntityLinkInvalidStateError extends EntityLinkError {
  readonly code = "invalid_state" as const;

  constructor(message: string) {
    super(message);
  }
}

/**
 * A duplicate-relationship conflict that could not be reconciled safely. The
 * ordinary duplicate cases (`already_exists`, `restored`) are NOT errors — they
 * are defined `create` outcomes. This error is reserved for the rare case where
 * the uniqueness backstop fired but the conflicting row could not then be read
 * back (e.g. it vanished between attempts), so no safe result can be returned.
 */
export class EntityLinkConflictError extends EntityLinkError {
  readonly code = "conflict" as const;

  constructor(
    message = "The relationship could not be reconciled",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * The underlying storage failed. The original cause is attached (via `cause`)
 * for server-side logging but is never rendered into the public message, so raw
 * database details do not escape the kernel boundary.
 */
export class EntityLinkStorageError extends EntityLinkError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
