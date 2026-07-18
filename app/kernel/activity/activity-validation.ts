/**
 * FND-05 Activity kernel — boundary validation, payload rules and serialisation.
 *
 * Pure, storage-independent validation of everything that crosses the Activity
 * kernel boundary. Every recording and read path validates its inputs here BEFORE
 * touching storage, so invalid input can never write data (AGENTS.md §17).
 * Validators return the normalised/branded value or throw a typed Activity error.
 *
 * This module also owns the ONE shared payload serialiser/parser. Payloads are
 * validated (structure, depth, encoded byte size), serialised exactly once on the
 * write path, and re-validated on the read path — corrupt stored JSON becomes a
 * typed `ActivityPayloadError`, never a crash (ADR-012).
 */

import {
  ActivityPayloadError,
  ActivityValidationError,
} from "./activity-errors";
import type {
  ActivityActor,
  ActivityActorType,
  ActivityPayload,
  ActivitySubject,
  ActivitySubjectRole,
  ActivityType,
} from "./activity";

/** Maximum length of an Activity `id`, in characters. Matches the entity kernel's
 * `ID_MAX_LENGTH` so ids stay mutually compatible. */
export const ACTIVITY_ID_MAX_LENGTH = 128;

/** Maximum length of an Activity `type` identifier, in characters. */
export const ACTIVITY_TYPE_MAX_LENGTH = 128;

/** Maximum length of an actor `type` identifier, in characters. */
export const ACTOR_TYPE_MAX_LENGTH = 64;

/** Maximum length of an actor `id`, in characters. */
export const ACTOR_ID_MAX_LENGTH = 128;

/** Maximum length of a subject entity id, in characters. */
export const SUBJECT_ENTITY_ID_MAX_LENGTH = 128;

/** Maximum length of a subject `role` identifier, in characters. */
export const SUBJECT_ROLE_MAX_LENGTH = 64;

/** Minimum number of subjects an event must relate to. Every event relates to at
 * least one entity. */
export const MIN_SUBJECTS = 1;

/** Maximum number of subjects a single event may relate to. Bounded so a single
 * event cannot fan out without limit. */
export const MAX_SUBJECTS = 32;

/**
 * Documented maximum ENCODED byte size of a payload's JSON text. Payloads carry
 * only what is needed to explain an event, never entity snapshots, so this is
 * generous but bounded — an unbounded payload is a storage and denial-of-service
 * hazard.
 */
export const PAYLOAD_MAX_BYTES = 8192;

/**
 * Maximum nesting depth of a payload (the top-level object counts as depth 1).
 * A reasonable bound that rejects pathological/adversarial nesting while easily
 * accommodating the small structured payloads events actually use.
 */
export const PAYLOAD_MAX_DEPTH = 8;

/** Default number of events returned by a listing when no limit is given. */
export const DEFAULT_ACTIVITY_PAGE_SIZE = 50;

/** Hard upper bound on a single Activity page — the safe maximum page size. */
export const MAX_ACTIVITY_PAGE_SIZE = 100;

/**
 * The shared lowercase dotted-identifier shape used across DalyHub for stable
 * machine identifiers: each segment starts with a letter and contains only
 * lowercase letters, digits and underscores (e.g. `entity.created`, `system`,
 * `source`). Identical to the entity and link kernels' identifier format.
 */
export const ACTIVITY_IDENTIFIER_PATTERN =
  /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/** Validate a non-empty identifier used verbatim as a lookup key. Not trimmed —
 * surrounding whitespace is a caller bug, not something to silently "fix". */
function validateBoundedId(
  value: unknown,
  field: "id" | "actorId" | "subjectEntityId",
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ActivityValidationError(field, "must be a string");
  }
  if (value.length === 0) {
    throw new ActivityValidationError(field, "must not be empty");
  }
  if (value.length > maxLength) {
    throw new ActivityValidationError(
      field,
      `must be at most ${maxLength} characters`,
    );
  }
  return value;
}

/** Validate an Activity id. */
export function validateActivityId(value: unknown): string {
  return validateBoundedId(value, "id", ACTIVITY_ID_MAX_LENGTH);
}

/** Validate a subject entity id. */
export function validateSubjectEntityId(value: unknown): string {
  return validateBoundedId(
    value,
    "subjectEntityId",
    SUBJECT_ENTITY_ID_MAX_LENGTH,
  );
}

/** Validate an Activity `type`: required, non-empty, bounded and matching the
 * documented dotted-identifier pattern. Stored verbatim; the ONLY sanctioned way
 * to turn a raw string into an `ActivityType`. */
export function parseActivityType(value: unknown): ActivityType {
  if (typeof value !== "string") {
    throw new ActivityValidationError("type", "must be a string");
  }
  if (value.length === 0) {
    throw new ActivityValidationError("type", "must not be empty");
  }
  if (value.length > ACTIVITY_TYPE_MAX_LENGTH) {
    throw new ActivityValidationError(
      "type",
      `must be at most ${ACTIVITY_TYPE_MAX_LENGTH} characters`,
    );
  }
  if (!ACTIVITY_IDENTIFIER_PATTERN.test(value)) {
    throw new ActivityValidationError(
      "type",
      'must be a lowercase dotted identifier (e.g. "entity.created")',
    );
  }
  return value as ActivityType;
}

/** True when `value` is a structurally valid Activity type. */
export function isActivityType(value: unknown): value is ActivityType {
  try {
    parseActivityType(value);
    return true;
  } catch {
    return false;
  }
}

/** Validate an actor `type`: required, non-empty, bounded and matching the
 * documented dotted-identifier pattern. */
export function parseActorType(value: unknown): ActivityActorType {
  if (typeof value !== "string") {
    throw new ActivityValidationError("actorType", "must be a string");
  }
  if (value.length === 0) {
    throw new ActivityValidationError("actorType", "must not be empty");
  }
  if (value.length > ACTOR_TYPE_MAX_LENGTH) {
    throw new ActivityValidationError(
      "actorType",
      `must be at most ${ACTOR_TYPE_MAX_LENGTH} characters`,
    );
  }
  if (!ACTIVITY_IDENTIFIER_PATTERN.test(value)) {
    throw new ActivityValidationError(
      "actorType",
      'must be a lowercase dotted identifier (e.g. "system")',
    );
  }
  return value;
}

/** Validate an optional actor id: null is allowed (e.g. the `system` actor); a
 * present value must be a non-empty bounded string. */
export function validateActorId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return validateBoundedId(value, "actorId", ACTOR_ID_MAX_LENGTH);
}

/** Validate a whole actor context. */
export function validateActor(actor: {
  readonly type: unknown;
  readonly id: unknown;
}): ActivityActor {
  return { type: parseActorType(actor.type), id: validateActorId(actor.id) };
}

/** Validate a subject `role`: required, non-empty, bounded and matching the
 * documented dotted-identifier pattern (e.g. `subject`, `source`, `target`). */
export function parseSubjectRole(value: unknown): ActivitySubjectRole {
  if (typeof value !== "string") {
    throw new ActivityValidationError("subjectRole", "must be a string");
  }
  if (value.length === 0) {
    throw new ActivityValidationError("subjectRole", "must not be empty");
  }
  if (value.length > SUBJECT_ROLE_MAX_LENGTH) {
    throw new ActivityValidationError(
      "subjectRole",
      `must be at most ${SUBJECT_ROLE_MAX_LENGTH} characters`,
    );
  }
  if (!ACTIVITY_IDENTIFIER_PATTERN.test(value)) {
    throw new ActivityValidationError(
      "subjectRole",
      'must be a lowercase dotted identifier (e.g. "subject")',
    );
  }
  return value;
}

/**
 * Validate a non-empty, bounded, duplicate-free list of subjects. An event must
 * relate to at least one entity and at most `MAX_SUBJECTS`. An entity may appear
 * only ONCE per event (the storage association table enforces this too), so a
 * repeated entity id — regardless of role — is rejected here.
 */
export function validateSubjects(
  subjects: readonly { readonly entityId: unknown; readonly role: unknown }[],
): ActivitySubject[] {
  if (!Array.isArray(subjects)) {
    throw new ActivityValidationError("subjects", "must be an array");
  }
  if (subjects.length < MIN_SUBJECTS) {
    throw new ActivityValidationError(
      "subjects",
      `must relate to at least ${MIN_SUBJECTS} entity`,
    );
  }
  if (subjects.length > MAX_SUBJECTS) {
    throw new ActivityValidationError(
      "subjects",
      `must relate to at most ${MAX_SUBJECTS} entities`,
    );
  }
  const seen = new Set<string>();
  const validated: ActivitySubject[] = [];
  for (const subject of subjects) {
    const entityId = validateSubjectEntityId(subject.entityId);
    const role = parseSubjectRole(subject.role);
    if (seen.has(entityId)) {
      throw new ActivityValidationError(
        "subjects",
        "an entity may appear at most once per event",
      );
    }
    seen.add(entityId);
    validated.push({ entityId, role });
  }
  return validated;
}

/** True for a plain (non-array, non-null) object literal. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively assert that `value` is a supported `JsonValue`, within the depth
 * limit and free of cycles. Rejects functions, symbols, `undefined`, non-finite
 * numbers, class instances and cyclic structures. `seen` tracks the current
 * ancestor chain so a genuine cycle is caught while repeated sibling references
 * are allowed.
 */
function assertJsonValue(
  value: unknown,
  depth: number,
  seen: Set<object>,
): void {
  if (value === null) {
    return;
  }
  const t = typeof value;
  if (t === "string" || t === "boolean") {
    return;
  }
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new ActivityPayloadError(
        "payload contains a non-finite number (NaN or Infinity)",
      );
    }
    return;
  }
  if (
    t === "function" ||
    t === "symbol" ||
    t === "undefined" ||
    t === "bigint"
  ) {
    throw new ActivityPayloadError(
      `payload contains an unsupported ${t} value`,
    );
  }
  // Object or array from here.
  if (depth >= PAYLOAD_MAX_DEPTH) {
    throw new ActivityPayloadError(
      `payload nesting exceeds the maximum depth of ${PAYLOAD_MAX_DEPTH}`,
    );
  }
  const obj = value as object;
  if (seen.has(obj)) {
    throw new ActivityPayloadError("payload contains a cyclic reference");
  }
  seen.add(obj);
  if (Array.isArray(value)) {
    for (const element of value) {
      assertJsonValue(element, depth + 1, seen);
    }
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      assertJsonValue(value[key], depth + 1, seen);
    }
  } else {
    throw new ActivityPayloadError(
      "payload contains a non-plain object (e.g. a class instance)",
    );
  }
  seen.delete(obj);
}

/**
 * Validate an untrusted value as an `ActivityPayload`: it must be a plain JSON
 * OBJECT (not a bare primitive or array), every value must be a supported
 * `JsonValue`, and it must be within the depth limit and free of cycles. Returns
 * the same object, typed. Does NOT check the encoded byte size — that is enforced
 * by {@link serializeActivityPayload}, which measures the exact stored bytes.
 */
export function validateActivityPayload(value: unknown): ActivityPayload {
  if (!isPlainObject(value)) {
    throw new ActivityPayloadError("payload must be a JSON object");
  }
  assertJsonValue(value, 0, new Set<object>());
  return value as ActivityPayload;
}

/**
 * The ONE shared payload serialiser (ADR-012): validate structurally, serialise
 * to canonical JSON text exactly once, and enforce the documented maximum encoded
 * byte size on the ACTUAL stored bytes (UTF-8). Throws `ActivityPayloadError` on
 * any unsupported value, cycle, excessive depth or oversized encoding.
 */
export function serializeActivityPayload(value: unknown): string {
  const payload = validateActivityPayload(value);
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch (cause) {
    // Should be unreachable after validation, but never let a raw stringify
    // error escape the kernel boundary.
    throw new ActivityPayloadError("payload could not be serialised", {
      cause,
    });
  }
  // `JSON.stringify` returns undefined only for non-serialisable top values,
  // which validation has already excluded — guard defensively regardless.
  if (typeof json !== "string") {
    throw new ActivityPayloadError("payload could not be serialised");
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > PAYLOAD_MAX_BYTES) {
    throw new ActivityPayloadError(
      `payload encodes to ${bytes} bytes, exceeding the maximum of ${PAYLOAD_MAX_BYTES}`,
    );
  }
  return json;
}

/**
 * Parse and validate a payload JSON string READ FROM STORAGE. Corrupt or
 * unexpected stored JSON (unparseable, or not a valid `ActivityPayload`) becomes
 * a typed `ActivityPayloadError` rather than crashing a read or leaking a raw
 * parser failure.
 */
export function parseActivityPayload(text: string): ActivityPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new ActivityPayloadError("stored payload is not valid JSON", {
      cause,
    });
  }
  return validateActivityPayload(parsed);
}

/**
 * Validate and clamp a requested page limit to `[1, MAX_ACTIVITY_PAGE_SIZE]`. A
 * missing limit yields `DEFAULT_ACTIVITY_PAGE_SIZE`. A non-integer or
 * non-positive limit is a caller error and is rejected rather than coerced.
 */
export function validateActivityLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_ACTIVITY_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ActivityValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new ActivityValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_ACTIVITY_PAGE_SIZE);
}

/** Validate an optional event-type filter, returning undefined when not given. */
export function validateOptionalActivityType(
  value: unknown,
): ActivityType | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseActivityType(value);
}
