/**
 * TODAY-02 Tasks kernel — public surface.
 *
 * Modules and the composition boundary import the task contract from here. This
 * barrel intentionally exposes only the storage-independent contract (types,
 * errors, validation and the repository interface). The D1 adapter is NOT
 * re-exported: code wanting persistence constructs it from
 * `app/platform/storage/d1`, keeping the dependency direction pointing at the
 * contract, not the store (mirrors the entity, EntityLink, Activity and spine
 * barrels).
 */

export {
  TASK_STATUSES,
  TASK_PRIORITIES,
  DEFAULT_TASK_DETAILS,
  type TaskStatus,
  type TaskPriority,
  type TaskRelationKind,
  type TaskRelation,
  type TaskDetails,
  type TaskView,
  type TaskWaiting,
  type TaskWaitingSubject,
  type GetTaskOptions,
  type UpdateTaskInput,
  type UpdateTaskResult,
  type ListTasksInput,
  type TaskListItem,
  type TaskListPage,
  type SetWaitingInput,
  type SetWaitingResult,
  type ClearWaitingResult,
  type CompleteTaskResult,
  type ListWaitingTasksInput,
  type WaitingTaskListItem,
  type WaitingTaskPage,
} from "./task";

export {
  TASK_WAITING_ON,
  WAITING_TARGET_TYPES,
  WAITING_NOTE_MAX_LENGTH,
  RESERVED_TASK_LINK_TYPES,
  TASK_WAITING_STARTED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  isWaitingTargetType,
  isReservedTaskLinkType,
  type WaitingTargetType,
} from "./task-identifiers";

export type { TaskRepository } from "./task-repository";

export {
  TaskError,
  TaskValidationError,
  TaskNotFoundError,
  TaskStorageError,
  CorruptTaskRecordError,
  type TaskErrorCode,
  type TaskValidationField,
} from "./task-errors";

export {
  DEFAULT_TASK_PAGE_SIZE,
  MAX_TASK_PAGE_SIZE,
  validateTaskId,
  validateTaskTitle,
  isTaskStatus,
  validateTaskStatus,
  validateTaskPriority,
  validateTaskDate,
  validateTaskDescription,
  validateTaskLimit,
  validateWaitingNote,
  validateWaitingTargetId,
  validateSetWaitingInput,
} from "./task-validation";
