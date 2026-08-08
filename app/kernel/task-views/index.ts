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
