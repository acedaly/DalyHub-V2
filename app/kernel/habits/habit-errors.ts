/**
 * HABITS-01 Habits kernel — the typed error family.
 *
 * The `HabitRepository` fails only through these typed errors, so callers branch
 * on `instanceof` / `.code` / `.field` and never parse a message string. A
 * message never echoes caller-supplied content. `HabitNotFoundError`
 * deliberately conflates missing / soft-deleted / wrong-type / cross-workspace
 * so it never discloses cross-workspace existence (fails closed).
 */

/** The closed set of Habit error codes. */
export type HabitErrorCode =
  "validation" | "not_found" | "conflict" | "storage";

/** The base class for every Habits error; sets `name` to the concrete class. */
export abstract class HabitError extends Error {
  abstract readonly code: HabitErrorCode;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The validatable Habit fields (used to route field-level form errors). */
export type HabitValidationField =
  | "id"
  | "title"
  | "notes"
  | "schedule"
  | "weekdays"
  | "timesPerWeek"
  | "goalId"
  | "areaId"
  | "date"
  | "limit"
  | "cursor"
  | "query"
  | "status"
  | "range";

/** Invalid input that crossed the Habit boundary. No data is written. */
export class HabitValidationError extends HabitError {
  readonly code = "validation" as const;
  readonly field: HabitValidationField;
  constructor(field: HabitValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/** No matching Habit in the bound workspace (missing / deleted / wrong-type /
 * cross-workspace — indistinguishable, by design). */
export class HabitNotFoundError extends HabitError {
  readonly code = "not_found" as const;
  constructor() {
    super("Habit not found");
  }
}

/**
 * The requested change cannot be made to this Habit in its current state.
 *
 * The load-bearing case is an ARCHIVED Habit acquiring a completion: an archived
 * Habit is a behaviour the owner has put away, and a check-in against one would
 * silently change a consistency figure for a Habit that is no longer expected.
 * The database's own guard refuses it; this is how the refusal reaches a caller.
 */
export class HabitArchivedError extends HabitError {
  readonly code = "conflict" as const;
  constructor() {
    super("That habit is archived, so it can’t be checked in.");
  }
}

/** A concurrent write changed the record under this one. */
export class HabitConflictError extends HabitError {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn’t be completed. Please try again.");
  }
}

/** A storage-layer failure. Wraps the underlying cause without leaking it. */
export class HabitStorageError extends HabitError {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A habit storage error occurred.", options);
  }
}

/** A cursor that is not valid for the query it was presented to. */
export class InvalidHabitCursorError extends HabitValidationError {
  constructor() {
    super("cursor", "is not a valid cursor for this query");
  }
}
