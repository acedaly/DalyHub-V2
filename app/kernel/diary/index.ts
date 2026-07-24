/**
 * DIARY-01A Diary kernel — public surface.
 *
 * Modules import the Diary kernel from here. This barrel exposes only the
 * storage-independent contract: the canonical Entry model, the extensible
 * entry-type vocabulary, boundary validation, typed errors, the Timeline cursor
 * helpers, the pure day/month grouping and the workspace-bound repository
 * interface. The D1 adapter lives in `app/platform/storage/d1` — the dependency
 * direction points at the contract, not the store (mirrors the entity, note and
 * spine barrels).
 */

export {
  DIARY_ENTITY_TYPE,
  RESERVED_DIARY_ENTITY_TYPES,
  isReservedDiaryEntityType,
  DIARY_ENTRY_CREATED,
  DIARY_ENTRY_UPDATED,
  DIARY_ACTIVITY_TYPES,
} from "./diary-identifiers";

export {
  DIARY_ENTRY_TYPE_MAX_LENGTH,
  DIARY_ENTRY_TYPE_PATTERN,
  parseDiaryEntryType,
  isBuiltInDiaryEntryType,
  BUILT_IN_DIARY_ENTRY_TYPES,
  NOTE_ENTRY,
  CONVERSATION_ENTRY,
  MEETING_ENTRY,
  DECISION_ENTRY,
  IDEA_ENTRY,
  REFLECTION_ENTRY,
  EVENT_ENTRY,
  TRAVEL_ENTRY,
  OBSERVATION_ENTRY,
  DiaryEntryTypeRegistry,
  createDiaryEntryTypeRegistry,
} from "./diary-entry-type";
export type {
  DiaryEntryType,
  DiaryEntryTypeDescriptor,
} from "./diary-entry-type";

export type {
  DiaryEntry,
  DiaryEntrySource,
  CreateDiaryEntryInput,
  UpdateDiaryEntryInput,
  DiaryEntryChangeResult,
} from "./diary-entry";

export {
  DiaryError,
  DiaryValidationError,
  DiaryNotFoundError,
  DiaryConflictError,
  DiaryStorageError,
  InvalidDiaryCursorError,
  type DiaryErrorCode,
  type DiaryValidationField,
} from "./diary-errors";

export {
  DEFAULT_DIARY_PAGE_SIZE,
  MAX_DIARY_PAGE_SIZE,
  MAX_DIARY_ENTRY_TYPE_FILTERS,
  DIARY_TIMEZONE_MAX_LENGTH,
  DIARY_SOURCE_CHANNEL_MAX_LENGTH,
  DIARY_SOURCE_REFERENCE_MAX_LENGTH,
  DEFAULT_DIARY_SOURCE,
  validateDiaryId,
  validateDiaryTitle,
  validateDiaryEntryType,
  validateDiaryBody,
  validateOccurredAt,
  validateTimezone,
  validateSource,
  validatePartialSource,
  validateDiaryLimit,
  validateOrder,
  validateEntryTypeFilter,
  validateRangeBound,
  validateCreateInput,
  validateUpdateInput,
} from "./diary-validation";
export type {
  DiaryTimelineOrder,
  PartialDiarySource,
  ValidatedCreateDiaryEntry,
  ValidatedUpdateDiaryEntry,
} from "./diary-validation";

export {
  DIARY_CURSOR_VERSION,
  encodeDiaryCursor,
  decodeDiaryCursor,
  decodeDiaryCursorForScope,
  diaryCursorScopeMatches,
  normaliseEntryTypeScope,
} from "./diary-cursor";
export type {
  DiaryCursorScope,
  DiaryCursorPosition,
  DecodedDiaryCursor,
} from "./diary-cursor";

export {
  groupEntriesByDay,
  groupEntriesByMonth,
  toLocalDayKey,
  toLocalMonthKey,
} from "./diary-grouping";
export type { DiaryDayGroup, DiaryMonthGroup } from "./diary-grouping";

export type {
  DiaryRepository,
  ListDiaryTimelineInput,
  DiaryTimelinePage,
} from "./diary-repository";
