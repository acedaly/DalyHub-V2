/**
 * X-02 saved-views kernel — public surface.
 *
 * The ONE saved-view and cross-module query contract. Like every other kernel
 * barrel this exposes only storage-independent shapes and pure functions; the D1
 * adapters are constructed from `app/platform/storage/d1`.
 *
 * `~/kernel/task-views` is now a thin, backward-compatible façade over the saved-
 * view half of this module: the Tasks configuration codec is still its own, but the
 * record, the repository contract, the errors and the validators are these.
 */

export {
  VIEW_SCOPES,
  VIEW_SCOPE_DEFINITIONS,
  viewScopeDefinition,
  isViewScope,
  availableViewScopes,
  type ViewScope,
  type ViewScopeDefinition,
} from "./view-scopes";

export {
  CROSS_VIEW_CONFIG_VERSION,
  VIEW_DATE_WINDOWS,
  VIEW_DUE_WINDOWS,
  VIEW_ARCHIVE_MODES,
  VIEW_STATES,
  VIEW_CHANGE_BOUNDARIES,
  VIEW_SORTS,
  VIEW_SORT_DIRECTIONS,
  VIEW_GROUP_BYS,
  VIEW_ID_MAX_LENGTH,
  VIEW_TEXT_MAX_LENGTH,
  SHARED_VIEW_FILTER_KEYS,
  SHARED_DIMENSION_SUPPORT,
  ARCHIVABLE_VIEW_SCOPES,
  DEFAULT_CROSS_VIEW_CONFIG,
  parseCrossViewConfig,
  serialiseCrossViewConfig,
  crossViewConfigsEqual,
  crossViewFilterCount,
  resolveViewScopes,
  type ViewDateWindow,
  type ViewDueWindow,
  type ViewArchiveMode,
  type ViewState,
  type ViewChangeBoundary,
  type ViewSort,
  type ViewSortDirection,
  type ViewGroupBy,
  type SharedViewFilters,
  type TaskScopeFilters,
  type ProjectScopeFilters,
  type GoalScopeFilters,
  type NoteScopeFilters,
  type MeetingScopeFilters,
  type ReviewScopeFilters,
  type ModuleViewFilters,
  type CrossViewConfig,
  type ResolvedViewScopes,
} from "./view-config";

export {
  validateCrossViewConfigForWrite,
  CROSS_VIEW_CODEC,
} from "./view-codec";

export {
  SAVED_VIEW_KINDS,
  SAVED_VIEW_NAME_MAX_LENGTH,
  MAX_SAVED_VIEWS_PER_KIND,
  isSavedViewKind,
  type SavedViewKind,
  type SavedView,
  type NewSavedView,
  type SavedViewPatch,
  type SavedViewChangeResult,
  type SavedViewRepository,
  type SavedViewCodec,
} from "./saved-view";

export {
  SavedViewError,
  SavedViewValidationError,
  SavedViewNotFoundError,
  SavedViewNameTakenError,
  SavedViewLimitError,
  SavedViewStorageError,
  type SavedViewValidationField,
} from "./saved-view-errors";

export {
  validateSavedViewId,
  validateSavedViewName,
  validateSavedViewOwnerId,
  requireConfigObject,
} from "./saved-view-validation";

export {
  CROSS_VIEW_SYSTEM_VIEWS,
  findCrossViewSystemView,
  isCrossViewSystemViewId,
  type CrossViewSystemViewDefinition,
} from "./view-system-views";

export type {
  ViewAnchor,
  CrossViewResultHeader,
  TaskResultDetail,
  ProjectResultDetail,
  GoalResultDetail,
  NoteResultDetail,
  MeetingResultDetail,
  ReviewResultDetail,
  CrossViewResultDetail,
  CrossViewResult,
  ViewScopeUnavailableReason,
  UnavailableViewScope,
  CrossViewPage,
} from "./view-result";

export {
  CROSS_VIEW_SCOPE_CANDIDATE_LIMIT,
  CROSS_VIEW_PAGE_LIMIT,
  type CrossViewQueryContext,
  type CrossViewQueryRepository,
} from "./view-query";
