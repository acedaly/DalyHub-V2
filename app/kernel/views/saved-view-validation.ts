/**
 * X-02 — saved-view boundary validation (pure, storage-independent), shared by
 * every saved-view kind.
 *
 * Every value crossing the saved-view boundary is validated HERE, before storage
 * is touched, so invalid input can never be written (AGENTS.md §17). Generalised
 * from TASKS-03's validators; `~/kernel/task-views` re-exports these under their
 * original names, so nothing about the Tasks write path changed.
 */

import { SavedViewValidationError } from "./saved-view-errors";
import { SAVED_VIEW_NAME_MAX_LENGTH } from "./saved-view";

/** The maximum accepted length of a saved-view id / owner id. */
const ID_MAX = 128;
const OWNER_ID_MAX = 256;

/** Validate the authenticated owner id a saved view is scoped to. */
export function validateSavedViewOwnerId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SavedViewValidationError("ownerId", "must be a non-empty string");
  }
  if (value.length > OWNER_ID_MAX) {
    throw new SavedViewValidationError(
      "ownerId",
      `must be at most ${OWNER_ID_MAX} characters`,
    );
  }
  return value;
}

/** Validate a saved-view id used verbatim as a lookup key. */
export function validateSavedViewId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SavedViewValidationError("id", "must be a non-empty string");
  }
  if (value.length > ID_MAX) {
    throw new SavedViewValidationError(
      "id",
      `must be at most ${ID_MAX} characters`,
    );
  }
  return value;
}

/**
 * Validate and normalise a saved-view name: trimmed, non-empty, bounded, and free
 * of control characters (it is a single-line label rendered as plain text, never
 * Markdown or HTML). Returns the trimmed value, which is what gets stored.
 */
export function validateSavedViewName(value: unknown): string {
  if (typeof value !== "string") {
    throw new SavedViewValidationError("name", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new SavedViewValidationError("name", "give this view a name");
  }
  if ([...trimmed].length > SAVED_VIEW_NAME_MAX_LENGTH) {
    throw new SavedViewValidationError(
      "name",
      `must be at most ${SAVED_VIEW_NAME_MAX_LENGTH} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    throw new SavedViewValidationError(
      "name",
      "must not contain control characters",
    );
  }
  return trimmed;
}

/**
 * Validate that an untrusted value IS a configuration object, before a kind's own
 * lenient parser normalises it.
 *
 * Storing "whatever the client sent" as a default config would silently discard
 * the user's work, so a non-object is rejected outright. Individual VALUES are then
 * normalised leniently by the kind's parser, so a single unrecognised dimension
 * drops rather than failing the whole save.
 */
export function requireConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SavedViewValidationError(
      "config",
      "must be a configuration object",
    );
  }
  return value as Record<string, unknown>;
}
