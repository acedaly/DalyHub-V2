/**
 * DIARY-01A Diary kernel — boundary validation.
 *
 * Every value that crosses into the repository is validated here BEFORE any
 * storage access (AGENTS.md §17: validate at the boundary). Validation reuses
 * the shared kernel primitives wherever one exists — the entity title rules and
 * the ONE FND-08 Markdown parser — rather than duplicating limits, so the Diary
 * never drifts from the rest of the kernel.
 */

import { validateTitle as validateEntityTitle } from "~/kernel/entities/entity-validation";
import {
  MarkdownError,
  parseMarkdownSource,
  type MarkdownSource,
} from "~/kernel/markdown";

import type {
  CreateDiaryEntryInput,
  DiaryEntrySource,
  UpdateDiaryEntryInput,
} from "./diary-entry";
import { parseDiaryEntryType, type DiaryEntryType } from "./diary-entry-type";
import { DiaryValidationError } from "./diary-errors";

/** Default page size for a Timeline query. */
export const DEFAULT_DIARY_PAGE_SIZE = 50;
/** Maximum page size for a Timeline query — lists are never unbounded. */
export const MAX_DIARY_PAGE_SIZE = 100;
/**
 * Maximum number of distinct entry types a single Timeline filter may name.
 * The entry-type vocabulary is OPEN, so a caller could in principle pass an
 * unbounded list; each becomes a bound SQL variable, and D1 caps a statement at
 * ~100 bound variables (shared here with the workspace, range, cursor and limit
 * binds). Capping the filter well below that keeps every Timeline query valid
 * rather than failing as an opaque storage error (AGENTS.md §17 — bounded
 * queries). 50 is far more than any real UI needs (there are nine built-ins).
 */
export const MAX_DIARY_ENTRY_TYPE_FILTERS = 50;
/** Maximum length of an IANA timezone id (UTF-16 code units). */
export const DIARY_TIMEZONE_MAX_LENGTH = 64;
/** Maximum length of a source channel identifier. */
export const DIARY_SOURCE_CHANNEL_MAX_LENGTH = 64;
/** Maximum length of an opaque source reference. */
export const DIARY_SOURCE_REFERENCE_MAX_LENGTH = 2048;

/** The default capture source when a caller supplies none. */
export const DEFAULT_DIARY_SOURCE: DiaryEntrySource = {
  channel: "manual",
  reference: null,
};

/** The channel-identifier syntax (same restrained shape as the entry type). */
const CHANNEL_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

/** Validate and brand a Diary entity id (any non-empty bounded string). */
export function validateDiaryId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DiaryValidationError("id", "must be a non-empty string");
  }
  if (value.length > 128) {
    throw new DiaryValidationError("id", "must be at most 128 characters");
  }
  return value;
}

/** Validate the entry title, reusing the shared entity title rules. */
export function validateDiaryTitle(value: unknown): string {
  try {
    return validateEntityTitle(value);
  } catch {
    // Re-type into the Diary family without echoing the (potentially long)
    // caller value; the entity validator never puts the value in its message.
    throw new DiaryValidationError("title", "must be a non-empty title");
  }
}

/** Validate the entry type through the open-vocabulary parser. */
export function validateDiaryEntryType(value: unknown): DiaryEntryType {
  return parseDiaryEntryType(value);
}

/**
 * Validate an OPTIONAL Markdown body through the ONE shared FND-08 parser. The
 * empty string and `null`/`undefined` all normalise to `null` (no body) — a
 * Diary Entry's body is genuinely optional, unlike a Note's always-present
 * (possibly empty) content. A non-empty body is preserved EXACTLY.
 */
export function validateDiaryBody(value: unknown): MarkdownSource | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new DiaryValidationError("body", "must be a string or null");
  }
  if (value.length === 0) {
    return null;
  }
  try {
    return parseMarkdownSource(value);
  } catch (cause) {
    if (cause instanceof MarkdownError) {
      throw new DiaryValidationError("body", cause.message);
    }
    throw cause;
  }
}

/**
 * Validate the OCCURRED-AT instant. Requires a real, finite `Date`, but places
 * NO recency constraint — any past or future instant is legitimate (backdating
 * for Memory Mode, future-dating a planned moment).
 */
export function validateOccurredAt(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DiaryValidationError("occurredAt", "must be a valid date");
  }
  return value;
}

/**
 * Validate an IANA timezone id. Bounded, then verified against the runtime's
 * timezone database via `Intl.DateTimeFormat` (V8/ICU in the Workers runtime),
 * so an unknown or malformed zone is rejected rather than silently stored.
 */
export function validateTimezone(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DiaryValidationError("timezone", "must be a non-empty string");
  }
  if (value.length > DIARY_TIMEZONE_MAX_LENGTH) {
    throw new DiaryValidationError(
      "timezone",
      `must be at most ${DIARY_TIMEZONE_MAX_LENGTH} characters`,
    );
  }
  try {
    // Throws a RangeError for an invalid time zone.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new DiaryValidationError(
      "timezone",
      "must be a valid IANA time zone",
    );
  }
  return value;
}

/** Validate a supplied source channel identifier (non-empty, bounded, lowercase). */
function validateChannel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DiaryValidationError(
      "source",
      "channel must be a non-empty string",
    );
  }
  if (value.length > DIARY_SOURCE_CHANNEL_MAX_LENGTH) {
    throw new DiaryValidationError("source", "channel is too long");
  }
  if (!CHANNEL_PATTERN.test(value)) {
    throw new DiaryValidationError(
      "source",
      "channel must be a lowercase identifier",
    );
  }
  return value;
}

/** Validate a supplied source reference (a bounded string, or null to clear it). */
function validateReference(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new DiaryValidationError("source", "reference must be a string");
  }
  if (value.length > DIARY_SOURCE_REFERENCE_MAX_LENGTH) {
    throw new DiaryValidationError("source", "reference is too long");
  }
  return value;
}

/**
 * Validate a CAPTURE source, applying create-time defaults for omitted fields
 * (channel → `manual`, reference → `null`). Use this ONLY for create — an edit
 * must NOT default omitted fields (see {@link validatePartialSource}), or a
 * partial `{ reference }` edit would silently reset the channel to `manual`.
 */
export function validateSource(value: unknown): DiaryEntrySource {
  if (value === undefined || value === null) {
    return DEFAULT_DIARY_SOURCE;
  }
  if (typeof value !== "object") {
    throw new DiaryValidationError("source", "must be an object");
  }
  const raw = value as { channel?: unknown; reference?: unknown };
  return {
    channel:
      raw.channel === undefined
        ? DEFAULT_DIARY_SOURCE.channel
        : validateChannel(raw.channel),
    reference:
      raw.reference === undefined || raw.reference === null
        ? null
        : validateReference(raw.reference),
  };
}

/**
 * A partial source edit: only the subfields the caller actually supplied. An
 * omitted key is absent (so the repository preserves the current value); a
 * present `reference: null` explicitly CLEARS the reference. This is what edits
 * use so an omitted subfield is never reset to a create-time default.
 */
export type PartialDiarySource = {
  readonly channel?: string;
  readonly reference?: string | null;
};

/** Validate the PRESENT subfields of a source edit, defaulting nothing. */
export function validatePartialSource(value: unknown): PartialDiarySource {
  if (typeof value !== "object" || value === null) {
    throw new DiaryValidationError("source", "must be an object");
  }
  const raw = value as { channel?: unknown; reference?: unknown };
  const out: { channel?: string; reference?: string | null } = {};
  if (raw.channel !== undefined) {
    out.channel = validateChannel(raw.channel);
  }
  if (raw.reference !== undefined) {
    out.reference = validateReference(raw.reference);
  }
  return out;
}

/** Validate and clamp a Timeline page limit to `[1, MAX_DIARY_PAGE_SIZE]`. */
export function validateDiaryLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_DIARY_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DiaryValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new DiaryValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_DIARY_PAGE_SIZE);
}

/** The two Timeline orderings. */
export type DiaryTimelineOrder = "newest" | "oldest";

/** Validate the Timeline order, defaulting to newest-first. */
export function validateOrder(value: unknown): DiaryTimelineOrder {
  if (value === undefined) return "newest";
  if (value !== "newest" && value !== "oldest") {
    throw new DiaryValidationError("order", 'must be "newest" or "oldest"');
  }
  return value;
}

/** Validate an optional list of entry-type filters (each parsed, deduped). */
export function validateEntryTypeFilter(
  value: unknown,
): readonly DiaryEntryType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new DiaryValidationError("entryType", "filter must be an array");
  }
  const seen = new Set<string>();
  const out: DiaryEntryType[] = [];
  for (const item of value) {
    const parsed = parseDiaryEntryType(item);
    if (!seen.has(parsed)) {
      seen.add(parsed);
      out.push(parsed);
    }
  }
  // Bound the number of distinct filters so the Timeline query stays within
  // D1's per-statement bound-variable limit (see MAX_DIARY_ENTRY_TYPE_FILTERS).
  if (out.length > MAX_DIARY_ENTRY_TYPE_FILTERS) {
    throw new DiaryValidationError(
      "entryType",
      `filter names at most ${MAX_DIARY_ENTRY_TYPE_FILTERS} distinct types`,
    );
  }
  return out;
}

/** Validate an optional occurred-at range bound. */
export function validateRangeBound(
  value: unknown,
  which: "from" | "to",
): Date | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DiaryValidationError("range", `${which} must be a valid date`);
  }
  return value;
}

/** A fully validated capture input. */
export type ValidatedCreateDiaryEntry = {
  readonly entryType: DiaryEntryType;
  readonly title: string;
  readonly body: MarkdownSource | null;
  readonly occurredAt: Date | undefined;
  readonly timezone: string;
  readonly source: DiaryEntrySource;
};

/** Validate every field of a capture input, applying capture-first defaults
 * (occurredAt is left undefined here so the repository can stamp its clock). */
export function validateCreateInput(
  input: CreateDiaryEntryInput,
): ValidatedCreateDiaryEntry {
  return {
    entryType: validateDiaryEntryType(input.entryType),
    title: validateDiaryTitle(input.title),
    body: validateDiaryBody(input.body),
    occurredAt:
      input.occurredAt === undefined
        ? undefined
        : validateOccurredAt(input.occurredAt),
    timezone:
      input.timezone === undefined ? "UTC" : validateTimezone(input.timezone),
    source: validateSource(input.source),
  };
}

/**
 * A fully validated set of entry-detail edits — only present fields are
 * included. `source` is a PARTIAL edit (only supplied subfields), which the
 * repository merges over the current source so an omitted subfield is preserved,
 * never reset to a create-time default.
 */
export type ValidatedUpdateDiaryEntry = {
  readonly entryType?: DiaryEntryType;
  readonly body?: MarkdownSource | null;
  readonly occurredAt?: Date;
  readonly timezone?: string;
  readonly source?: PartialDiarySource;
};

/** Validate the present fields of an entry-detail edit; reject an empty edit. */
export function validateUpdateInput(
  input: UpdateDiaryEntryInput,
): ValidatedUpdateDiaryEntry {
  const out: {
    entryType?: DiaryEntryType;
    body?: MarkdownSource | null;
    occurredAt?: Date;
    timezone?: string;
    source?: PartialDiarySource;
  } = {};
  if (input.entryType !== undefined) {
    out.entryType = validateDiaryEntryType(input.entryType);
  }
  if (input.body !== undefined) {
    out.body = validateDiaryBody(input.body);
  }
  if (input.occurredAt !== undefined) {
    out.occurredAt = validateOccurredAt(input.occurredAt);
  }
  if (input.timezone !== undefined) {
    out.timezone = validateTimezone(input.timezone);
  }
  if (input.source !== undefined) {
    out.source = validatePartialSource(input.source);
  }
  if (Object.keys(out).length === 0) {
    throw new DiaryValidationError(
      "body",
      "an edit must change at least one field",
    );
  }
  return out;
}
