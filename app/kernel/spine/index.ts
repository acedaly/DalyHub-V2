/**
 * FND-07 Spine kernel — public surface.
 *
 * Modules and the composition boundary import the spine kernel from here. This
 * barrel intentionally exposes only the storage-independent contract (identifiers,
 * types, errors, validation, the cursor helpers and the repository interface). The
 * D1 adapter is NOT re-exported: code wanting persistence constructs it from
 * `app/platform/storage/d1`, keeping the dependency direction pointing at the
 * contract, not the store (mirrors the entity, EntityLink and Activity barrels).
 */

export {
  AREA,
  GOAL,
  PROJECT,
  TASK,
  SPINE_KINDS,
  SPINE_LINK_TYPES,
  GOAL_BELONGS_TO_AREA,
  PROJECT_BELONGS_TO_AREA,
  PROJECT_ADVANCES_GOAL,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  GOAL_COMPLETED,
  GOAL_REOPENED,
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  TASK_COMPLETED,
  TASK_REOPENED,
  RESERVED_SPINE_ENTITY_TYPES,
  RESERVED_SPINE_LINK_TYPES,
  isReservedSpineEntityType,
  isReservedSpineLinkType,
  spineLinkTypeFor,
  parentKindOfLinkType,
  childLinkTypesOf,
  completedActivityTypeFor,
  reopenedActivityTypeFor,
  type SpineKind,
  type SpineParentKind,
  type SpineLinkType,
} from "./spine-identifiers";

export type {
  SpineParent,
  SpineRecord,
  GetSpineOptions,
  CreateAreaInput,
  CreateGoalInput,
  CreateProjectInput,
  CreateTaskInput,
  ProjectParentInput,
  TaskParentInput,
  MoveParentInput,
  CompletionOutcome,
  ReopenOutcome,
  CompletionResult,
  SpineLifecycleOutcome,
  SpineLifecycleResult,
  MoveOutcome,
  MoveResult,
  AreaDependencyCounts,
  AreaDeletionOutcome,
  AreaDeletionResult,
  ListSpineChildrenInput,
  SpineChildPage,
  CompletionRollup,
  ProjectRollup,
  GoalRollup,
  AreaRollup,
  SpineRollup,
} from "./spine";

export {
  SpineError,
  SpineValidationError,
  SpineNotFoundError,
  SpineWrongKindError,
  SpineParentUnavailableError,
  SpineInvalidParentKindError,
  SpineHasActiveChildrenError,
  SpineHasDependentsError,
  SpineAreaCompletionError,
  InvalidSpineCursorError,
  SpineConflictError,
  SpineStorageError,
  CorruptSpineRecordError,
  type SpineErrorCode,
  type SpineValidationField,
} from "./spine-errors";

export {
  DEFAULT_SPINE_PAGE_SIZE,
  MAX_SPINE_PAGE_SIZE,
  validateSpineTitle,
  validateSpineId,
  validateSpineKind,
  validateChildKind,
  validateParentKind,
  validateSpineLimit,
  isSpineKind,
} from "./spine-validation";

export type {
  SpineCursorPosition,
  SpineCursorScope,
  DecodedSpineCursor,
} from "./spine-cursor";

export {
  SPINE_CURSOR_VERSION,
  encodeSpineCursor,
  decodeSpineCursor,
  decodeSpineCursorForScope,
  spineCursorScopeMatches,
} from "./spine-cursor";

export {
  type SpineRepository,
  type Clock,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "./spine-repository";
