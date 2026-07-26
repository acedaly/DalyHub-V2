/**
 * PEOPLE-01 People kernel — boundary validation.
 *
 * Pure, storage-independent validation of everything crossing the Person
 * boundary. Every repository entry point validates here BEFORE touching storage,
 * so invalid input can never write data (AGENTS.md §17). Validators return the
 * normalised value or throw `PersonValidationError`.
 *
 * The display name (`title`) reuses the shared entity title rules (trimmed,
 * non-empty, bounded) but raises a Person-typed error, so callers see one
 * consistent error family. Every other field is optional: a blank/whitespace
 * value normalises to `null` (an omitted field), and a provided value is trimmed
 * and length-bounded. Dates are wall-calendar `YYYY-MM-DD` strings. `photoUrl`
 * and `website` accept only safe schemes, never `javascript:`.
 */

import { ID_MAX_LENGTH } from "~/kernel/entities";
import { validateTitle } from "~/kernel/entities/entity-validation";

import {
  CONTACT_METHODS,
  FOLLOW_UP_FREQUENCIES,
  PERSON_RELATIONSHIPS,
  type ContactMethod,
  type FollowUpFrequency,
  type PersonDetailsInput,
  type PersonListStatus,
  type PersonRelationship,
} from "./person";
import {
  PersonValidationError,
  type PersonValidationField,
} from "./person-errors";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PEOPLE_PAGE_SIZE = 50;
export const MAX_PEOPLE_PAGE_SIZE = 100;

export const NAME_MAX_LENGTH = 200;
export const PRONOUNS_MAX_LENGTH = 64;
export const EMAIL_MAX_LENGTH = 320;
export const PHONE_MAX_LENGTH = 64;
export const ADDRESS_MAX_LENGTH = 500;
export const URL_MAX_LENGTH = 4096;
export const NOTES_MAX_LENGTH = 20000;
export const TAG_MAX_LENGTH = 64;
export const MAX_TAGS = 50;
export const QUERY_MAX_LENGTH = 200;

/** The closed vocabularies as fast lookup sets. */
const RELATIONSHIP_VALUES: ReadonlySet<string> = new Set(
  PERSON_RELATIONSHIPS.map((r) => r.value),
);
const CONTACT_METHOD_VALUES: ReadonlySet<string> = new Set(
  CONTACT_METHODS.map((c) => c.value),
);
const FOLLOW_UP_FREQUENCY_VALUES: ReadonlySet<string> = new Set(
  FOLLOW_UP_FREQUENCIES.map((f) => f.value),
);

/** Count Unicode code points, so validation matches user-perceived length. */
function codePointLength(value: string): number {
  return [...value].length;
}

/* -------------------------------------------------------------------------- */
/* Primitive validators                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Validate and normalise the display name (`title`) via the shared entity title
 * rules, re-wrapping failure as a Person-typed error without echoing the value.
 */
export function validatePersonTitle(value: unknown): string {
  try {
    return validateTitle(value);
  } catch {
    throw new PersonValidationError(
      "title",
      "must be a non-empty display name",
    );
  }
}

/** Validate a non-empty identifier used verbatim as a lookup key. */
export function validatePersonId(value: unknown): string {
  if (typeof value !== "string") {
    throw new PersonValidationError("id", "must be a string");
  }
  if (value.length === 0) {
    throw new PersonValidationError("id", "must not be empty");
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new PersonValidationError(
      "id",
      `must be at most ${ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/**
 * Normalise an optional free-text field: `undefined`/`null`/blank → `null`;
 * otherwise trimmed and bounded to `maxLength` code points. A too-long value is a
 * caller error, not silently truncated.
 */
function validateOptionalText(
  value: unknown,
  field: PersonValidationField,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PersonValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (codePointLength(trimmed) > maxLength) {
    throw new PersonValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/** Validate an optional email address (lightweight, format-tolerant). */
function validateOptionalEmail(
  value: unknown,
  field: PersonValidationField,
): string | null {
  const text = validateOptionalText(value, field, EMAIL_MAX_LENGTH);
  if (text === null) {
    return null;
  }
  // Deliberately permissive: exactly one `@` with non-empty local and domain
  // parts and no whitespace. We never reject a real-but-unusual address.
  if (!/^[^\s@]+@[^\s@]+$/.test(text)) {
    throw new PersonValidationError(field, "must be a valid email address");
  }
  return text;
}

/** Validate an optional URL, allowing only http(s) and (for avatars) data URIs. */
function validateOptionalUrl(
  value: unknown,
  field: PersonValidationField,
  { allowData = false }: { allowData?: boolean } = {},
): string | null {
  const text = validateOptionalText(value, field, URL_MAX_LENGTH);
  if (text === null) {
    return null;
  }
  if (allowData && /^data:image\//i.test(text)) {
    return text;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new PersonValidationError(field, "must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PersonValidationError(field, "must be an http(s) URL");
  }
  return text;
}

/** Validate an optional wall-calendar date string (`YYYY-MM-DD`). */
function validateOptionalDate(
  value: unknown,
  field: PersonValidationField,
): string | null {
  const text = validateOptionalText(value, field, 10);
  if (text === null) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new PersonValidationError(field, "must be a date (YYYY-MM-DD)");
  }
  // Reject impossible calendar dates (e.g. 2026-02-31) via a round-trip check.
  const [y, m, d] = text.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new PersonValidationError(field, "must be a real calendar date");
  }
  return text;
}

/** Validate an optional value against a closed vocabulary. */
function validateOptionalEnum<T extends string>(
  value: unknown,
  field: PersonValidationField,
  allowed: ReadonlySet<string>,
): T | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PersonValidationError(field, "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!allowed.has(trimmed)) {
    throw new PersonValidationError(field, "is not a recognised value");
  }
  return trimmed as T;
}

/**
 * Validate an optional tags array: each tag trimmed, non-empty, bounded; the set
 * deduplicated case-insensitively (first spelling wins) and capped at `MAX_TAGS`.
 * Returns a fresh readonly array (possibly empty).
 */
export function validateTags(value: unknown): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PersonValidationError("tags", "must be an array of strings");
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") {
      throw new PersonValidationError("tags", "each tag must be a string");
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (codePointLength(trimmed) > TAG_MAX_LENGTH) {
      throw new PersonValidationError(
        "tags",
        `each tag must be at most ${TAG_MAX_LENGTH} characters`,
      );
    }
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
    if (out.length > MAX_TAGS) {
      throw new PersonValidationError(
        "tags",
        `must have at most ${MAX_TAGS} tags`,
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Detail-slice validation                                                    */
/* -------------------------------------------------------------------------- */

/** The scalar detail fields (everything except `tags`), in a stable order. */
export const PERSON_SCALAR_FIELDS = [
  "preferredName",
  "firstName",
  "middleName",
  "lastName",
  "pronouns",
  "organisation",
  "role",
  "department",
  "email",
  "secondaryEmail",
  "mobile",
  "workPhone",
  "address",
  "website",
  "birthday",
  "relationship",
  "notes",
  "favouriteContactMethod",
  "followUpFrequency",
  "nextFollowUp",
  "lastInteraction",
  "photoUrl",
] as const;

export type PersonScalarField = (typeof PERSON_SCALAR_FIELDS)[number];

/** Validate one scalar detail field, returning its normalised value. */
function validateScalarField(
  field: PersonScalarField,
  value: unknown,
): string | null {
  switch (field) {
    case "preferredName":
    case "firstName":
    case "middleName":
    case "lastName":
    case "organisation":
    case "role":
    case "department":
      return validateOptionalText(value, field, NAME_MAX_LENGTH);
    case "pronouns":
      return validateOptionalText(value, field, PRONOUNS_MAX_LENGTH);
    case "email":
    case "secondaryEmail":
      return validateOptionalEmail(value, field);
    case "mobile":
    case "workPhone":
      return validateOptionalText(value, field, PHONE_MAX_LENGTH);
    case "address":
      return validateOptionalText(value, field, ADDRESS_MAX_LENGTH);
    case "website":
      return validateOptionalUrl(value, field);
    case "photoUrl":
      return validateOptionalUrl(value, field, { allowData: true });
    case "birthday":
    case "nextFollowUp":
    case "lastInteraction":
      return validateOptionalDate(value, field);
    case "relationship":
      return validateOptionalEnum<PersonRelationship>(
        value,
        field,
        RELATIONSHIP_VALUES,
      );
    case "favouriteContactMethod":
      return validateOptionalEnum<ContactMethod>(
        value,
        field,
        CONTACT_METHOD_VALUES,
      );
    case "followUpFrequency":
      return validateOptionalEnum<FollowUpFrequency>(
        value,
        field,
        FOLLOW_UP_FREQUENCY_VALUES,
      );
    case "notes":
      return validateOptionalText(value, field, NOTES_MAX_LENGTH);
  }
}

/**
 * A validated detail slice: the scalar fields that were PRESENT in the input
 * (mapped to their normalised value) plus, when tags were present, the
 * normalised tag set. On `create` every scalar field is present (defaulted to
 * `null` when omitted) and `tags` is always present.
 */
export type ValidatedPersonDetails = {
  readonly scalars: ReadonlyMap<PersonScalarField, string | null>;
  readonly tagsProvided: boolean;
  readonly tags: readonly string[];
};

/**
 * Validate a detail-slice input. In `create` mode every field is materialised
 * (omitted → null / empty tags) so the repository writes a complete row. In
 * `update` mode only fields actually present are included, so a partial edit
 * touches only the columns it names.
 */
export function validatePersonDetails(
  input: PersonDetailsInput,
  mode: "create" | "update",
): ValidatedPersonDetails {
  const scalars = new Map<PersonScalarField, string | null>();
  for (const field of PERSON_SCALAR_FIELDS) {
    const present = Object.prototype.hasOwnProperty.call(input, field);
    if (mode === "create") {
      scalars.set(
        field,
        validateScalarField(field, (input as Record<string, unknown>)[field]),
      );
    } else if (present) {
      scalars.set(
        field,
        validateScalarField(field, (input as Record<string, unknown>)[field]),
      );
    }
  }
  const tagsProvided =
    mode === "create" || Object.prototype.hasOwnProperty.call(input, "tags");
  const tags = tagsProvided ? validateTags(input.tags) : [];
  return { scalars, tagsProvided, tags };
}

/* -------------------------------------------------------------------------- */
/* List / read validation                                                     */
/* -------------------------------------------------------------------------- */

/** Validate and clamp a requested page limit to `[1, MAX_PEOPLE_PAGE_SIZE]`. */
export function validatePeopleLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_PEOPLE_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new PersonValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new PersonValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_PEOPLE_PAGE_SIZE);
}

/** Validate the lifecycle status filter (defaults to `active`). */
export function validatePersonStatus(value: unknown): PersonListStatus {
  if (value === undefined || value === null) {
    return "active";
  }
  if (value === "active" || value === "archived" || value === "all") {
    return value;
  }
  throw new PersonValidationError(
    "status",
    'must be one of "active", "archived" or "all"',
  );
}

/**
 * Normalise an optional search query: trimmed and bounded; an empty result means
 * "no query" (returns `null`). Never throws for an over-long query — it is
 * clamped, since search text is not durable data.
 */
export function normaliseQuery(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PersonValidationError("query", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, QUERY_MAX_LENGTH);
}
