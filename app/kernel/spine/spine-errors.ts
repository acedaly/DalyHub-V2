/**
 * FND-07 Spine kernel — domain errors.
 *
 * The SpineRepository signals failure with these explicit, typed errors rather
 * than leaking storage internals. Messages are safe to surface: they never
 * include SQL text, query parameters, table names beyond what is unavoidable,
 * database paths, bindings, environment values or another workspace's record
 * existence (AGENTS.md §17, ADR-014 §20). The D1 adapter catches raw storage
 * failures and re-raises them as `SpineStorageError` with a generic message.
 *
 * Cross-workspace safety: a record (or parent) that lives in another workspace —
 * or does not exist at all — is INDISTINGUISHABLE. `SpineNotFoundError` and
 * `SpineParentUnavailableError` are used for both, disclosing nothing about other
 * workspaces.
 */

import type { AreaDependencyCounts } from "./spine";

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type SpineErrorCode =
  | "validation"
  | "not_found"
  | "wrong_kind"
  | "parent_unavailable"
  | "invalid_parent_kind"
  | "has_active_children"
  | "has_dependents"
  | "area_completion"
  | "invalid_cursor"
  | "conflict"
  | "storage"
  | "corrupt";

/** Base class for every kernel spine error. */
export abstract class SpineError extends Error {
  abstract readonly code: SpineErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields a validation failure can point at. */
export type SpineValidationField =
  | "id"
  | "title"
  | "kind"
  | "parent"
  | "parentId"
  | "childKind"
  | "limit"
  | "cursor";

/** A caller-supplied input that failed kernel-boundary validation. */
export class SpineValidationError extends SpineError {
  readonly code = "validation" as const;
  readonly field: SpineValidationField;

  constructor(field: SpineValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * No spine record with the given id exists in the bound workspace. Used for a
 * nonexistent id AND a cross-workspace id — the two are never distinguished.
 */
export class SpineNotFoundError extends SpineError {
  readonly code = "not_found" as const;

  constructor(message = "Spine record not found") {
    super(message);
  }
}

/** The record exists but is not the kind the operation requires (e.g. asking to
 * complete an Area, or treating a Task as a container). */
export class SpineWrongKindError extends SpineError {
  readonly code = "wrong_kind" as const;

  constructor(
    message = "Spine record is of the wrong kind for this operation",
  ) {
    super(message);
  }
}

/**
 * The requested parent is unavailable: it does not exist, is soft-deleted, or
 * lives in another workspace. These cases are DELIBERATELY not distinguished, so
 * nothing about other workspaces is disclosed. This is also raised when a child
 * cannot be restored because its retained parent is no longer active.
 */
export class SpineParentUnavailableError extends SpineError {
  readonly code = "parent_unavailable" as const;

  constructor(message = "The requested parent is unavailable") {
    super(message);
  }
}

/** The requested parent exists but is not a permitted parent kind for the child
 * (e.g. a Task directly under a Goal, or a Project under a Project). */
export class SpineInvalidParentKindError extends SpineError {
  readonly code = "invalid_parent_kind" as const;

  constructor(message = "The requested parent kind is not permitted here") {
    super(message);
  }
}

/** A container cannot be soft-deleted while it still has active children. */
export class SpineHasActiveChildrenError extends SpineError {
  readonly code = "has_active_children" as const;

  constructor(
    message = "This record has active children and cannot be deleted",
  ) {
    super(message);
  }
}

/**
 * A permanent (hard) deletion was refused because the record still has dependent
 * records — an Area that still has any active link referencing it: child
 * Goals/Projects/Tasks, or a linked Note/Diary/other entity whose link would
 * become invalid. The dependents must be moved, archived or deleted first. Unlike
 * `SpineHasActiveChildrenError` (soft-delete of a container with active children,
 * a reversible transition), this gates the irreversible purge. Carries the
 * blocking counts so the caller can explain what remains without a second query.
 */
export class SpineHasDependentsError extends SpineError {
  readonly code = "has_dependents" as const;
  /** The blocking counts, when the adapter could recompute them cheaply after the
   * guarded write missed — so a caller can explain what remains without re-query. */
  readonly counts?: AreaDependencyCounts;

  constructor(
    counts?: AreaDependencyCounts,
    message = "This area still has dependent records and cannot be permanently deleted",
  ) {
    super(message);
    this.counts = counts;
  }
}

/** An Area was asked to complete. Areas never complete (ADR-014 §4.5). */
export class SpineAreaCompletionError extends SpineError {
  readonly code = "area_completion" as const;

  constructor(message = "Areas cannot be completed") {
    super(message);
  }
}

/** A pagination cursor could not be decoded or does not match its query scope. */
export class InvalidSpineCursorError extends SpineError {
  readonly code = "invalid_cursor" as const;

  constructor(message = "Invalid spine pagination cursor") {
    super(message);
  }
}

/**
 * A concurrency conflict that could not be reconciled safely — e.g. a conditional
 * mutation matched no row and the re-read produced no explaining state. Reserved
 * for genuinely unexpected races (the ordinary no-op cases are defined outcomes,
 * not errors).
 */
export class SpineConflictError extends SpineError {
  readonly code = "conflict" as const;

  constructor(
    message = "The spine mutation could not be reconciled",
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
export class SpineStorageError extends SpineError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * A stored spine row was structurally impossible (e.g. a `spine_records.kind` that
 * does not agree with its `entities.type`, which the schema's composite foreign
 * key is designed to make unreachable). Surfaced as a safe, generic error rather
 * than silently coercing corrupt data through the adapter.
 */
export class CorruptSpineRecordError extends SpineError {
  readonly code = "corrupt" as const;

  constructor(message = "A stored spine record is corrupt") {
    super(message);
  }
}
