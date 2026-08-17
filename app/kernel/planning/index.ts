/**
 * PLAN-01 — the Planning kernel's public surface.
 *
 * Pure, storage-free week arithmetic and the "Still to place" queue rule. There is
 * deliberately no repository here: Weekly Planning stores NOTHING of its own. The
 * Task's canonical `scheduled_date` is the plan (ADR-030), so a planning surface
 * reads and writes Tasks through the existing Tasks kernel and adds no second
 * record for a week. See `docs/design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`.
 */

export {
  PLANNING_WEEK_DAYS,
  PLANNING_WEEK_MAX_OFFSET,
  PLANNING_WEEK_MIN_OFFSET,
  addPlanningDays,
  clampPlanningOffset,
  defaultPlanningDay,
  isPlanningDate,
  parsePlanningWeekParam,
  planningWeek,
  planningWeekRangeLabel,
  planningWeekStart,
  resolvePlanningDay,
  type PlanningDay,
  type PlanningWeek,
} from "./planning-week";

export {
  PLANNING_QUEUE_BANDS,
  PLANNING_QUEUE_BAND_LABELS,
  PLANNING_QUEUE_BAND_NOTES,
  buildPlanningQueue,
  type PlanningQueue,
  type PlanningQueueBand,
  type PlanningQueueBandResult,
  type PlanningQueueCandidate,
  type PlanningQueueEntry,
} from "./planning-queue";
