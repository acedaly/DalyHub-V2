/**
 * AREA-01 Areas kernel — public surface.
 */

export type {
  AreaListInput,
  AreaChildrenInput,
  AreaListItem,
  AreaOverview,
  AreaGoalItem,
  AreaProjectParentContext,
  AreaProjectItem,
  AreaListPage,
  AreaGoalPage,
  AreaProjectPage,
  AreaAlignedProjectFact,
  AreaDirectTaskFacts,
  AreaMomentumSourceFacts,
} from "./area";

export type { AreaRepository } from "./area-repository";
export { AreaStorageError } from "./area-errors";

export {
  AREA_CURSOR_VERSION,
  encodeAreaCursor,
  decodeAreaCursor,
  decodeAreaCursorForScope,
  areaCursorScopeMatches,
} from "./area-cursor";
export type {
  AreaCursorKind,
  AreaCursorPosition,
  AreaCursorScope,
  DecodedAreaCursor,
} from "./area-cursor";

export { evaluateAreaMomentum } from "./area-momentum";
export type {
  AreaMomentumState,
  AreaMomentumTone,
  AreaMomentumReasonCode,
  AreaMomentumReason,
  AreaMomentumProjectFacts,
  AreaMomentumGoalFacts,
  AreaMomentumDirectTaskFacts,
  AreaMomentumFacts,
  AreaMomentumContext,
  AreaMomentum,
} from "./area-momentum";
