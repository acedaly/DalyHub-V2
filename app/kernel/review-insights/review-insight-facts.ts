/**
 * REVIEW-03 Review insights kernel — the FACTS the evaluator reads.
 *
 * Everything here is a number, a date-only `YYYY-MM-DD` string, an id or a
 * title. No display prose, no tone, no classification: those are the
 * evaluator's (`review-insights.ts`). Keeping the two apart is what makes the
 * whole rule set unit-testable without a database, a browser or the wall clock.
 *
 * ── The three kinds of truth (REVIEW-03's central audit finding) ────────────
 *
 * DalyHub can answer three DIFFERENT questions about a Review period, and this
 * module keeps them visibly separate because conflating them is how an insight
 * surface starts lying:
 *
 *   1. **Historical, exact.** What HAPPENED during the period. The FND-05
 *      Activity stream is append-only (ADR-012), so `task.completed`,
 *      `project.completed` and `goal.completed` events inside the period's
 *      instants are an exact record of movement — for THIS period and for every
 *      past one. Nothing needs to have been stored in advance.
 *   2. **Current state only.** What is true NOW: Project health (PROJ-02), Goal
 *      alignment (AREA-03), open/overdue/waiting counts. These are recomputed
 *      live and were never stored, so they describe today and cannot be
 *      re-derived for a past Review point.
 *   3. **Requires a snapshot.** Change in (2) over time — "this Project went
 *      from At risk to On track since your last Review". No amount of querying
 *      reconstructs it, because the inputs (which Tasks were open then) are
 *      themselves current-state. This is the ONLY thing REVIEW-03 persists, in
 *      `review_insight_snapshots` (see `review-insight-snapshot.ts`).
 *
 * Structural ancestry (which Goal/Area a completed Task rolled up to) is read
 * from the CURRENT spine links. A Task moved to a different Project after it
 * was completed is attributed where it lives now. That is a documented,
 * deliberate approximation — the spine stores no link history — and it is
 * stated on the surface rather than hidden.
 */

import type { GoalAlignmentState } from "~/kernel/alignment";
import type {
  ActivityWindow,
  PeriodPlanAccount,
} from "~/kernel/activity-window";
import type { HabitPeriodConsistency } from "~/kernel/habits";
import type { ProjectHealthState } from "~/kernel/project-health";

/* -------------------------------------------------------------------------- */
/* Bounds and exactness                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How much a displayed number can be trusted. Every measure the Review shows
 * carries one, and the surface renders `bounded` and `unavailable` in words —
 * a bounded number is NEVER presented as an exact one (AGENTS.md §16).
 *
 * - `exact`       — a grouped aggregate over the whole workspace scope.
 * - `bounded`     — read under an explicit limit; more may exist ("12+").
 * - `unavailable` — the read failed. Never rendered as zero.
 */
export const INSIGHT_EXACTNESS = ["exact", "bounded", "unavailable"] as const;
export type InsightExactness = (typeof INSIGHT_EXACTNESS)[number];

/** A number that knows how far it can be trusted. */
export interface InsightMeasure {
  readonly value: number;
  readonly exactness: InsightExactness;
}

/** An exact aggregate. */
export function exactMeasure(value: number): InsightMeasure {
  return { value, exactness: "exact" };
}

/** A measure read under a limit: `bounded` only when the limit was reached. */
export function boundedMeasure(value: number, limit: number): InsightMeasure {
  return {
    value: Math.min(value, limit),
    exactness: value >= limit ? "bounded" : "exact",
  };
}

/** The honest "we could not read this" measure. Never zero. */
export const UNAVAILABLE_MEASURE: InsightMeasure = {
  value: 0,
  exactness: "unavailable",
};

/** Render a measure as the number the owner reads: `12`, `12+`, or `—`. */
export function measureLabel(measure: InsightMeasure): string {
  if (measure.exactness === "unavailable") return "Not available";
  return measure.exactness === "bounded"
    ? `${measure.value}+`
    : String(measure.value);
}

/* -------------------------------------------------------------------------- */
/* Period window                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A Review period expressed BOTH as the owner's wall-calendar dates (what the
 * Review stores and the owner reads) and as the half-open UTC instant range the
 * Activity stream is queried with. The conversion happens once, in the module
 * layer, using the owner's timezone preference — never inside SQL, and never
 * inside the evaluator.
 *
 * **FOLLOW-01 moved the shape to `~/kernel/activity-window`**, unchanged, and
 * this is now an alias rather than a second declaration. The Review was the
 * first consumer of a named owner-local window; Weekly Planning is the second
 * and FOLLOW-02's Goal movement is the third, and three surfaces each carrying
 * their own idea of where a week ends is three surfaces that can disagree about
 * which Sunday night a completion belongs to.
 */
export type ReviewPeriodWindow = ActivityWindow;

/* -------------------------------------------------------------------------- */
/* (1) Historical facts — exact, from the append-only Activity stream          */
/* -------------------------------------------------------------------------- */

/** Distinct records completed inside one period. Exact for any period, past or
 * present, because completion events are never rewritten. */
export interface PeriodCompletionCounts {
  readonly tasksCompleted: number;
  readonly projectsCompleted: number;
  readonly goalsCompleted: number;
}

/** One period's completion counts, keyed so a caller can line several up. */
export interface PeriodCompletionPoint extends PeriodCompletionCounts {
  /** The caller's key — a Review id, or `current` for the Review being written. */
  readonly key: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

/**
 * One structural bucket of completed work: how many Tasks completed in the
 * period currently roll up to this (Project, Goal, Area) combination. `null`
 * means "no such ancestor" — a Task with no Project, a Project with no Goal, a
 * Project in no Area. Titles come from the same read so the surface needs no
 * second lookup.
 */
export interface PeriodContributionRow {
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly goalId: string | null;
  readonly goalTitle: string | null;
  readonly areaId: string | null;
  readonly areaTitle: string | null;
  readonly tasksCompleted: number;
}

/** The whole historical half of one period's facts. */
export interface ReviewPeriodHistory {
  readonly completions: PeriodCompletionCounts;
  /** Bounded: the highest-contributing buckets first. */
  readonly contributions: readonly PeriodContributionRow[];
  /** True when more contribution buckets exist beyond the bound. */
  readonly contributionsBounded: boolean;
  /** False when the read failed — counts must then render as unavailable. */
  readonly available: boolean;
}

/* -------------------------------------------------------------------------- */
/* (2) Current-state facts                                                     */
/* -------------------------------------------------------------------------- */

/** One Project's live state, as the Review reads it. Health is PROJ-02's
 * evaluator; nothing here is a second health model. */
export interface ReviewProjectStateFact {
  readonly id: string;
  readonly title: string;
  readonly healthState: ProjectHealthState;
  /** PROJ-02's own calm label for that state, reused verbatim. */
  readonly healthLabel: string;
  readonly openTasks: number;
  readonly overdueTasks: number;
  readonly waitingTasks: number;
  /** Tasks belonging to this Project completed inside the period. */
  readonly tasksCompletedInPeriod: number;
  /** Owner-calendar days since the Project's last meaningful activity. */
  readonly daysSinceActivity: number | null;
  /** True when the Project itself completed inside this period. */
  readonly completedInPeriod: boolean;
}

/** One Goal's live state plus the period's contribution to it. */
export interface ReviewGoalStateFact {
  readonly id: string;
  readonly title: string;
  /** AREA-03's live alignment state, reused — never recomputed here. */
  readonly alignmentState: GoalAlignmentState;
  /** Projects currently able to advance this Goal (AREA-02's boundary). */
  readonly contributingProjects: number;
  /** Of those, how many had a Task completed inside the period. */
  readonly contributingProjectsWithWork: number;
  /** Tasks completed inside the period that roll up to this Goal. */
  readonly tasksCompletedInPeriod: number;
  /** True when the Goal itself completed inside this period. */
  readonly completedInPeriod: boolean;
}

/** One Area's live state plus the period's contribution to it. */
export interface ReviewAreaStateFact {
  readonly id: string;
  readonly title: string;
  readonly activeProjects: number;
  readonly tasksCompletedInPeriod: number;
}

/**
 * One Task still open that was already a commitment before this period began.
 * Bounded and deliberately small: this is an attention signal with names
 * attached, not a second Tasks collection.
 */
export interface CarryOverTaskFact {
  readonly id: string;
  readonly title: string;
  /** `overdue` — due before the period started. `waiting` — waiting since before it. */
  readonly kind: "overdue" | "waiting";
  readonly projectId: string | null;
  readonly projectTitle: string | null;
}

/** The whole current-state half of one period's facts. */
export interface ReviewCurrentState {
  readonly projects: readonly ReviewProjectStateFact[];
  readonly projectsBounded: boolean;
  readonly goals: readonly ReviewGoalStateFact[];
  readonly goalsBounded: boolean;
  readonly areas: readonly ReviewAreaStateFact[];
  readonly areasBounded: boolean;
  readonly carryOver: readonly CarryOverTaskFact[];
  readonly carryOverOverdue: InsightMeasure;
  readonly carryOverWaiting: InsightMeasure;
  readonly available: boolean;
}

/** Everything one Review period knows about itself, before interpretation. */
export interface ReviewInsightFacts {
  readonly window: ReviewPeriodWindow;
  readonly history: ReviewPeriodHistory;
  readonly state: ReviewCurrentState;
  /**
   * FOLLOW-01 — what became of the work this period's PLAN held, derived from
   * the same append-only stream by the same shared authority Weekly Planning
   * reads. It belongs under (1): it is historical and exact, reconstructed from
   * events that are never rewritten.
   *
   * It is deliberately NOT carried into `review_insight_snapshots`. The snapshot
   * exists for facts that cannot be re-derived (state at a past moment); this
   * one always can be, so storing it would be the second copy [ADR-110] refuses.
   */
  readonly planAccount: PeriodPlanAccount;
  /**
   * DEBT-156 / HABITS-01 — routine consistency for the SAME period, from
   * HABITS-01's own `evaluateHabitConsistency`. Not a new metric, not a second
   * denominator, and never a score: two integers and the window they cover.
   */
  readonly habits: HabitPeriodConsistency;
}
