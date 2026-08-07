/**
 * PROJ-02 Project Health — shared presentation public surface.
 *
 * Re-exports the kernel health model (so consumers import health from one place)
 * plus the React-free view-model and the shared presentation used by the Projects
 * collection, the project record and Today.
 *
 * RECORD-01 removed `ProjectHealthPanel`: its bulleted reasons became
 * `healthSignals` in the compact record summary band, and the one fact it
 * carried that no reason did (the last recorded activity) moved to the
 * project's Settings details. See `health-view.ts` for the reasoning.
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
  healthSignals,
} from "./health-view";
export { HealthIndicator } from "./HealthIndicator";
