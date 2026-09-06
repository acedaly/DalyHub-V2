/**
 * REVIEW-03 Review insights kernel — the RULES.
 *
 * A pure, storage-independent, browser-independent evaluator: given one
 * period's facts, the previous Review's snapshot (when there is one) and a
 * bounded completion series, it returns the presentation model the Review
 * evidence surface renders. It reads no repository, imports no React and never
 * touches the wall clock, so the whole rule set is unit-testable directly.
 *
 * ── What this feature refuses to do ─────────────────────────────────────────
 * There is no score, no index, no grade, no percentage of a life, and no
 * weighted composite of unlike things. DalyHub can say, separately and
 * confidently, what completed, what contributed, how health moved, what is
 * carrying over and where work landed — so it says those, and keeps them apart.
 * A single number that mixed them would look precise and mean nothing.
 *
 * There is also no unexplained label. Every classification this module emits
 * carries a `reason` built from the counts that produced it, so "Moving" is
 * always followed by why, and the owner can disagree with the rule rather than
 * having to trust it.
 *
 * ── What it refuses to invent ───────────────────────────────────────────────
 * Absence renders LESS, never a zero. A first Review has nothing to compare
 * against and says so in one calm sentence instead of showing "0 improved, 0
 * declined, 0 resolved". A Goal with no contributing Projects is not "stalled";
 * it has no contribution path, which is a different fact. A read that failed is
 * "not available", never nought.
 */

import {
  entryReason,
  planAccountStatement,
  type PlanAccountFact,
  type TaskPlanOutcome,
} from "~/kernel/activity-window";
import type { GoalAlignmentState } from "~/kernel/alignment";
import {
  projectHealthNeedsLook,
  type ProjectHealthState,
} from "~/kernel/project-health";

import {
  MIN_ACROSS_REVIEWS,
  readAcrossReviews,
  HEALTH_CONCERN_RANK,
} from "./across-reviews";
import {
  exactMeasure,
  measureLabel,
  type InsightMeasure,
  type PeriodCompletionPoint,
  type ReviewGoalStateFact,
  type ReviewInsightFacts,
} from "./review-insight-facts";
import type {
  ReviewInsightSnapshot,
  SnapshotGoalContribution,
  StoredReviewInsightSnapshot,
} from "./review-insight-snapshot";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The presentation tone of an insight. A subset of the shared card/record tone
 * vocabulary, and deliberately without `danger`: nothing in a Review is an
 * emergency, and an evidence surface that shouts is one the owner learns to
 * skip. Meaning is always carried by the words as well, never by colour alone.
 */
export type InsightTone = "neutral" | "success" | "info" | "warning";

/** A link out of an insight, so every claim is inspectable. Existing
 * destinations only — the Review never builds a parallel record browser. */
export interface InsightLink {
  readonly label: string;
  readonly to: string;
}

/**
 * One piece of evidence. `label` is the claim, `reason` is why it is true, and
 * `links` is how the owner checks it. The UI renders these; it does not
 * recompute them.
 */
export interface Insight {
  readonly id: string;
  readonly tone: InsightTone;
  readonly label: string;
  readonly reason: string;
  readonly measure: InsightMeasure | null;
  readonly links: readonly InsightLink[];
  /** The records this insight is about, for drill-down and for tests. */
  readonly entityIds: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Goal contribution                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether the period's work actually advanced a Goal.
 *
 * The rule uses only signals DalyHub already trusts — completed work rolled up
 * through the spine, and AREA-03's own live alignment state — so it introduces
 * no new threshold and no second Goal-health model:
 *
 *   - `moving`       — Tasks completed during the period roll up to this Goal.
 *   - `limited`      — none did, but AREA-03 still reads the Goal as recently
 *                      active, so contributing work happened outside the
 *                      period's completions (planned, rescheduled, started).
 *   - `none`         — no completed work this period, and AREA-03 reads it as
 *                      having had no recent action either.
 *   - `no_structure` — no Project currently advances this Goal at all. That is
 *                      a missing path, not a stalled one, and saying "no
 *                      movement" would blame the owner for a structure they
 *                      never built.
 *   - `completed`    — the Goal itself is done. Calm, and always wins.
 */
export type GoalContributionState = SnapshotGoalContribution;

/** Display order: the Goals worth a look lead, exactly as AREA-03 orders its
 * own collection. `moving` is not hidden — it is the evidence of a good week —
 * but it does not need to be read first. */
export const GOAL_CONTRIBUTION_DISPLAY_RANK: Readonly<
  Record<GoalContributionState, number>
> = {
  none: 0,
  limited: 1,
  moving: 2,
  no_structure: 3,
  completed: 4,
};

/** One Goal's contribution verdict, with the facts that produced it. */
export interface GoalContributionInsight {
  readonly goalId: string;
  readonly title: string;
  readonly state: GoalContributionState;
  readonly label: string;
  readonly tone: InsightTone;
  readonly reason: string;
  readonly tasksCompleted: number;
  readonly contributingProjectsWithWork: number;
  readonly contributingProjects: number;
  readonly links: readonly InsightLink[];
}

/** The pure classification, split out so it can be reused when building a
 * snapshot without rebuilding the whole presentation model. */
export function classifyGoalContribution(
  goal: Pick<
    ReviewGoalStateFact,
    | "tasksCompletedInPeriod"
    | "contributingProjects"
    | "alignmentState"
    | "completedInPeriod"
  > & { readonly alignmentState: GoalAlignmentState },
): GoalContributionState {
  if (goal.completedInPeriod) return "completed";
  if (goal.alignmentState === "completed") return "completed";
  if (goal.contributingProjects === 0) return "no_structure";
  if (goal.tasksCompletedInPeriod > 0) return "moving";
  return goal.alignmentState === "active" ? "limited" : "none";
}

const GOAL_CONTRIBUTION_LABELS: Readonly<
  Record<GoalContributionState, string>
> = {
  moving: "Moving",
  limited: "Limited movement",
  none: "No recent movement",
  no_structure: "No contribution path",
  completed: "Completed",
};

const GOAL_CONTRIBUTION_TONES: Readonly<
  Record<GoalContributionState, InsightTone>
> = {
  moving: "success",
  limited: "info",
  none: "info",
  no_structure: "neutral",
  completed: "neutral",
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

function goalContributionReason(
  goal: ReviewGoalStateFact,
  state: GoalContributionState,
): string {
  switch (state) {
    case "completed":
      return "This Goal is complete.";
    case "no_structure":
      return "No Project currently advances this Goal, so there is nothing for work to roll up through.";
    case "moving":
      return goal.contributingProjectsWithWork > 0
        ? `${plural(goal.tasksCompletedInPeriod, "Task", "Tasks")} completed this period, across ${plural(goal.contributingProjectsWithWork, "contributing Project", "contributing Projects")}.`
        : `${plural(goal.tasksCompletedInPeriod, "Task", "Tasks")} completed this period rolled up to this Goal.`;
    case "limited":
      return `No Tasks were completed for this Goal this period, but contributing work was recorded recently across ${plural(goal.contributingProjects, "Project", "Projects")}.`;
    case "none":
      return `No completed work rolled up to this Goal this period, and none was recorded recently across ${plural(goal.contributingProjects, "Project", "Projects")}.`;
  }
}

/* -------------------------------------------------------------------------- */
/* Project health change                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How pressing a health state is, for the sole purpose of deciding whether a
 * transition read as better or worse. It is NOT a score and is never shown:
 * `at_risk` outranks `blocked` because overdue commitments are the ones with a
 * date attached, and `completed` is excluded entirely — a finished Project is
 * movement, reported under what changed, not a health improvement.
 */
// ONE ranking, stated in `across-reviews.ts` and consumed here: the series
// evaluator's "the state it held most often" breaks ties exactly as a
// transition is judged, or the two would name different states.

export type ProjectHealthChangeKind =
  | "improved"
  | "deteriorated"
  | "unchanged"
  | "new"
  /**
   * V2.7 RECALL-04 — one side of the comparison has NO reading (DEBT-234), so
   * there is no movement to report in either direction. Distinct from
   * `unchanged` on purpose: "it is where it was" is a finding about the Project;
   * this is a finding about the evidence.
   */
  | "unknown";

/** One Project's health movement between two Review points. */
export interface ProjectChangeInsight {
  readonly projectId: string;
  readonly title: string;
  readonly kind: ProjectHealthChangeKind;
  readonly from: ProjectHealthState | null;
  readonly to: ProjectHealthState;
  readonly label: string;
  readonly tone: InsightTone;
  readonly reason: string;
  readonly links: readonly InsightLink[];
}

/**
 * The pure transition rule.
 *
 * Three different absences, three different answers — V2.7 RECALL-04 (DEBT-234)
 * made the second and third distinguishable, because before it they were the
 * same value and the wrong one was chosen:
 *
 *   - `previous` **undefined** — the Project was not in the previous snapshot at
 *     all: it did not exist yet, or fell outside the snapshot's bound. That is
 *     `new`, and it is not reported as a change.
 *   - `previous` **null** — the previous Review recorded that it had NO health
 *     reading for this Project. There is nothing to compare against, so nothing
 *     can be said: `unknown`.
 *   - `current` **null** — there is no reading NOW. Same answer, same reason.
 *
 * The defect this closes: a missing reading used to arrive as `"on_track"`, was
 * stored in the snapshot as though measured, and then compared as a real
 * reading — so a Project that simply became readable between two Reviews could
 * be announced as having "deteriorated", and one that stopped being readable as
 * having "improved". Both are stories the data does not support. Restoring the
 * `"on_track"` default reddens the RECALL-04 regressions.
 */
export function classifyProjectHealthChange(
  previous: ProjectHealthState | null | undefined,
  current: ProjectHealthState | null,
): ProjectHealthChangeKind {
  if (previous === undefined) return "new";
  if (previous === null || current === null) return "unknown";
  if (previous === current) return "unchanged";
  const before = HEALTH_CONCERN_RANK[previous];
  const after = HEALTH_CONCERN_RANK[current];
  if (after < before) return "improved";
  if (after > before) return "deteriorated";
  return "unchanged";
}

/* -------------------------------------------------------------------------- */
/* Trends                                                                      */
/* -------------------------------------------------------------------------- */

/** The direction of a bounded series. `flat` is a real answer, not a fallback:
 * "the same as last time" is often the most useful thing a trend can say. */
export type TrendDirection = "up" | "down" | "flat" | "insufficient";

/**
 * One point on a trend.
 *
 * `label` is the period in full ("27 July – 2 August 2026") and is what the
 * summary sentence uses. `shortLabel` is what fits under a bar — the period's
 * last day — because a full range repeated six times across an axis is a wall
 * of wrapped text, and the axis is decorative anyway (the summary is the
 * authoritative reading of the same numbers).
 */
export interface TrendPoint {
  readonly key: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly value: number;
  /** True for the period being reviewed, so the surface can mark it. */
  readonly current: boolean;
}

/**
 * A small, bounded historical trend. `summary` is the sentence a screen reader
 * hears and a chart-free layout shows; the chart is an addition to it, never a
 * replacement for it (AGENTS.md §15).
 */
export interface InsightTrend {
  readonly id: string;
  readonly label: string;
  readonly direction: TrendDirection;
  /** `higher_is_better` decides only the TONE of a direction, never the maths. */
  readonly higherIsBetter: boolean;
  readonly points: readonly TrendPoint[];
  readonly summary: string;
  /**
   * CONVERGE-01 §I — the VISIBLE caption: the sentence {@link summary} opens
   * with, without the per-period enumeration. The enumeration stays in
   * `summary`, which is the chart's accessible description.
   */
  readonly headline: string;
}

/** At least this many points before a trend is worth drawing. Two points is a
 * comparison; one is a number with decoration. */
export const MIN_TREND_POINTS = 2;

/** Direction from the first and last points of a bounded series. Deliberately
 * not a regression: the owner is comparing "then" with "now", and a fitted
 * slope over five points would be a more impressive way to say less. */
export function trendDirection(points: readonly TrendPoint[]): TrendDirection {
  if (points.length < MIN_TREND_POINTS) return "insufficient";
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}

/* -------------------------------------------------------------------------- */
/* The period's plan account (FOLLOW-01)                                       */
/* -------------------------------------------------------------------------- */

/** How many Tasks one account line names before the count speaks for the rest. */
export const MAX_NAMED_PER_PLAN_FACT = 4;

/** One named Task behind one line of the account. */
export interface PlanAccountInsightEntry {
  readonly taskId: string;
  readonly title: string;
  readonly outcome: TaskPlanOutcome;
  /** The dates the outcome was read from, in the owner's own format. */
  readonly reason: string;
  readonly link: InsightLink;
}

/**
 * The Review's account of the period's PLAN — the return arrow of the loop V2.3
 * drew, and deliberately NOT a sixth metric tile.
 *
 * It states what the period's plan held and what became of it, in the same words
 * `/plan` uses for the same week, from the same derivation. There is no
 * percentage of plan kept, no grade and no comparison of one period's adherence
 * against another's: [ADR-110] decision 4 forbids all three, and this shape has
 * nowhere to put them.
 */
export interface PeriodPlanInsight {
  /** The one sentence. */
  readonly headline: string;
  /** What moved, or null when nothing did. */
  readonly movement: string | null;
  /** The non-zero lines, in the derivation's fixed order. */
  readonly facts: readonly PlanAccountFact[];
  /** Bounded named Tasks behind the lines, so every count is drillable. */
  readonly entries: readonly PlanAccountInsightEntry[];
  /** A calm sentence about the limits of what is shown, or null. */
  readonly note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Comparison basis                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What this Review can honestly compare itself against — and, when it cannot,
 * why. Every "no comparison" case is a distinct, nameable situation, because
 * "this is your first Review" and "your last Review predates insight history"
 * deserve different sentences.
 */
export type InsightComparison =
  | { readonly kind: "first_review" }
  | { readonly kind: "no_snapshot"; readonly previousPeriodLabel: string }
  | {
      readonly kind: "snapshot";
      readonly previousReviewId: string;
      readonly previousPeriodLabel: string;
    };

/* -------------------------------------------------------------------------- */
/* The presentation model                                                      */
/* -------------------------------------------------------------------------- */

/** Everything the Review evidence surface renders. Fully JSON-serialisable, so
 * a loader hands it straight to the browser. */
export interface ReviewInsights {
  readonly periodLabel: string;
  readonly comparison: InsightComparison;
  /**
   * FOLLOW-01 — what became of the work this period's PLAN held. Null when the
   * period held no plan AND finished nothing outside one, which is a real and
   * unremarkable way to have a week rather than a section of zeroes.
   */
  readonly planAccount: PeriodPlanInsight | null;
  /**
   * DEBT-156 — routine consistency for the same period, from HABITS-01's own
   * derivation. Null when the period asked nothing of any Habit, because "0 of
   * 0" is not a reading.
   */
  readonly habits: Insight | null;
  /** What changed: concrete movement inside the period. */
  readonly movement: readonly Insight[];
  /** Where the work contributed. */
  readonly goalContribution: readonly GoalContributionInsight[];
  /** How Project health moved since the previous Review point. */
  readonly projectChanges: readonly ProjectChangeInsight[];
  /** Unfinished commitments and stagnation. */
  readonly attention: readonly Insight[];
  /** Which Areas received completed work, and which received none. */
  readonly distribution: readonly Insight[];
  /**
   * V2.9 INS-02 — what the SERIES of stored snapshots says that one cannot: a
   * Project's health across several Reviews, a Goal's contribution across them,
   * and the commitments that carried over at every one. Empty when the series
   * is shorter than two Reviews, or when nothing in it changed.
   */
  readonly acrossReviews: readonly Insight[];
  /** Small bounded trends over recent Reviews. */
  readonly trends: readonly InsightTrend[];
  /** Calm sentences about the limits of what is shown. Never a disclaimer wall. */
  readonly notes: readonly string[];
  /** True when there is genuinely nothing to show — the surface renders one
   * empty state rather than five empty sections. */
  readonly isEmpty: boolean;
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

/** How many Areas the distribution section names before it stops listing. */
export const MAX_DISTRIBUTION_AREAS = 6;
/** How many Projects the health-change section names per direction. */
export const MAX_PROJECT_CHANGES = 6;
/** How many Goals the contribution section names. */
export const MAX_GOAL_CONTRIBUTIONS = 8;
/** How many carrying-over commitments are named before the count speaks. */
export const MAX_NAMED_CARRY_OVER = 5;
/**
 * How many records an insight's REASON names before it stops listing.
 *
 * A calm surface does not read out nine Project titles in one sentence. Past
 * this bound the reason names the first few and says how many more there are;
 * the links beneath it still reach every one, so nothing is hidden — it is just
 * not shouted.
 */
export const MAX_NAMED_IN_REASON = 4;

/** "A, B and C" — or "A, B, C and 5 more" past the naming bound. */
function nameList(titles: readonly string[]): string {
  if (titles.length <= MAX_NAMED_IN_REASON) return titles.join(", ");
  const named = titles.slice(0, MAX_NAMED_IN_REASON).join(", ");
  return `${named} and ${titles.length - MAX_NAMED_IN_REASON} more`;
}

export interface ReviewInsightsInput {
  readonly periodLabel: string;
  readonly facts: ReviewInsightFacts;
  /** The previous Review this one compares against, when one exists. */
  readonly previous: {
    readonly reviewId: string;
    readonly periodLabel: string;
    readonly snapshot: ReviewInsightSnapshot | null;
  } | null;
  /**
   * Completion counts for recent Review periods, OLDEST first, including this
   * one last. Exact for every period — read from the append-only Activity
   * stream, so a workspace that has never captured a snapshot still gets a
   * truthful trend.
   */
  readonly series: readonly PeriodCompletionPoint[];
  /** Full labels for the series keys, so the evaluator formats no dates itself. */
  readonly seriesLabels: Readonly<Record<string, string>>;
  /** Short axis labels for the same keys. Falls back to the full label. */
  readonly seriesShortLabels?: Readonly<Record<string, string>>;
  /** The key in `series` that is this Review's own period. */
  readonly currentSeriesKey: string;
  /**
   * V2.9 INS-02 — the snapshots of this Review and the ones before it, oldest
   * first (`listSnapshotSeries`). Absent, or shorter than two, produces no
   * across-Reviews section at all — which is the point: one Review is the
   * period this panel is already about, not a series.
   */
  readonly snapshotSeries?: readonly StoredReviewInsightSnapshot[];
  /**
   * The owner's date format, for the plan account's per-Task reasons. Supplied
   * by the caller like every other label on this input, so the evaluator formats
   * no date itself. Defaults to the ISO value, which is a real date rather than
   * a placeholder.
   */
  readonly formatDay?: (iso: string) => string;
}

/** Internal: the input plus the resolved comparison, so the section builders
 * need not each re-derive it. */
interface ResolvedInput extends ReviewInsightsInput {
  readonly comparisonKindHint: InsightComparison["kind"];
}

function taskLink(view: string, label: string): InsightLink {
  return { label, to: `/tasks?system=${view}` };
}

function projectLink(id: string, title: string): InsightLink {
  return { label: title, to: `/projects/${id}` };
}

function goalLink(id: string, title: string): InsightLink {
  return { label: title, to: `/goals/${id}` };
}

function areaLink(id: string, title: string): InsightLink {
  return { label: title, to: `/areas/${id}` };
}

/**
 * X-02 — a link from a piece of Review evidence into the CROSS-MODULE view that
 * holds the same question open afterwards.
 *
 * REVIEW-03 says what was true when the period closed; a saved view keeps showing
 * it as the records move. These are ordinary links to the existing `/views`
 * surface, expressed in its own URL vocabulary — the Review still builds no
 * parallel record browser, computes nothing new, and stores nothing here.
 */
function crossViewLink(query: string, label: string): InsightLink {
  return { label, to: `/views?${query}` };
}

/**
 * The X-02 view queries REVIEW-03's evidence links into. Exported so a test can
 * prove each one still DECODES to the cross-module configuration it claims —
 * a link that quietly stopped meaning what its label says would be worse than no
 * link at all.
 */
export const REVIEW_INSIGHT_VIEW_QUERIES = {
  /** The built-in "Needs attention" view. */
  attention:
    "show=task,project,goal,meeting,review&attention=1&sort=due&dir=asc",
  /** Projects whose PROJ-02 health moved since the last completed Review. */
  healthMoved: "show=project&p.moved=1",
  /** Everything that changed since the last completed Review's period closed. */
  changedSinceReview: "show=task,project,goal,note,meeting&changed=last_review",
} as const;

const ATTENTION_VIEW_QUERY = REVIEW_INSIGHT_VIEW_QUERIES.attention;
const HEALTH_MOVED_VIEW_QUERY = REVIEW_INSIGHT_VIEW_QUERIES.healthMoved;
const CHANGED_SINCE_REVIEW_VIEW_QUERY =
  REVIEW_INSIGHT_VIEW_QUERIES.changedSinceReview;

/* -- What changed ---------------------------------------------------------- */

function buildMovement(input: ResolvedInput): Insight[] {
  const { facts } = input;
  const insights: Insight[] = [];
  if (!facts.history.available) {
    return [
      {
        id: "movement.unavailable",
        tone: "neutral",
        label: "Movement is not available",
        reason:
          "The Activity history behind these figures could not be read just now. Nothing in your Review has changed.",
        measure: null,
        links: [],
        entityIds: [],
      },
    ];
  }

  const { tasksCompleted, projectsCompleted, goalsCompleted } =
    facts.history.completions;

  if (tasksCompleted > 0) {
    const projectsWithWork = facts.history.contributions.filter(
      (row) => row.projectId !== null && row.tasksCompleted > 0,
    ).length;
    insights.push({
      id: "movement.tasks",
      tone: "success",
      label: `${plural(tasksCompleted, "Task", "Tasks")} completed`,
      reason:
        projectsWithWork > 0
          ? `Across ${plural(projectsWithWork, "Project", "Projects")}.`
          : "None of them belonged to a Project.",
      measure: { value: tasksCompleted, exactness: "exact" },
      links: [taskLink("completed", "Open completed Tasks")],
      entityIds: [],
    });
  }

  if (projectsCompleted > 0) {
    const completed = facts.state.projects.filter(
      (project) => project.completedInPeriod,
    );
    insights.push({
      id: "movement.projects",
      tone: "success",
      label: `${plural(projectsCompleted, "Project", "Projects")} completed`,
      reason:
        completed.length > 0
          ? nameList(completed.map((project) => project.title))
          : "Finished during this period.",
      measure: { value: projectsCompleted, exactness: "exact" },
      links: completed.map((project) => projectLink(project.id, project.title)),
      entityIds: completed.map((project) => project.id),
    });
  }

  if (goalsCompleted > 0) {
    const completed = facts.state.goals.filter(
      (goal) => goal.completedInPeriod,
    );
    insights.push({
      id: "movement.goals",
      tone: "success",
      label: `${plural(goalsCompleted, "Goal", "Goals")} completed`,
      reason:
        completed.length > 0
          ? nameList(completed.map((goal) => goal.title))
          : "Finished during this period.",
      measure: { value: goalsCompleted, exactness: "exact" },
      links: completed.map((goal) => goalLink(goal.id, goal.title)),
      entityIds: completed.map((goal) => goal.id),
    });
  }

  // A Project that was stalled at the previous Review and has completed work
  // now is the single most encouraging thing this surface can report, and it is
  // only knowable with a snapshot.
  const previousSnapshot = input.previous?.snapshot ?? null;
  if (previousSnapshot) {
    const previousHealth = new Map(
      previousSnapshot.projects.map((project) => [project.id, project.health]),
    );
    const restarted = facts.state.projects.filter(
      (project) =>
        previousHealth.get(project.id) === "stale" &&
        project.tasksCompletedInPeriod > 0,
    );
    if (restarted.length > 0) {
      insights.push({
        id: "movement.restarted",
        tone: "success",
        label: `${plural(restarted.length, "stalled Project", "stalled Projects")} moved again`,
        reason: `${nameList(restarted.map((project) => project.title))} had completed work this period after showing none at your last Review.`,
        measure: { value: restarted.length, exactness: "exact" },
        links: restarted.map((project) =>
          projectLink(project.id, project.title),
        ),
        entityIds: restarted.map((project) => project.id),
      });
    }
  }

  return insights;
}

/* -- Goal contribution ----------------------------------------------------- */

function buildGoalContribution(
  input: ResolvedInput,
): GoalContributionInsight[] {
  return [...input.facts.state.goals]
    .map((goal) => {
      const state = classifyGoalContribution(goal);
      return {
        goalId: goal.id,
        title: goal.title,
        state,
        label: GOAL_CONTRIBUTION_LABELS[state],
        tone: GOAL_CONTRIBUTION_TONES[state],
        reason: goalContributionReason(goal, state),
        tasksCompleted: goal.tasksCompletedInPeriod,
        contributingProjectsWithWork: goal.contributingProjectsWithWork,
        contributingProjects: goal.contributingProjects,
        links: [goalLink(goal.id, goal.title)],
      } satisfies GoalContributionInsight;
    })
    .sort((a, b) => {
      const rank =
        GOAL_CONTRIBUTION_DISPLAY_RANK[a.state] -
        GOAL_CONTRIBUTION_DISPLAY_RANK[b.state];
      if (rank !== 0) return rank;
      const title = a.title.localeCompare(b.title);
      if (title !== 0) return title;
      return a.goalId.localeCompare(b.goalId);
    })
    .slice(0, MAX_GOAL_CONTRIBUTIONS);
}

/* -- Project health change ------------------------------------------------- */

const HEALTH_LABELS: Readonly<Record<ProjectHealthState, string>> = {
  on_track: "On track",
  stale: "No recent activity",
  blocked: "Waiting on something",
  at_risk: "At risk",
  completed: "Completed",
};

/**
 * The tone each health state carries when it is the SUBJECT of a claim rather
 * than one end of a transition. `danger` is absent, as everywhere in this
 * model: nothing in a Review is an emergency (ADR-079 decision 6).
 */
const HEALTH_TONES: Readonly<Record<ProjectHealthState, InsightTone>> = {
  on_track: "success",
  stale: "info",
  blocked: "info",
  at_risk: "warning",
  completed: "neutral",
};

function buildProjectChanges(input: ResolvedInput): ProjectChangeInsight[] {
  const snapshot = input.previous?.snapshot ?? null;
  if (!snapshot) return [];
  const previousHealth = new Map(
    snapshot.projects.map((project) => [project.id, project.health]),
  );

  const changes: ProjectChangeInsight[] = [];
  for (const project of input.facts.state.projects) {
    if (project.completedInPeriod) continue; // movement, not health.
    /*
     * V2.7 RECALL-04 — `has` rather than `??`, because the map's VALUE can now
     * legitimately be null ("the last Review had no reading for this Project")
     * and that is a different fact from "this Project was not in the last
     * snapshot". Collapsing them is what let an absence be read as a state.
     */
    const previous = previousHealth.has(project.id)
      ? (previousHealth.get(project.id) ?? null)
      : undefined;
    // No reading NOW is not a transition; the guard is here as well as inside
    // the rule so the narrowing below is the compiler's rather than a cast.
    const currentState = project.healthState;
    if (currentState === null) continue;
    const kind = classifyProjectHealthChange(previous, currentState);
    if (kind !== "improved" && kind !== "deteriorated") continue;
    const fromLabel =
      previous === null || previous === undefined
        ? null
        : HEALTH_LABELS[previous];
    changes.push({
      projectId: project.id,
      title: project.title,
      kind,
      from: previous ?? null,
      to: currentState,
      label:
        fromLabel === null
          ? HEALTH_LABELS[currentState]
          : `${fromLabel} → ${HEALTH_LABELS[currentState]}`,
      tone: kind === "improved" ? "success" : "warning",
      reason:
        kind === "improved"
          ? `Health improved since your last Review. ${project.tasksCompletedInPeriod > 0 ? `${plural(project.tasksCompletedInPeriod, "Task", "Tasks")} completed this period.` : "No Tasks were completed this period — the change came from its remaining work."}`
          : `Health worsened since your last Review. ${project.overdueTasks > 0 ? `${plural(project.overdueTasks, "Task is", "Tasks are")} now overdue.` : project.daysSinceActivity === null ? "No activity has been recorded." : `Last activity was ${plural(project.daysSinceActivity, "day", "days")} ago.`}`,
      links: [
        projectLink(project.id, project.title),
        crossViewLink(
          HEALTH_MOVED_VIEW_QUERY,
          "Projects whose health moved since your last Review",
        ),
      ],
    });
  }

  return changes
    .sort((a, b) => {
      // Deterioration first — it is the half that needs a decision.
      if (a.kind !== b.kind) return a.kind === "deteriorated" ? -1 : 1;
      const title = a.title.localeCompare(b.title);
      if (title !== 0) return title;
      return a.projectId.localeCompare(b.projectId);
    })
    .slice(0, MAX_PROJECT_CHANGES * 2);
}

/* -- Attention ------------------------------------------------------------- */

function buildAttention(
  input: ResolvedInput,
  /** Projects already reported under health change. A Project belongs in ONE
   * place: if its health moved, that is the news; if it is simply sitting where
   * it was, that is the attention item. Repeating it under both headings would
   * make a two-Project week read like a four-Project one. */
  alreadyReported: ReadonlySet<string>,
): Insight[] {
  const { facts } = input;
  const insights: Insight[] = [];
  const snapshot = input.previous?.snapshot ?? null;
  const previousCarryOver = new Set(snapshot?.carryOverTaskIds ?? []);

  const overdue = facts.state.carryOver.filter(
    (task) => task.kind === "overdue",
  );
  if (facts.state.carryOverOverdue.exactness === "unavailable") {
    insights.push({
      id: "attention.carry_over.unavailable",
      tone: "neutral",
      label: "Carried-over work is not available",
      reason:
        "The read behind this could not complete. Nothing in your Review has changed.",
      measure: facts.state.carryOverOverdue,
      links: [],
      entityIds: [],
    });
  } else if (facts.state.carryOverOverdue.value > 0) {
    const repeated = overdue.filter((task) => previousCarryOver.has(task.id));
    const named = overdue.slice(0, MAX_NAMED_CARRY_OVER);
    insights.push({
      id: "attention.carry_over.overdue",
      tone: "warning",
      label: `${measureLabel(facts.state.carryOverOverdue)} overdue ${facts.state.carryOverOverdue.value === 1 ? "commitment" : "commitments"} carried into this period`,
      reason:
        repeated.length > 0
          ? `${plural(repeated.length, "of them was", "of them were")} already carrying over at your last Review.`
          : "Each was already past its due date when this period began, and is still open.",
      measure: facts.state.carryOverOverdue,
      links: [
        ...named.map((task) => ({
          label: task.title,
          to: `/tasks?task=${task.id}`,
        })),
        taskLink("overdue", "Open overdue Tasks"),
        crossViewLink(
          CHANGED_SINCE_REVIEW_VIEW_QUERY,
          "Everything that changed since your last Review",
        ),
      ],
      entityIds: overdue.map((task) => task.id),
    });
  }

  const waiting = facts.state.carryOver.filter(
    (task) => task.kind === "waiting",
  );
  if (facts.state.carryOverWaiting.value > 0) {
    insights.push({
      id: "attention.carry_over.waiting",
      tone: "info",
      label: `${measureLabel(facts.state.carryOverWaiting)} ${facts.state.carryOverWaiting.value === 1 ? "item has" : "items have"} been waiting since before this period`,
      reason:
        "Work waiting on someone or something else does not move on its own — this is the moment to chase or release it.",
      measure: facts.state.carryOverWaiting,
      links: [
        ...waiting.slice(0, MAX_NAMED_CARRY_OVER).map((task) => ({
          label: task.title,
          to: `/tasks?task=${task.id}`,
        })),
        taskLink("waiting", "Open waiting Tasks"),
      ],
      entityIds: waiting.map((task) => task.id),
    });
  }

  // Projects that are open, concerning, and had nothing completed. Stated as
  // an observation with names attached, never as a verdict about the owner.
  const stuck = facts.state.projects.filter(
    (project) =>
      !alreadyReported.has(project.id) &&
      !project.completedInPeriod &&
      project.tasksCompletedInPeriod === 0 &&
      projectHealthNeedsLook(project.healthState),
  );
  if (stuck.length > 0) {
    /*
     * "In the same position" needs the previous reading to have BEEN a
     * position. This was `previous.health !== "on_track"`, which was true of
     * every state that is not on track — and, once V2.7 RECALL-04 let a
     * snapshot record an ABSENT reading, true of `null` as well. A Project the
     * last Review could not read was then reported as having been in the same
     * concerning position it is in now, which is the class of untruth this item
     * exists to remove. `projectHealthNeedsLook` is the same predicate the
     * `stuck` filter above uses, so the two halves of the sentence ask one
     * question.
     */
    const repeatedFromSnapshot = snapshot
      ? stuck.filter((project) =>
          snapshot.projects.some(
            (previous) =>
              previous.id === project.id &&
              projectHealthNeedsLook(previous.health),
          ),
        )
      : [];
    insights.push({
      id: "attention.projects",
      tone: "warning",
      label: `${plural(stuck.length, "Project needs", "Projects need")} a look`,
      reason:
        repeatedFromSnapshot.length > 0
          ? `${nameList(stuck.map((project) => project.title))} — open, with nothing completed this period. ${plural(repeatedFromSnapshot.length, "was", "were")} in the same position at your last Review.`
          : `${nameList(stuck.map((project) => project.title))} — open, with nothing completed this period.`,
      measure: { value: stuck.length, exactness: "exact" },
      links: [
        ...stuck
          .slice(0, MAX_PROJECT_CHANGES)
          .map((project) => projectLink(project.id, project.title)),
        // X-02: the same question, kept open. The Review states what was true at
        // this point; the saved view keeps answering it as the records move.
        crossViewLink(
          ATTENTION_VIEW_QUERY,
          "Open everything needing attention",
        ),
      ],
      entityIds: stuck.map((project) => project.id),
    });
  }

  return insights;
}

/* -- Where work contributed ------------------------------------------------ */

function buildDistribution(input: ResolvedInput): Insight[] {
  const { facts } = input;
  if (!facts.history.available || facts.state.areas.length === 0) return [];

  const attended = facts.state.areas
    .filter((area) => area.tasksCompletedInPeriod > 0)
    .sort((a, b) => {
      const value = b.tasksCompletedInPeriod - a.tasksCompletedInPeriod;
      if (value !== 0) return value;
      const title = a.title.localeCompare(b.title);
      return title !== 0 ? title : a.id.localeCompare(b.id);
    });
  const untouched = facts.state.areas
    .filter(
      (area) => area.tasksCompletedInPeriod === 0 && area.activeProjects > 0,
    )
    .sort((a, b) => {
      const title = a.title.localeCompare(b.title);
      return title !== 0 ? title : a.id.localeCompare(b.id);
    });

  const insights: Insight[] = [];
  if (attended.length > 0) {
    const named = attended.slice(0, MAX_DISTRIBUTION_AREAS);
    insights.push({
      id: "distribution.attended",
      tone: "neutral",
      label: `Completed work landed in ${plural(attended.length, "Area", "Areas")}`,
      reason: nameList(
        named.map((area) => `${area.title} (${area.tasksCompletedInPeriod})`),
      ),
      measure: { value: attended.length, exactness: "exact" },
      links: named.map((area) => areaLink(area.id, area.title)),
      entityIds: attended.map((area) => area.id),
    });
  }
  if (untouched.length > 0) {
    const named = untouched.slice(0, MAX_DISTRIBUTION_AREAS);
    insights.push({
      id: "distribution.untouched",
      tone: "info",
      label: `${plural(untouched.length, "Area has", "Areas have")} active work but no completions`,
      reason: `${nameList(named.map((area) => area.title))}. Completion is what counts here — an Area with work in progress and nothing finished still appears.`,
      measure: { value: untouched.length, exactness: "exact" },
      links: named.map((area) => areaLink(area.id, area.title)),
      entityIds: untouched.map((area) => area.id),
    });
  }
  return insights;
}

/* -- Trends ---------------------------------------------------------------- */

function buildTrends(input: ResolvedInput): InsightTrend[] {
  const points = input.series.map((point) => ({
    key: point.key,
    label: input.seriesLabels[point.key] ?? point.periodEnd,
    shortLabel:
      input.seriesShortLabels?.[point.key] ??
      input.seriesLabels[point.key] ??
      point.periodEnd,
    tasks: point.tasksCompleted,
    projects: point.projectsCompleted,
    current: point.key === input.currentSeriesKey,
  }));
  if (points.length < MIN_TREND_POINTS) return [];

  const trends: InsightTrend[] = [];

  const taskPoints: TrendPoint[] = points.map((point) => ({
    key: point.key,
    label: point.label,
    shortLabel: point.shortLabel,
    value: point.tasks,
    current: point.current,
  }));
  const taskDirection = trendDirection(taskPoints);
  trends.push({
    id: "trend.tasks_completed",
    label: "Tasks completed by Review period",
    direction: taskDirection,
    higherIsBetter: true,
    points: taskPoints,
    summary: seriesSummary(taskPoints, taskDirection, "Tasks completed"),
    // CONVERGE-01 §I — the visible caption. `summary` stays the accessible one.
    headline: seriesHeadline(taskPoints, taskDirection, "Tasks completed"),
  });

  if (points.some((point) => point.projects > 0)) {
    const projectPoints: TrendPoint[] = points.map((point) => ({
      key: point.key,
      label: point.label,
      shortLabel: point.shortLabel,
      value: point.projects,
      current: point.current,
    }));
    const direction = trendDirection(projectPoints);
    trends.push({
      id: "trend.projects_completed",
      label: "Projects completed by Review period",
      direction,
      higherIsBetter: true,
      points: projectPoints,
      summary: seriesSummary(projectPoints, direction, "Projects completed"),
      headline: seriesHeadline(projectPoints, direction, "Projects completed"),
    });
  }

  return trends;
}

/** The sentence a screen reader hears, and the one shown when a chart would add
 * nothing. It states every point, because five numbers read aloud are shorter
 * than a description of a shape. */
export function seriesSummary(
  points: readonly TrendPoint[],
  direction: TrendDirection,
  what: string,
): string {
  const listed = points
    .map((point) => `${point.label}: ${point.value}`)
    .join("; ");
  const headline = seriesHeadline(points, direction, what);
  return direction === "insufficient"
    ? `${what} — ${listed}. Not enough Reviews yet to show a direction.`
    : `${headline} ${listed}.`;
}

/**
 * CONVERGE-01 §I — the same series, as the ONE VISIBLE line.
 *
 * {@link seriesSummary} spells out every reading, which is right for the
 * chart's accessible description and wrong printed under the plot: on a twelve
 * period range it draws a paragraph enumerating twelve numbers the axis beneath
 * it is already showing. This is the sentence that enumeration opens with — the
 * shape of the trend, without the data table in prose.
 *
 * Derived from the same points and the same direction, so the visible line and
 * the announced one can never disagree about which way the series went.
 */
export function seriesHeadline(
  points: readonly TrendPoint[],
  direction: TrendDirection,
  what: string,
): string {
  if (direction === "insufficient") {
    return `${what} — not enough Reviews yet to show a direction.`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const movement =
    direction === "up"
      ? `up from ${first.value} to ${last.value}`
      : direction === "down"
        ? `down from ${first.value} to ${last.value}`
        : `unchanged at ${last.value}`;
  return `${what} over the last ${points.length} Review periods, ${movement}.`;
}

/* -- The period's plan account (FOLLOW-01) --------------------------------- */

/**
 * The account, assembled from the SHARED derivation's own words.
 *
 * Nothing is re-worded here and no rule is restated: `planAccountStatement` and
 * `entryReason` are the same functions `/plan` calls, so the two surfaces cannot
 * describe one week differently — which is the whole claim of "one derivation,
 * two consumers".
 */
function buildPlanAccount(input: ResolvedInput): PeriodPlanInsight | null {
  const account = input.facts.planAccount;
  const formatDay = input.formatDay ?? ((iso: string) => iso);

  if (!account.available) {
    return {
      headline:
        "The history behind this period's plan could not be read just now. Nothing in your Review has changed.",
      movement: null,
      facts: [],
      entries: [],
      note: null,
    };
  }

  const statement = planAccountStatement(account, { periodNoun: "period" });
  // A period that held no plan and finished nothing outside one has nothing to
  // account for. That is an absence of COMMITMENT, not an absence of data, and
  // a heading over an empty list would misreport it.
  if (statement.empty) return null;

  /*
   * Named Tasks, bounded PER LINE rather than overall, so a week with eleven
   * kept Tasks and one cleared one still names the cleared one. The counts above
   * remain the authoritative figures; these are the records behind them.
   */
  const named: PlanAccountInsightEntry[] = [];
  for (const fact of statement.facts) {
    const matching = account.entries.filter(
      (entry) =>
        fact.outcomes.includes(entry.outcome) &&
        // `carried` splits across two lines — the work whose day has passed and
        // the work whose day has not arrived — so the line's own `ahead` flag is
        // what decides which entries belong to it.
        entry.planStillAhead === fact.ahead,
    );
    for (const entry of matching.slice(0, MAX_NAMED_PER_PLAN_FACT)) {
      named.push({
        taskId: entry.taskId,
        title: entry.title,
        outcome: entry.outcome,
        reason: entryReason(entry, formatDay, "period"),
        link: { label: entry.title, to: `/tasks?task=${entry.taskId}` },
      });
    }
  }

  return {
    headline: statement.headline,
    movement: statement.movement,
    facts: statement.facts,
    entries: named,
    note: account.bounded
      ? "This period's plan is read under a limit, so a very busy week may not account for every Task."
      : null,
  };
}

/* -- Habit consistency (DEBT-156) ------------------------------------------ */

/**
 * The period's routine consistency, as ONE calm sentence.
 *
 * Two integers and the window they cover, which is exactly what
 * [ADR-104] admits and what DEBT-156 asked for. There is deliberately no
 * percentage here even though the figure would support one: `/habits` prints a
 * proportion beside both of its integers because that surface is about the
 * Habits themselves, and a Review is the one surface where a ratio is one
 * careless sentence away from becoming a grade.
 *
 * Absence renders LESS. A period no Habit was scheduled in returns null rather
 * than "0 of 0" — an unscheduled day is never a miss, and a period that asked
 * nothing has nothing to report.
 */
function buildHabitConsistency(input: ResolvedInput): Insight | null {
  const habits = input.facts.habits;
  if (!habits.available) {
    return {
      id: "habits.unavailable",
      tone: "neutral",
      label: "Routine consistency is not available",
      reason:
        "The read behind this could not complete. Nothing in your Review has changed.",
      measure: null,
      links: [{ label: "Open Habits", to: "/habits" }],
      entityIds: [],
    };
  }
  if (habits.expected === 0) return null;
  const missed = habits.expected - habits.completed;
  /*
   * The read is bounded when the workspace holds more active Habits than it
   * reads, or when the period is longer than one consistency reading walks.
   * Either way these two integers are a FLOOR, not the period's whole, and a
   * floor printed as a total is the quiet kind of wrong: nothing on the surface
   * would ever look off. So the sentence says it, and the measure stops
   * claiming to be exact.
   */
  const partial = habits.bounded
    ? ` Read under a limit and counted from ${habits.fromIso}, so this is at least that many, not necessarily all of them.`
    : "";
  return {
    id: "habits.consistency",
    tone: habits.completed >= habits.expected ? "success" : "info",
    label: `${habits.completed} of ${habits.expected} scheduled check-ins`,
    reason:
      (missed === 0
        ? `Every check-in ${plural(habits.habitsCounted, "routine", "routines")} asked for this period happened.`
        : `Across ${plural(habits.habitsCounted, "routine", "routines")}. ${plural(missed, "scheduled day", "scheduled days")} passed without one — days a routine did not ask for are not counted.`) +
      partial,
    measure: {
      value: habits.completed,
      exactness: habits.bounded ? "bounded" : "exact",
    },
    links: [{ label: "Open Habits", to: "/habits" }],
    entityIds: [],
  };
}

/* -- Across Reviews (V2.9 INS-02) ------------------------------------------ */

/**
 * What several Reviews say that one cannot.
 *
 * Every fact names its window in words — "over your last 4 Reviews, since 9
 * August" — with the N the series ACTUALLY holds, because a Review whose
 * snapshot was never captured is absent from it rather than counted as an
 * unknown (ADR-079 decision 5). Titles come from today's live facts through the
 * stored id, never from the snapshot (ADR-079 decision 3), so a renamed record
 * reads under its current name and a deleted one drops out silently.
 *
 * `alreadyReported` carries the Projects the one-step health section already
 * named, so a Project is described in ONE place — the rule `buildAttention`
 * follows for the same reason.
 *
 * The carry-over fact names its commitments in PROSE and offers one door that
 * works, rather than a link per Task: `/tasks?task=…` is a parameter nothing
 * reads (the Tasks drawer contract is `?drawer=task:<id>`), and this section
 * will not add a seventh caller of a dead link. That pre-existing defect spans
 * the AI, Plan and Reviews surfaces, so it is recorded rather than fixed here.
 */
function buildAcrossReviews(
  input: ResolvedInput,
  alreadyReported: ReadonlySet<string>,
): Insight[] {
  const series = input.snapshotSeries ?? [];
  if (series.length < MIN_ACROSS_REVIEWS) return [];

  const facts = readAcrossReviews({
    series,
    projects: input.facts.state.projects.map((project) => ({
      id: project.id,
      title: project.title,
    })),
    goals: input.facts.state.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
    })),
    tasks: input.facts.state.carryOver.map((task) => ({
      id: task.id,
      title: task.title,
    })),
  });

  const formatDay = (iso: string) => input.formatDay?.(iso) ?? iso;
  /**
   * The window, in words. "over your last 4 Reviews, since 9 August" when every
   * Review in the series recorded the subject; "over the 3 Reviews that
   * recorded it, since 16 August" when one did not. Found by review: the first
   * form was used for both, so "the last 3 Reviews" quietly included a Review
   * that had recorded nothing, and "since" named the start of a window of four.
   */
  const over = (of: number, reviews: number, sinceIso: string | null) => {
    const span =
      of === reviews
        ? `over your last ${plural(of, "Review", "Reviews")}`
        : `over the ${plural(of, "Review", "Reviews")} that recorded it`;
    return sinceIso === null ? span : `${span}, since ${formatDay(sinceIso)}`;
  };
  /** "3 of the last 4 Reviews" / "2 of the 3 Reviews that recorded it, of your last 4". */
  const ofReviews = (count: number, of: number, reviews: number) =>
    of === reviews
      ? `${count} of the last ${plural(of, "Review", "Reviews")}`
      : `${count} of the ${plural(of, "Review", "Reviews")} that recorded it, of your last ${reviews}`;
  const everyReview = (of: number, reviews: number) =>
    of === reviews
      ? `every one of your last ${plural(of, "Review", "Reviews")}`
      : `every one of the ${plural(of, "Review", "Reviews")} that recorded it, of your last ${reviews}`;
  const unrecorded = (of: number, reviews: number) =>
    of === reviews
      ? ""
      : ` ${plural(reviews - of, "Review", "Reviews")} in the series recorded no reading for it.`;

  const insights: Insight[] = [];

  for (const project of facts.projects) {
    if (alreadyReported.has(project.projectId)) continue;
    insights.push({
      id: `across.project.${project.projectId}`,
      tone: HEALTH_TONES[project.state],
      label: `${project.title}: ${HEALTH_LABELS[project.state]} at ${ofReviews(project.count, project.of, project.reviews)}`,
      reason: `Its health has not held one state ${over(project.of, project.reviews, project.sinceIso)} — ${project.states
        .map((state) => HEALTH_LABELS[state].toLocaleLowerCase())
        .join(", ")}.${unrecorded(project.of, project.reviews)}`,
      measure: exactMeasure(project.count),
      links: [projectLink(project.projectId, project.title)],
      entityIds: [project.projectId],
    });
  }

  for (const goal of facts.goals) {
    // Absence renders less (ADR-079 d8/d9): a Goal that work reached at EVERY
    // Review is the one-step section's own reading repeated N times, and a
    // finished Goal is movement, reported under what changed. Neither is a
    // finding here. The line still reaches the Goal story on the guided Goals
    // step, where it is the Goal's own history rather than a finding.
    if (
      goal.everyReview &&
      (goal.state === "moving" || goal.state === "completed")
    ) {
      continue;
    }
    const label = GOAL_CONTRIBUTION_LABELS[goal.state];
    insights.push({
      id: `across.goal.${goal.goalId}`,
      tone: GOAL_CONTRIBUTION_TONES[goal.state],
      label: goal.everyReview
        ? `${goal.title}: ${label} at ${everyReview(goal.of, goal.reviews)}`
        : `${goal.title}: ${label} at ${ofReviews(goal.count, goal.of, goal.reviews)}`,
      reason: `Read from the contribution recorded at each Review ${over(goal.of, goal.reviews, goal.sinceIso)}.${unrecorded(goal.of, goal.reviews)}`,
      measure: exactMeasure(goal.count),
      links: [goalLink(goal.goalId, goal.title)],
      entityIds: [goal.goalId],
    });
  }

  if (facts.repeatedCarryOver.length > 0) {
    const count = facts.repeatedCarryOver.length;
    // "N+" whenever the names shown are fewer than the ids that repeated —
    // the list was cut to its bound, or the bounded live carry-over page could
    // not name every one. Never an exact count the series does not support.
    const measure: InsightMeasure = facts.repeatedCarryOverBounded
      ? { value: count, exactness: "bounded" }
      : exactMeasure(count);
    // The door goes to the view that LISTS the named Tasks: a commitment that
    // has been waiting since before every Review in the series is a waiting
    // Task, and the overdue view does not hold it (found by review).
    const kinds = new Map(
      input.facts.state.carryOver.map((task) => [task.id, task.kind]),
    );
    const named = facts.repeatedCarryOver.map((task) => kinds.get(task.taskId));
    const links: InsightLink[] = [];
    if (named.some((kind) => kind !== "waiting")) {
      links.push(taskLink("overdue", "Open overdue Tasks"));
    }
    if (named.some((kind) => kind === "waiting")) {
      links.push(taskLink("waiting", "Open waiting Tasks"));
    }
    insights.push({
      id: "across.carry_over",
      tone: "warning",
      label: `${measureLabel(measure)} ${count === 1 && !facts.repeatedCarryOverBounded ? "commitment" : "commitments"} carried over at every one of your last ${plural(facts.reviews, "Review", "Reviews")}`,
      reason: `${nameList(facts.repeatedCarryOver.map((task) => task.title))} ${count === 1 ? "was" : "were"} already carrying over at each Review ${over(facts.reviews, facts.reviews, facts.sinceIso)}.${facts.repeatedCarryOverBounded ? " More repeated than are named here." : ""}`,
      measure,
      links,
      entityIds: facts.repeatedCarryOver.map((task) => task.taskId),
    });
  }

  return insights;
}

/* -- Notes ----------------------------------------------------------------- */

function buildNotes(input: ResolvedInput): string[] {
  const notes: string[] = [];
  const { facts } = input;

  switch (input.comparisonKindHint) {
    case "first_review":
      notes.push(
        "This is your first completed Review, so there is nothing to compare against yet. Trends and health changes appear from your next one.",
      );
      break;
    case "no_snapshot":
      notes.push(
        "Your previous Review was completed before DalyHub started recording Review evidence, so health changes and carry-over comparisons start from this Review.",
      );
      break;
    default:
      break;
  }

  if (facts.state.projectsBounded) {
    notes.push(
      "Project figures cover the Projects this Review reads, not every Project in the workspace.",
    );
  }
  if (facts.history.contributionsBounded) {
    notes.push(
      "Where completed work landed is read under a limit, so a very busy period may not attribute every Task.",
    );
  }
  notes.push(
    "Completed work is attributed to the Goal and Area its Project belongs to today. Moving a Project later moves its history with it.",
  );
  return notes;
}

/* -- The entry point ------------------------------------------------------- */

function resolveComparison(input: ReviewInsightsInput): InsightComparison {
  if (input.previous === null) return { kind: "first_review" };
  if (input.previous.snapshot === null) {
    return {
      kind: "no_snapshot",
      previousPeriodLabel: input.previous.periodLabel,
    };
  }
  return {
    kind: "snapshot",
    previousReviewId: input.previous.reviewId,
    previousPeriodLabel: input.previous.periodLabel,
  };
}

/**
 * Derive the whole Review evidence model. Pure: the same input always produces
 * the same output, which is what makes the rule matrix testable and the
 * surface trustworthy.
 */
export function evaluateReviewInsights(
  rawInput: ReviewInsightsInput,
): ReviewInsights {
  const comparison = resolveComparison(rawInput);
  const input: ResolvedInput = {
    ...rawInput,
    comparisonKindHint: comparison.kind,
  };

  const planAccount = buildPlanAccount(input);
  const habits = buildHabitConsistency(input);
  const movement = buildMovement(input);
  const goalContribution = buildGoalContribution(input);
  const projectChanges = buildProjectChanges(input);
  const attention = buildAttention(
    input,
    new Set(projectChanges.map((change) => change.projectId)),
  );
  const distribution = buildDistribution(input);
  const acrossReviews = buildAcrossReviews(
    input,
    new Set(projectChanges.map((change) => change.projectId)),
  );
  const trends = buildTrends(input);

  const isEmpty =
    planAccount === null &&
    habits === null &&
    movement.length === 0 &&
    goalContribution.length === 0 &&
    projectChanges.length === 0 &&
    attention.length === 0 &&
    distribution.length === 0 &&
    acrossReviews.length === 0 &&
    trends.length === 0;

  return {
    periodLabel: input.periodLabel,
    comparison,
    planAccount,
    habits,
    movement,
    goalContribution,
    projectChanges,
    attention,
    distribution,
    acrossReviews,
    trends,
    notes: isEmpty ? buildNotes(input).slice(0, 1) : buildNotes(input),
    isEmpty,
  };
}
