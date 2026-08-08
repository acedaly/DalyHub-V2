/**
 * TASKS-03 — saved-view boundary validation for the Tasks kind.
 *
 * Every value crossing the saved-view boundary is validated before storage is
 * touched, so invalid input can never be written (AGENTS.md §17). The id, owner-id
 * and name validators are the SHARED ones from `~/kernel/views` (re-exported here
 * under their original names); only the CONFIG validator is Tasks-specific,
 * because only the configuration vocabulary differs between kinds.
 */

import { requireConfigObject } from "~/kernel/views";

import { parseTaskViewConfig, type TaskViewConfig } from "./task-view-config";

export {
  validateSavedViewId as validateTaskViewId,
  validateSavedViewName as validateTaskViewName,
  validateSavedViewOwnerId as validateTaskViewOwnerId,
} from "~/kernel/views";

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
  return parseTaskViewConfig(requireConfigObject(value));
}
