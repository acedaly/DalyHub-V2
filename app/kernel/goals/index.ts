/**
 * AREA-02 Goals kernel — public surface.
 */

export type {
  GoalAreaContext,
  GoalOverview,
  GoalProjectFact,
  GoalProjectContribution,
  GoalProjectItem,
  GoalChildrenInput,
  GoalProjectPage,
} from "./goal";

export {
  evaluateGoalProjectContribution,
  EMPTY_GOAL_PROJECT_CONTRIBUTION,
} from "./goal-progress";

export type { GoalRepository } from "./goal-repository";
export type { GoalDetailsRepository } from "./goal-details-repository";
export { GoalStorageError } from "./goal-errors";

export {
  GOAL_DETAILS_UPDATED,
  GOAL_DEFINITION_OF_DONE_MAX_LENGTH,
  validateGoalTargetDate,
  isValidGoalTargetDate,
  normalizeGoalDefinitionOfDone,
  GoalDetailsValidationError,
  GoalDetailsNotFoundError,
  GoalDetailsStorageError,
  GoalDetailsConflictError,
} from "./goal-details";
export type {
  GoalDetails,
  GoalDetailsRecord,
  UpdateGoalDetailsInput,
  GoalDetailsChangeResult,
  GoalDetailsValidationField,
} from "./goal-details";

export {
  GOAL_CURSOR_VERSION,
  encodeGoalCursor,
  decodeGoalCursor,
  decodeGoalCursorForScope,
  goalCursorScopeMatches,
} from "./goal-cursor";
export type {
  GoalCursorPosition,
  GoalCursorScope,
  DecodedGoalCursor,
} from "./goal-cursor";
