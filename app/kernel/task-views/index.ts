/**
 * TASKS-03 Task saved-views kernel — public surface.
 *
 * Like every other kernel barrel, this exposes only the storage-independent
 * contract (config shape, validation, records, errors, the repository interface
 * and the derived system views). The D1 adapter is NOT re-exported: code wanting
 * persistence constructs it from `app/platform/storage/d1`.
 */

export {
  TASK_VIEW_CONFIG_VERSION,
  TASK_PRESENTATIONS,
  TASK_GROUP_BYS,
  TASK_DENSITIES,
  TASK_VIEW_FILTER_KEYS,
  TASK_VIEW_DELEGATE_MAX_LENGTH,
  TASK_VIEW_ID_MAX_LENGTH,
  DEFAULT_TASK_VIEW_CONFIG,
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  taskViewConfigsEqual,
  taskViewFilterCount,
  type TaskPresentation,
  type TaskGroupBy,
  type TaskDensity,
  type TaskViewFilters,
  type TaskViewConfig,
} from "./task-view-config";

export {
  TASK_VIEW_NAME_MAX_LENGTH,
  MAX_TASK_SAVED_VIEWS,
  type TaskSavedView,
  type NewTaskSavedView,
  type TaskSavedViewPatch,
  type TaskSavedViewChangeResult,
  type TaskViewRepository,
} from "./task-view";

export { TASK_VIEW_CODEC } from "./task-view-codec";

/**
 * V2.7 RECALL-02 — the two named completion-time windows, resolved against the
 * owner's calendar day and their own first day of the week.
 */
export {
  COMPLETED_WINDOW_IDS,
  COMPLETED_WINDOW_LABELS,
  completedRangeTasksHref,
  completedWindowBounds,
  completedWindowConfig,
  parseCompletedWindowId,
  type CompletedWindowBounds,
  type CompletedWindowId,
} from "./task-completed-windows";

export {
  TASK_SYSTEM_VIEW_DEFINITIONS,
  findTaskSystemView,
  isTaskSystemViewId,
  type TaskSystemViewDefinition,
} from "./task-system-views";

export {
  TaskViewError,
  TaskViewValidationError,
  TaskViewNotFoundError,
  TaskViewNameTakenError,
  TaskViewLimitError,
  TaskViewStorageError,
  type TaskViewValidationField,
} from "./task-view-errors";

export {
  validateTaskViewId,
  validateTaskViewName,
  validateTaskViewOwnerId,
  validateTaskViewConfigForWrite,
} from "./task-view-validation";

/**
 * SMART-01 — the ONE translation from a validated view configuration to the
 * repository's filters, shared by `/tasks` and by Weekly Planning's queue.
 */
export { toWorkspaceFilters } from "./task-view-filters";
