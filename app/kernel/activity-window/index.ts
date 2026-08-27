/**
 * FOLLOW-01 — the bounded Activity WINDOW kernel.
 *
 * One named owner-local period, one bounded read over the append-only Activity
 * stream, and one derivation of what became of the work that period's plan held.
 * Two consumers today (Weekly Planning and the weekly Review) and a third
 * already specified (FOLLOW-02's Goal movement, which reuses the window and the
 * repository rather than building a second one).
 *
 * Nothing in here is stored. See [ADR-110].
 */

export {
  activityWindowPhase,
  buildActivityWindow,
  isInActivityWindow,
  type ActivityWindow,
  type ActivityWindowPhase,
} from "./activity-window";

export {
  GOAL_MOVEMENT_CHUNK_SIZE,
  MAX_WINDOW_EVENTS,
  MAX_WINDOW_TASKS,
  type ActivityWindowRepository,
  type TaskPlanWindowRead,
} from "./activity-window-repository";

export {
  classify,
  derivePeriodPlanAccount,
  isCompletedOutcome,
  isPlanMovement,
  resolvePlanAtWindowOpen,
  TASK_PLAN_OUTCOMES,
  unavailablePlanAccount,
  type PeriodPlanAccount,
  type PeriodPlanAccountInput,
  type PeriodPlanCounts,
  type TaskPlanAccountEntry,
  type TaskPlanEvent,
  type TaskPlanEventKind,
  type TaskPlanOutcome,
  type TaskPlanSubject,
} from "./task-plan-history";

export {
  entryReason,
  movementSentence,
  planAccountFacts,
  planAccountStatement,
  type PeriodPlanStatement,
  type PlanAccountFact,
  type PlanAccountWordsOptions,
} from "./plan-account-words";
