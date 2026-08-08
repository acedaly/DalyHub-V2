/**
 * NOTES-01A / NOTES-02 / NOTES-03 Notes kernel — public surface.
 *
 * Exposes the storage-independent Note contracts only: the durable
 * Markdown-content shape (plus the NOTES-03 tags and archive state), the READ
 * projection the collection and global Search compose, their validation, typed
 * errors, cursors and the workspace-bound repository interfaces. The D1 adapters
 * live in `app/platform/storage/d1` (mirrors the entity/goal/project-settings
 * kernel barrels — the dependency direction points at the contract, not the
 * store).
 */

export {
  NOTE_ENTITY_TYPE,
  NOTE_CONTENT_UPDATED,
  NOTE_ARCHIVED,
  NOTE_UNARCHIVED,
  NOTE_TAGS_UPDATED,
  MAX_NOTE_TAGS,
  MAX_NOTE_TAG_LENGTH,
  normaliseNoteTag,
  parseNoteTagInput,
  validateNoteContent,
  validateNoteTags,
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
  UpdateNoteContentOptions,
} from "./note-details";

export type { NoteDetailsRepository } from "./note-details-repository";

export {
  InvalidNoteCursorError,
  NoteQueryStorageError,
  NOTE_LIST_DEFAULT_LIMIT,
  NOTE_LIST_MAX_LIMIT,
  NOTE_SEARCH_MAX_LIMIT,
  NOTE_TAG_FACET_MAX,
  MAX_TITLE_RESOLUTION,
  MAX_CONTEXT_WINDOWS,
} from "./note-query";
export type {
  ListNotesInput,
  NoteCollectionState,
  NoteLinkFilter,
  NoteListItem,
  NoteContextWindow,
  NoteListPage,
  NoteMatchSource,
  NoteQueryRepository,
  NoteSearchHit,
  NoteSortOrder,
  NoteTagFacet,
  ReferenceTarget,
  SearchNotesInput,
} from "./note-query";

export {
  NOTE_CURSOR_VERSION,
  decodeNoteCursor,
  decodeNoteCursorForScope,
  encodeNoteCursor,
  noteCursorScope,
  noteCursorScopeMatches,
  normaliseNoteQuery,
} from "./note-cursor";
export type {
  DecodedNoteCursor,
  NoteCursorPosition,
  NoteCursorScope,
} from "./note-cursor";
