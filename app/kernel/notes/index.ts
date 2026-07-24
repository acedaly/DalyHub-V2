/**
 * NOTES-01A Notes kernel — public surface.
 *
 * Exposes the storage-independent Note-details contract only: the durable
 * Markdown-content shape, its validation, typed errors and the workspace-bound
 * repository interface. The D1 adapter lives in `app/platform/storage/d1`
 * (mirrors the entity/goal/project-settings kernel barrels — the dependency
 * direction points at the contract, not the store).
 */

export {
  NOTE_ENTITY_TYPE,
  NOTE_CONTENT_UPDATED,
  validateNoteContent,
  NoteDetailsValidationError,
  NoteDetailsNotFoundError,
  NoteDetailsStorageError,
  NoteDetailsConflictError,
} from "./note-details";
export type {
  NoteDetails,
  NoteDetailsRecord,
  NoteDetailsChangeResult,
  NoteDetailsValidationField,
} from "./note-details";

export type { NoteDetailsRepository } from "./note-details-repository";
