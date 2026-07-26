/**
 * PEOPLE-01 People kernel — the typed error family.
 *
 * The `PersonRepository` fails only through these typed errors, so callers branch
 * on `instanceof` / `.code` / `.field` and never parse a message string. Messages
 * NEVER echo caller-supplied content — People data is the most sensitive in the
 * system (AGENTS.md §5, §17), so an error may say a field is invalid but never
 * quote its value. `PersonNotFoundError` deliberately conflates missing /
 * soft-deleted / wrong-type / cross-workspace so it never discloses cross-workspace
 * existence (fails closed).
 */

/** The closed set of Person error codes. */
export type PersonErrorCode =
  "validation" | "not_found" | "conflict" | "storage";

/** The base class for every People error; sets `name` to the concrete class. */
export abstract class PersonError extends Error {
  abstract readonly code: PersonErrorCode;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The validatable Person fields (used to route field-level form errors). */
export type PersonValidationField =
  | "id"
  | "title"
  | "preferredName"
  | "firstName"
  | "middleName"
  | "lastName"
  | "pronouns"
  | "organisation"
  | "role"
  | "department"
  | "email"
  | "secondaryEmail"
  | "mobile"
  | "workPhone"
  | "address"
  | "website"
  | "birthday"
  | "relationship"
  | "tags"
  | "notes"
  | "favouriteContactMethod"
  | "followUpFrequency"
  | "nextFollowUp"
  | "lastInteraction"
  | "photoUrl"
  | "limit"
  | "cursor"
  | "query"
  | "status";

/** Invalid input that crossed the Person boundary. No data is written. */
export class PersonValidationError extends PersonError {
  readonly code = "validation" as const;
  readonly field: PersonValidationField;
  constructor(field: PersonValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

/** No matching Person in the bound workspace (missing / deleted / wrong-type /
 * cross-workspace — indistinguishable, by design). */
export class PersonNotFoundError extends PersonError {
  readonly code = "not_found" as const;
  constructor() {
    super("Person not found");
  }
}

/** A concurrent write changed the record under this one. */
export class PersonConflictError extends PersonError {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
  }
}

/** A storage-layer failure. Wraps the underlying cause without leaking it. */
export class PersonStorageError extends PersonError {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A person storage error occurred.", options);
  }
}

/** A cursor that is not valid for the query it was presented to. */
export class InvalidPersonCursorError extends PersonValidationError {
  constructor() {
    super("cursor", "is not a valid cursor for this query");
  }
}
