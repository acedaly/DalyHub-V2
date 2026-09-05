/**
 * ASSET-01 Assets kernel — public surface.
 *
 * Modules and the composition boundary import the Assets kernel from here. This
 * barrel exposes only the storage-independent contract (identifiers, types,
 * errors, validation, the cursor helpers and the repository interface). The D1
 * adapter is NOT re-exported: code wanting persistence constructs it from
 * `app/platform/storage/d1` (mirrors the entity, diary, note and people barrels).
 */

export {
  ASSET_ENTITY_TYPE,
  RESERVED_ASSET_ENTITY_TYPES,
  isReservedAssetEntityType,
  ASSET_CREATED,
  ASSET_UPDATED,
  ASSET_STATUS_CHANGED,
  ASSET_ARCHIVED,
  ASSET_RESTORED,
  ASSET_DISPOSED,
  ASSET_DELETED,
  ASSET_ACTIVITY_TYPES,
  ASSET_LINKED_AREA,
  ASSET_LINKED_GOAL,
  ASSET_LINKED_PROJECT,
  ASSET_LINKED_TASK,
  ASSET_LINKED_NOTE,
  ASSET_LINKED_DIARY,
  ASSET_LINKED_MEETING,
  ASSET_LINKED_PERSON,
  ASSET_LINKED_ASSET,
  ASSET_LINK_TYPES,
  ASSET_EVENT_CREATED,
  ASSET_EVENT_UPDATED,
  ASSET_EVENT_ARCHIVED,
  ASSET_EVENT_RESTORED,
  ASSET_EVENT_DELETED,
  ASSET_OBLIGATION_CREATED,
  ASSET_OBLIGATION_RESCHEDULED,
  ASSET_OBLIGATION_COMPLETED,
  ASSET_OBLIGATION_DISMISSED,
  ASSET_OBLIGATION_REOPENED,
  ASSET_TASK_LINKED,
  ASSET_METER_UPDATED,
} from "./asset-identifiers";

export {
  ASSET_TYPES,
  ASSET_STATUSES,
  DEFAULT_ASSET_STATUS,
  ASSET_PRIVATE_FIELDS,
} from "./asset";

export type {
  Asset,
  AssetDetails,
  AssetDetailsInput,
  AssetType,
  AssetStatus,
  CreateAssetInput,
  UpdateAssetInput,
  AssetChangeResult,
  AssetLifecycleOutcome,
  AssetLifecycleResult,
  AssetDeleteResult,
  GetAssetOptions,
  AssetView,
  AssetSort,
  AssetFilters,
  ListAssetsInput,
  AssetPage,
} from "./asset";

export {
  AssetError,
  AssetValidationError,
  AssetNotFoundError,
  AssetConflictError,
  AssetStorageError,
  InvalidAssetCursorError,
  type AssetErrorCode,
  type AssetValidationField,
  type AssetHistoryValidationField,
} from "./asset-errors";

export {
  DEFAULT_ASSETS_PAGE_SIZE,
  MAX_ASSETS_PAGE_SIZE,
  NAME_MAX_LENGTH,
  REFERENCE_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  URL_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  INTERVAL_MAX_LENGTH,
  TAG_MAX_LENGTH,
  MAX_TAGS,
  QUERY_MAX_LENGTH,
  DEFAULT_CURRENCY,
  ASSET_SCALAR_FIELDS,
  validateAssetTitle,
  validateAssetId,
  validateAssetType,
  validateAssetStatus,
  validateTags,
  validateAssetDetails,
  validateAssetsLimit,
  validateAssetView,
  validateAssetSort,
  validateAssetFilters,
  normaliseQuery,
  validateToday,
  type AssetScalarField,
  type AssetMoneyField,
  type ValidatedAssetDetails,
} from "./asset-validation";

export {
  ASSET_CURSOR_VERSION,
  encodeAssetCursor,
  decodeAssetCursor,
  assetCursorScopeMatches,
  decodeAssetCursorForScope,
  type AssetCursorPosition,
  type AssetCursorScope,
  type DecodedAssetCursor,
} from "./asset-cursor";

export type { AssetRepository } from "./asset-repository";

/* -------------------------------------------------------------------------- */
/* ASSET-02 — history, obligations and meters                                 */
/* -------------------------------------------------------------------------- */

export {
  ASSET_METER_UNITS,
  ASSET_METER_UNIT_OPTIONS,
  MAX_METER_VALUE,
  isAssetMeterUnit,
  meterUnitShort,
  meterUnitLabel,
  formatMeterReading,
  validateMeterUnit,
  validateMeterValue,
  evaluateMeterThreshold,
  nextMeterThreshold,
  type AssetMeterUnit,
  type MeterReading,
  type MeterCommitment,
  type MeterThresholdState,
  type MeterThresholdEvaluation,
} from "./asset-meter";

export {
  ASSET_EVENT_CATEGORIES,
  ASSET_EVENT_CATEGORY_OPTIONS,
  ASSET_COST_GROUPS,
  ASSET_COST_GROUP_LABELS,
  DEFAULT_ASSET_EVENTS_PAGE_SIZE,
  MAX_ASSET_EVENTS_PAGE_SIZE,
  assetEventCategoryLabel,
  isAssetEventCategory,
  costGroupForCategory,
  canonicalFactForEventCategory,
  SERVICE_EVENT_CATEGORIES,
  type AssetEvent,
  type AssetEventCategory,
  type AssetCostGroup,
  type AssetCostSummary,
  type AssetValuationPoint,
  type AssetEventInput,
  type CreateAssetEventInput,
  type UpdateAssetEventInput,
  type AssetEventChangeResult,
  type AssetEventFilters,
  type ListAssetEventsInput,
  type AssetEventPage,
} from "./asset-event";

/*
 * The obligation DOMAIN is `~/kernel/obligations` (V2.10 LIFE-00). It is
 * re-exported here so the Assets module keeps one import for the Asset record
 * and everything hanging off it — but the definitions live there, and a
 * consumer that has no Asset imports them directly rather than through this
 * barrel.
 */
export {
  OBLIGATION_CATEGORIES,
  OBLIGATION_CATEGORY_OPTIONS,
  OBLIGATION_STATUSES,
  OBLIGATION_RECURRENCE_KINDS,
  OBLIGATION_RECURRENCE_OPTIONS,
  MAX_RECURRENCE_INTERVAL,
  DEFAULT_OBLIGATIONS_PAGE_SIZE,
  MAX_OBLIGATIONS_PAGE_SIZE,
  DEFAULT_ATTENTION_HORIZON_DAYS,
  MAX_ATTENTION_ITEMS,
  OBLIGATION_STATE_LABELS,
  obligationCategoryLabel,
  isObligationCategory,
  isObligationStatus,
  isObligationRecurrenceKind,
  evaluateObligation,
  nextObligationDate,
  isIsoDate,
  addObligationDays,
  addObligationMonths,
  obligationDaysBetween,
  ObligationValidationError,
  type Obligation,
  type ObligationCategory,
  type ObligationStatus,
  type ObligationState,
  type ObligationMeterState,
  type ObligationMeterEvaluation,
  type ObligationEvaluation,
  type ObligationRecurrenceKind,
  type ObligationInput,
  type CreateObligationInput,
  type UpdateObligationInput,
  type ObligationChangeResult,
  type CompleteObligationInput,
  type ObligationTaskOutcome,
  type ObligationFilters,
  type ListObligationsInput,
  type ObligationPage,
  type ObligationAttentionInput,
} from "~/kernel/obligations";

/* What is Asset-SPECIFIC about an obligation — the meter, the two bridges and
 * the Asset-shaped extensions. See `asset-obligation.ts`. */
export {
  canonicalFactForCategory,
  completionEventCategory,
  assetObligationMeter,
  evaluateAssetObligation,
  describeAssetObligationRecurrence,
} from "./asset-obligation";

export {
  EVENT_TITLE_MAX_LENGTH,
  EVENT_DESCRIPTION_MAX_LENGTH,
  PROVIDER_MAX_LENGTH,
  validateAssetEvent,
  validateAssetCompletionExtras,
  validateEventCategory,
  validateEventDate,
  validateOptionalHistoryDate,
  validateEventsLimit,
  validateEventFilters,
  type ValidatedAssetEvent,
  type ValidatedAssetCompletionExtras,
  type ValidationMode,
} from "./asset-history-validation";

export {
  ASSET_HISTORY_CURSOR_VERSION,
  historyFilterKey,
  encodeAssetHistoryCursor,
  decodeAssetHistoryCursor,
  decodeAssetHistoryCursorForScope,
  type AssetHistoryCursorKind,
  type AssetHistoryCursorPosition,
  type AssetHistoryCursorScope,
  type DecodedAssetHistoryCursor,
} from "./asset-history-cursor";

export type {
  AssetHistoryRepository,
  ObligationTaskGateway,
  RecordMeterReadingInput,
  RecordMeterReadingResult,
} from "./asset-history-repository";
