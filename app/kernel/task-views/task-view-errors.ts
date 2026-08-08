/**
 * TASKS-03 — the saved-view error family.
 *
 * **X-02 note.** These are now ALIASES of the shared saved-view family in
 * `~/kernel/views` — the same classes, so every existing `instanceof` check and
 * every existing message is unchanged. There is one saved-view error family in
 * DalyHub, not one per kind.
 */

export {
  SavedViewError as TaskViewError,
  SavedViewValidationError as TaskViewValidationError,
  SavedViewNotFoundError as TaskViewNotFoundError,
  SavedViewNameTakenError as TaskViewNameTakenError,
  SavedViewLimitError as TaskViewLimitError,
  SavedViewStorageError as TaskViewStorageError,
  type SavedViewValidationField as TaskViewValidationField,
} from "~/kernel/views";
