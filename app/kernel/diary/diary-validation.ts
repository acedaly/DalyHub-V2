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

/** Validate a capture source, applying defaults for omitted fields. */
export function validateSource(value: unknown): DiaryEntrySource {
  if (value === undefined || value === null) {
    return DEFAULT_DIARY_SOURCE;
  }
  if (typeof value !== "object") {
    throw new DiaryValidationError("source", "must be an object");
  }
  const raw = value as { channel?: unknown; reference?: unknown };

  let channel = DEFAULT_DIARY_SOURCE.channel;
  if (raw.channel !== undefined) {
    if (typeof raw.channel !== "string" || raw.channel.length === 0) {
      throw new DiaryValidationError(
        "source",
        "channel must be a non-empty string",
      );
    }
    if (raw.channel.length > DIARY_SOURCE_CHANNEL_MAX_LENGTH) {
      throw new DiaryValidationError("source", "channel is too long");
    }
    if (!CHANNEL_PATTERN.test(raw.channel)) {
      throw new DiaryValidationError(
        "source",
        "channel must be a lowercase identifier",
      );
    }
    channel = raw.channel;
  }

  let reference: string | null = null;
  if (raw.reference !== undefined && raw.reference !== null) {
    if (typeof raw.reference !== "string") {
      throw new DiaryValidationError("source", "reference must be a string");
    }
    if (raw.reference.length > DIARY_SOURCE_REFERENCE_MAX_LENGTH) {
      throw new DiaryValidationError("source", "reference is too long");
    }
    reference = raw.reference;
  }

  return { channel, reference };
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

/** A fully validated set of entry-detail edits (only present fields included). */
export type ValidatedUpdateDiaryEntry = {
  readonly entryType?: DiaryEntryType;
  readonly body?: MarkdownSource | null;
  readonly occurredAt?: Date;
  readonly timezone?: string;
  readonly source?: DiaryEntrySource;
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
    source?: DiaryEntrySource;
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
    out.source = validateSource(input.source);
  }
  if (Object.keys(out).length === 0) {
    throw new DiaryValidationError(
      "body",
      "an edit must change at least one field",
    );
  }
  return out;
}
