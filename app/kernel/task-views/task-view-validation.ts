/**
 * TASKS-03 — saved-view boundary validation (pure, storage-independent).
 *
 * Every value crossing the saved-view boundary is validated HERE, before storage
 * is touched, so invalid input can never be written (AGENTS.md §17).
 */

import { TaskViewValidationError } from "./task-view-errors";
import { parseTaskViewConfig, type TaskViewConfig } from "./task-view-config";
import { TASK_VIEW_NAME_MAX_LENGTH } from "./task-view";

/** The maximum accepted length of a saved-view id / owner id. */
const ID_MAX = 128;
const OWNER_ID_MAX = 256;

/** Validate the authenticated owner id a saved view is scoped to. */
export function validateTaskViewOwnerId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TaskViewValidationError("ownerId", "must be a non-empty string");
  }
  if (value.length > OWNER_ID_MAX) {
    throw new TaskViewValidationError(
      "ownerId",
      `must be at most ${OWNER_ID_MAX} characters`,
    );
  }
  return value;
}

/** Validate a saved-view id used verbatim as a lookup key. */
export function validateTaskViewId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TaskViewValidationError("id", "must be a non-empty string");
  }
  if (value.length > ID_MAX) {
    throw new TaskViewValidationError(
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
export function validateTaskViewName(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskViewValidationError("name", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TaskViewValidationError("name", "give this view a name");
  }
  if ([...trimmed].length > TASK_VIEW_NAME_MAX_LENGTH) {
    throw new TaskViewValidationError(
      "name",
      `must be at most ${TASK_VIEW_NAME_MAX_LENGTH} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    throw new TaskViewValidationError(
      "name",
      "must not contain control characters",
    );
  }
  return trimmed;
}

/**
 * Validate a configuration ON WRITE.
 *
 * The value must at least BE an object — storing "whatever the client sent" as a
 * default config would silently discard the user's work. Individual values are
 * then normalised through the lenient parser, so a single unrecognised dimension
 * drops rather than failing the whole save. What is stored is the canonical
 * result, so only known keys with known values are ever persisted.
 */
export function validateTaskViewConfigForWrite(value: unknown): TaskViewConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TaskViewValidationError(
      "config",
      "must be a configuration object",
    );
  }
  return parseTaskViewConfig(value);
}
