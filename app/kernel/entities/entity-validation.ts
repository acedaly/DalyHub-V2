/**
 * FND-02 Data kernel — boundary validation.
 *
 * Pure, storage-independent validation of everything that crosses the kernel
 * boundary. Every repository entry point validates its inputs here BEFORE
 * touching storage, so invalid input can never write data (see AGENTS.md §17:
 * validate at the boundary). Validators return the normalised value (e.g. a
 * trimmed title) or throw `EntityValidationError`.
 */

import {
  EntityValidationError,
  type EntityValidationField,
} from "./entity-errors";
import type {
  CreateEntityInput,
  EntityType,
  UpdateEntityInput,
} from "./entity";

/**
 * Documented limits. These are deliberately generous but bounded — an
 * unbounded title or type is both a storage and a denial-of-service hazard.
 */

/** Maximum length of an entity `title`, in Unicode code points. */
export const TITLE_MAX_LENGTH = 512;

/** Maximum length of an entity `type` identifier, in characters. */
export const ENTITY_TYPE_MAX_LENGTH = 64;

/** Maximum length of an `id` / `workspaceId`, in characters. */
export const ID_MAX_LENGTH = 128;

/** Default number of records returned by `list` when no limit is given. */
export const DEFAULT_PAGE_SIZE = 50;

/** Hard upper bound on a single `list` page — the safe maximum page size. */
export const MAX_PAGE_SIZE = 100;

/**
 * Allowed shape of an entity type identifier: a lowercase, dotted/segmented
 * slug such as `task`, `meeting`, or `meeting.follow_up`. Each segment starts
 * with a letter and contains only lowercase letters, digits and underscores.
 * Keeping types to a documented, portable charset means they are safe to use as
 * stable identifiers and index keys without surprises.
 */
export const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/** Count Unicode code points, so validation matches user-perceived length. */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Validate a non-empty identifier (`id` or `workspaceId`). Identifiers are used
 * verbatim as lookup keys, so they must be present, non-empty and bounded. They
 * are not trimmed — an id with surrounding whitespace is a caller bug, not
 * something to silently "fix".
 */
export function validateId(
  value: unknown,
  field: Extract<EntityValidationField, "id" | "workspaceId">,
): string {
  if (typeof value !== "string") {
    throw new EntityValidationError(field, "must be a string");
  }
  if (value.length === 0) {
    throw new EntityValidationError(field, "must not be empty");
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new EntityValidationError(
      field,
      `must be at most ${ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/** Validate a workspace id — required on every operation. */
export function validateWorkspaceId(value: unknown): string {
  return validateId(value, "workspaceId");
}

/** Validate an entity id. */
export function validateEntityId(value: unknown): string {
  return validateId(value, "id");
}

/**
 * Validate an entity `type`: required, non-empty, bounded, and matching the
 * documented identifier pattern. Returns the value unchanged (types are
 * canonical identifiers, not free text, so they are not trimmed).
 */
export function validateEntityType(value: unknown): EntityType {
  if (typeof value !== "string") {
    throw new EntityValidationError("type", "must be a string");
  }
  if (value.length === 0) {
    throw new EntityValidationError("type", "must not be empty");
  }
  if (value.length > ENTITY_TYPE_MAX_LENGTH) {
    throw new EntityValidationError(
      "type",
      `must be at most ${ENTITY_TYPE_MAX_LENGTH} characters`,
    );
  }
  if (!ENTITY_TYPE_PATTERN.test(value)) {
    throw new EntityValidationError(
      "type",
      'must be a lowercase dotted identifier (e.g. "task" or "meeting.follow_up")',
    );
  }
  return value;
}

/**
 * Validate and normalise a `title`: required and non-empty after trimming,
 * within the documented length limit. Returns the trimmed value, which is what
 * gets stored.
 */
export function validateTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new EntityValidationError("title", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EntityValidationError("title", "must not be empty");
  }
  if (codePointLength(trimmed) > TITLE_MAX_LENGTH) {
    throw new EntityValidationError(
      "title",
      `must be at most ${TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** A create input whose fields have all been validated and normalised. The
 * workspace is supplied by the repository's bound context, not by the caller
 * (FND-03), so it is not part of the create input. */
export type ValidatedCreateInput = {
  readonly type: EntityType;
  readonly title: string;
};

/** Validate every field of a create input. */
export function validateCreateInput(
  input: CreateEntityInput,
): ValidatedCreateInput {
  return {
    type: validateEntityType(input.type),
    title: validateTitle(input.title),
  };
}

/** Validate every field of an update input. */
export function validateUpdateInput(input: UpdateEntityInput): {
  readonly title: string;
} {
  return { title: validateTitle(input.title) };
}

/**
 * Validate and clamp a requested page limit to `[1, MAX_PAGE_SIZE]`. A missing
 * limit yields `DEFAULT_PAGE_SIZE`. A non-integer or non-positive limit is a
 * caller error and is rejected rather than silently coerced.
 */
export function validateLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EntityValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new EntityValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Validate an optional type filter, returning undefined when not provided. */
export function validateOptionalType(value: unknown): EntityType | undefined {
  if (value === undefined) {
    return undefined;
  }
  return validateEntityType(value);
}
