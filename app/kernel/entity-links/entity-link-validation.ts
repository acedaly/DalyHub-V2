/**
 * FND-04 EntityLinks kernel — boundary validation.
 *
 * Pure, storage-independent validation of everything that crosses the link
 * kernel boundary. Every repository entry point validates its inputs here BEFORE
 * touching storage, so invalid input can never write data (AGENTS.md §17).
 * Validators return the normalised/branded value or throw
 * `EntityLinkValidationError`.
 */

import {
  EntityLinkValidationError,
  type EntityLinkValidationField,
} from "./entity-link-errors";
import type {
  CreateEntityLinkInput,
  EntityLinkDirectionFilter,
  EntityLinkType,
} from "./entity-link";

/** Maximum length of a link `id` / entity id, in characters. Matches the entity
 * kernel's `ID_MAX_LENGTH` so ids stay mutually compatible. */
export const ENTITY_LINK_ID_MAX_LENGTH = 128;

/** Maximum length of a link `type` identifier, in characters. */
export const ENTITY_LINK_TYPE_MAX_LENGTH = 128;

/** Default number of records returned by `listForEntity` when no limit is given. */
export const DEFAULT_LINK_PAGE_SIZE = 50;

/** Hard upper bound on a single link page — the safe maximum page size. */
export const MAX_LINK_PAGE_SIZE = 100;

/**
 * Allowed shape of a link type: a lowercase, dotted/segmented slug such as
 * `meeting.produced_task`, `project.supporting_note` or `person.attended_meeting`.
 * Each segment starts with a letter and contains only lowercase letters, digits
 * and underscores. This is the SAME documented structural format the entity
 * kernel uses for entity types, keeping every DalyHub identifier consistent and
 * safe to use as a stable key without surprises.
 */
export const ENTITY_LINK_TYPE_PATTERN =
  /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/** The three accepted direction filters for a listing. */
const DIRECTION_FILTERS: ReadonlySet<EntityLinkDirectionFilter> = new Set([
  "outgoing",
  "incoming",
  "both",
]);

/**
 * Validate a non-empty identifier used verbatim as a lookup key (a link id or an
 * endpoint entity id). Not trimmed — a surrounding-whitespace id is a caller bug,
 * not something to silently "fix".
 */
function validateIdentifier(
  value: unknown,
  field: Extract<
    EntityLinkValidationField,
    "id" | "sourceEntityId" | "targetEntityId"
  >,
): string {
  if (typeof value !== "string") {
    throw new EntityLinkValidationError(field, "must be a string");
  }
  if (value.length === 0) {
    throw new EntityLinkValidationError(field, "must not be empty");
  }
  if (value.length > ENTITY_LINK_ID_MAX_LENGTH) {
    throw new EntityLinkValidationError(
      field,
      `must be at most ${ENTITY_LINK_ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/** Validate a link id. */
export function validateEntityLinkId(value: unknown): string {
  return validateIdentifier(value, "id");
}

/** Validate a source entity id. */
export function validateSourceEntityId(value: unknown): string {
  return validateIdentifier(value, "sourceEntityId");
}

/** Validate a target entity id. */
export function validateTargetEntityId(value: unknown): string {
  return validateIdentifier(value, "targetEntityId");
}

/**
 * Validate a value as an `EntityLinkType`: required, non-empty, bounded, and
 * matching the documented identifier pattern. Returns the branded value
 * unchanged (types are canonical identifiers stored verbatim, never trimmed).
 * This is the ONLY sanctioned way to turn a raw string into an `EntityLinkType`.
 */
export function parseEntityLinkType(value: unknown): EntityLinkType {
  if (typeof value !== "string") {
    throw new EntityLinkValidationError("type", "must be a string");
  }
  if (value.length === 0) {
    throw new EntityLinkValidationError("type", "must not be empty");
  }
  if (value.length > ENTITY_LINK_TYPE_MAX_LENGTH) {
    throw new EntityLinkValidationError(
      "type",
      `must be at most ${ENTITY_LINK_TYPE_MAX_LENGTH} characters`,
    );
  }
  if (!ENTITY_LINK_TYPE_PATTERN.test(value)) {
    throw new EntityLinkValidationError(
      "type",
      'must be a lowercase dotted identifier (e.g. "meeting.produced_task")',
    );
  }
  return value as EntityLinkType;
}

/** True when `value` is a structurally valid link type. */
export function isEntityLinkType(value: unknown): value is EntityLinkType {
  try {
    parseEntityLinkType(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * A create input whose fields have all been validated and normalised. The
 * workspace is supplied by the repository's bound context, not the caller, so it
 * is not part of the create input. Self-links are rejected here, before any
 * storage access.
 */
export type ValidatedCreateEntityLinkInput = {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: EntityLinkType;
};

/**
 * Validate every field of a create input AND reject self-links. Direction is
 * meaningful, so endpoints are NOT reordered; they are only checked for being
 * distinct (a link from an entity to itself is meaningless and forbidden).
 */
export function validateCreateEntityLinkInput(
  input: CreateEntityLinkInput,
): ValidatedCreateEntityLinkInput {
  const sourceEntityId = validateSourceEntityId(input.sourceEntityId);
  const targetEntityId = validateTargetEntityId(input.targetEntityId);
  const type = parseEntityLinkType(input.type);
  if (sourceEntityId === targetEntityId) {
    throw new EntityLinkValidationError(
      "selfLink",
      "an entity cannot link to itself",
    );
  }
  return { sourceEntityId, targetEntityId, type };
}

/**
 * Validate and clamp a requested page limit to `[1, MAX_LINK_PAGE_SIZE]`. A
 * missing limit yields `DEFAULT_LINK_PAGE_SIZE`. A non-integer or non-positive
 * limit is a caller error and is rejected rather than silently coerced.
 */
export function validateLinkLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_LINK_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EntityLinkValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new EntityLinkValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_LINK_PAGE_SIZE);
}

/** Validate an optional type filter, returning undefined when not provided. */
export function validateOptionalLinkType(
  value: unknown,
): EntityLinkType | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseEntityLinkType(value);
}

/**
 * Validate an optional direction filter, defaulting to `both`. An unknown value
 * is a caller error and is rejected.
 */
export function validateDirectionFilter(
  value: unknown,
): EntityLinkDirectionFilter {
  if (value === undefined) {
    return "both";
  }
  if (
    typeof value !== "string" ||
    !DIRECTION_FILTERS.has(value as EntityLinkDirectionFilter)
  ) {
    throw new EntityLinkValidationError(
      "direction",
      'must be "outgoing", "incoming" or "both"',
    );
  }
  return value as EntityLinkDirectionFilter;
}
