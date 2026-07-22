/**
 * PROJ-02 Project Health — shared presentation public surface.
 *
 * Re-exports the kernel health model (so consumers import health from one place)
 * plus the React-free view-model and the two shared presentation components used by
 * the Projects collection, the project record and Today.
 */

export {
  STALE_AFTER_DAYS,
  LONG_WAIT_AFTER_DAYS,
  UPCOMING_WITHIN_DAYS,
  evaluateProjectHealth,
} from "~/kernel/project-health";
export type {
  HealthTone,
  ProjectHealthState,
  HealthReasonCode,
  ProjectHealthFacts,
  HealthReason,
  ProjectHealthSummary,
  ProjectHealth,
  HealthEvaluationContext,
} from "~/kernel/project-health";

export {
  createOwnerHealthContext,
  healthToneToCardTone,
  healthReasonText,
  healthAccessibleSummary,
  healthNeedsAttention,
} from "./health-view";
export { HealthIndicator } from "./HealthIndicator";
export { ProjectHealthPanel } from "./ProjectHealthPanel";
