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
