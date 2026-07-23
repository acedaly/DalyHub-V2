/**
 * PROJ-02 Project Health kernel — public surface.
 *
 * Modules and the composition boundary import the derived health model and its
 * read-only facts contract from here. Like the other kernel barrels it exposes only
 * storage-independent shapes and pure functions; the D1 facts adapter is constructed
 * from `app/platform/storage/d1`.
 */

export {
  STALE_AFTER_DAYS,
  LONG_WAIT_AFTER_DAYS,
  UPCOMING_WITHIN_DAYS,
  PROJECT_HEALTH_STATES,
  HEALTH_REASON_CODES,
  MEANINGFUL_HEALTH_ACTIVITY_TYPES,
  evaluateProjectHealth,
  isProjectHealthVisible,
  daysBetweenIsoDates,
  addDaysToIsoDate,
} from "./project-health";
export type {
  HealthTone,
  ProjectHealthState,
  HealthReasonCode,
  ProjectHealthFacts,
  HealthReason,
  ProjectHealthSummary,
  ProjectHealth,
  HealthEvaluationContext,
} from "./project-health";

export type { ProjectHealthRepository } from "./project-health-repository";
