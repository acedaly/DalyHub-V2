/**
 * FND-05 Activity kernel — domain errors.
 *
 * Activity operations signal failure with these explicit, typed errors rather
 * than leaking storage internals. Messages are safe to surface: they never
 * include SQL text, query parameters, database paths, bindings, environment
 * values or another workspace's record existence (AGENTS.md §17). The D1 adapter
 * catches raw storage failures and re-raises them as `ActivityStorageError` with
 * a generic message.
 *
 * Cross-workspace safety (ADR-010/ADR-012): an entity or event that lives in
 * another workspace — or does not exist at all — must be INDISTINGUISHABLE. A
 * cross-workspace anchor entity surfaces exactly like a nonexistent one; nothing
 * ever reveals that a record exists elsewhere.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type ActivityErrorCode =
  | "validation"
  | "not_found"
  | "subject_unavailable"
  | "invalid_cursor"
  | "payload"
  | "conflict"
  | "storage";

/** Base class for every kernel Activity error. */
export abstract class ActivityError extends Error {
  abstract readonly code: ActivityErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields an Activity validation failure can point at. */
export type ActivityValidationField =
  | "id"
  | "type"
  | "actorType"
  | "actorId"
  | "subjectEntityId"
  | "subjectRole"
  | "subjects"
  | "payload"
  | "limit"
  | "cursor";

/** A value that failed kernel-boundary validation. */
export class ActivityValidationError extends ActivityError {
  readonly code = "validation" as const;
  readonly field: ActivityValidationField;

  constructor(field: ActivityValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/** No Activity event with the given id exists in the bound workspace. */
export class ActivityNotFoundError extends ActivityError {
  readonly code = "not_found" as const;

  constructor(message = "Activity event not found") {
    super(message);
  }
}

/**
 * A referenced subject entity is unavailable: it does not exist or lives in
 * another workspace. These cases are DELIBERATELY not distinguished — a
 * cross-workspace anchor is reported exactly like a nonexistent one, disclosing
 * nothing about other workspaces. A soft-deleted anchor is NOT unavailable: a
 * deleted entity's Timeline remains queryable (ADR-012).
 */
export class ActivitySubjectUnavailableError extends ActivityError {
  readonly code = "subject_unavailable" as const;

  constructor(message = "The referenced entity is unavailable") {
    super(message);
  }
}

/** A pagination cursor could not be decoded or does not match its query scope. */
export class InvalidActivityCursorError extends ActivityError {
  readonly code = "invalid_cursor" as const;

  constructor(message = "Invalid activity pagination cursor") {
    super(message);
  }
}

/**
 * An Activity payload could not be serialised for storage (it contained an
 * unsupported value, exceeded the size/depth limits, or was cyclic) or a stored
 * payload could not be parsed back into a valid `ActivityPayload` (corrupt stored
 * JSON). Corrupt stored JSON becomes THIS typed error rather than crashing a read.
 */
export class ActivityPayloadError extends ActivityError {
  readonly code = "payload" as const;

  constructor(
    message = "Activity payload could not be processed",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * An atomic mutation-and-append could not be completed consistently — for
 * example the domain mutation would otherwise have succeeded but the Activity
 * append conflicted, or a reconciliation after a concurrent race could not be
 * resolved safely. The whole operation is rolled back; no partial state persists.
 */
export class ActivityConflictError extends ActivityError {
  readonly code = "conflict" as const;

  constructor(
    message = "The activity could not be recorded consistently",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * The underlying storage failed. The original cause is attached (via `cause`) for
 * server-side logging but is never rendered into the public message, so raw
 * database details do not escape the kernel boundary.
 */
export class ActivityStorageError extends ActivityError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
