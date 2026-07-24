/**
 * DIARY-01A Diary kernel — the typed error family.
 *
 * Every failure mode a caller must distinguish is a distinct, `code`-bearing
 * error, so route/loader code branches on the kernel contract rather than
 * parsing messages. Messages never echo caller content (no body text, no ids),
 * keeping the Diary — DalyHub's most sensitive data alongside People — from
 * leaking through error strings (AGENTS.md §17).
 */

/** The discriminants of the Diary error family. */
export type DiaryErrorCode =
  "validation" | "not_found" | "conflict" | "storage";

/** Base class for every Diary kernel error. */
export abstract class DiaryError extends Error {
  abstract readonly code: DiaryErrorCode;
}

/** The fields validation can reject. */
export type DiaryValidationField =
  | "id"
  | "entryType"
  | "title"
  | "body"
  | "occurredAt"
  | "timezone"
  | "source"
  | "limit"
  | "cursor"
  | "order"
  | "range";

/** A supplied value failed boundary validation. */
export class DiaryValidationError extends DiaryError {
  readonly code = "validation" as const;
  readonly field: DiaryValidationField;

  constructor(field: DiaryValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.name = "DiaryValidationError";
    this.field = field;
  }
}

/**
 * No active Diary Entry with the given id exists in the bound workspace — used
 * for a nonexistent id, a soft-deleted entry, a wrong-type id AND a
 * cross-workspace id; the cases are never distinguished (fails closed,
 * discloses nothing).
 */
export class DiaryNotFoundError extends DiaryError {
  readonly code = "not_found" as const;
  constructor() {
    super("Diary entry not found");
    this.name = "DiaryNotFoundError";
  }
}

/** A concurrent change prevented the mutation from completing cleanly. */
export class DiaryConflictError extends DiaryError {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
    this.name = "DiaryConflictError";
  }
}

/** An opaque storage failure. Never carries a database detail. */
export class DiaryStorageError extends DiaryError {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A diary storage error occurred.", options);
    this.name = "DiaryStorageError";
  }
}

/** A supplied Timeline cursor was not one this kernel issued for this scope. */
export class InvalidDiaryCursorError extends DiaryValidationError {
  constructor() {
    super("cursor", "is not a valid cursor for this query");
    this.name = "InvalidDiaryCursorError";
  }
}
