/**
 * Shared test helpers for building `ProjectHealth` fixtures in component and
 * view-model tests, without re-implementing the evaluator. `stubHealth` returns a
 * real evaluated result from partial facts against a fixed clock, so fixtures stay
 * consistent with production rules.
 */

import {
  evaluateProjectHealth,
  type HealthEvaluationContext,
  type ProjectHealth,
  type ProjectHealthFacts,
} from "~/kernel/project-health";

export const HEALTH_TODAY = "2026-07-22";
export const HEALTH_NOW = new Date("2026-07-22T02:00:00.000Z");

export const healthContext: HealthEvaluationContext = {
  now: HEALTH_NOW,
  todayIso: HEALTH_TODAY,
  calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
};

export function healthFacts(
  overrides: Partial<ProjectHealthFacts> = {},
): ProjectHealthFacts {
  return {
    projectId: "p1",
    completedAt: null,
    createdAt: new Date("2026-07-19T12:00:00.000Z"),
    updatedAt: new Date("2026-07-21T12:00:00.000Z"),
    taskTotal: 4,
    taskCompleted: 1,
    waitingOpen: 0,
    overdueOpen: 0,
    slippedOpen: 0,
    upcomingDueOpen: 0,
    upcomingScheduledOpen: 0,
    oldestWaitingSince: null,
    lastMeaningfulActivityAt: new Date("2026-07-21T12:00:00.000Z"),
    ...overrides,
  };
}

/** Build a real evaluated `ProjectHealth` from partial facts. */
export function stubHealth(
  overrides: Partial<ProjectHealthFacts> = {},
): ProjectHealth {
  return evaluateProjectHealth(healthFacts(overrides), healthContext);
}
