/**
 * V2.9 INS-02 — what the snapshots say ACROSS several Reviews.
 *
 * The product has written one snapshot per completed Review since REVIEW-03 —
 * Project states, Goal contribution classifications and carry-over ids — and
 * until V2.9 read exactly one of them back. Every fact below was already
 * stored and unreadable. Nothing new is captured to produce them.
 *
 * ── Pure, and deliberately dependent on nothing ─────────────────────────────
 * This module takes a series of snapshots and the LIVE titles, and returns
 * classifications. It reads no repository, formats no date and knows no
 * component. Its caller supplies the window's words, exactly as
 * `evaluateReviewInsights` takes `seriesLabels` rather than formatting them.
 *
 * ── The rules these facts inherit ───────────────────────────────────────────
 *   - **A claim, a reason, and a way to check it.** A classification is never
 *     emitted without the counts that produced it (ADR-079 decision 6).
 *   - **Absence renders less.** A Project whose state never changed across the
 *     series is not a finding, and is not emitted (ADR-079 d8/d9). A series
 *     shorter than two Reviews produces nothing at all.
 *   - **Never invent a state.** A Review with no snapshot simply is not in the
 *     series, so the window SHRINKS rather than acquiring a hole, and the
 *     sentence says the N it actually has (ADR-079 d5).
 *   - **Live titles through the id.** A snapshot stores ids, states and counts
 *     — never a title (ADR-079 d3). Every name below comes from the caller's
 *     live facts, so a renamed Project reads under its current name and a
 *     deleted one drops out.
 *   - **No score.** No percentage, index, grade or streak: "3 of the last 4" is
 *     a count of Reviews, stated as one.
 */

import type { ProjectHealthState } from "~/kernel/project-health";

import type {
  SnapshotGoalContribution,
  StoredReviewInsightSnapshot,
} from "./review-insight-snapshot";

/** How many across-Reviews findings of one kind are emitted. */
export const MAX_ACROSS_REVIEWS_PROJECTS = 5;
export const MAX_ACROSS_REVIEWS_GOALS = 5;
export const MAX_REPEATED_CARRY_OVER = 5;

/**
 * The fewest Reviews that can carry an across-Reviews claim.
 *
 * Two: "at risk at both of your last two Reviews" is a real observation, and
 * one Review is not a series at all — it is the period the panel is already
 * about.
 */
export const MIN_ACROSS_REVIEWS = 2;

/**
 * How many Reviews one across-Reviews series holds: the panel's five trend
 * periods plus the anchor. ONE number, consumed by the Review's evidence step,
 * the guided Goals step and Analytics alike. Found by review reading three
 * different lengths — six here, a Goal PAGE size (twelve, clamped to eight)
 * there, eight on a different anchor on Analytics — so one guided Review could
 * say "4 of the last 6" on one step and "5 of your last 8" two clicks later
 * for the same Goal. The same question must return the same machine value.
 */
export const ACROSS_REVIEWS_SERIES_LENGTH = 6;

/** One record's live identity, supplied by the caller from today's facts. */
export interface AcrossReviewsSubject {
  readonly id: string;
  readonly title: string;
}

/** A Project that did not hold one state across the series. */
export interface ProjectHealthAcrossReviews {
  readonly projectId: string;
  readonly title: string;
  /** The state it held most often, ties broken toward the more concerning one. */
  readonly state: ProjectHealthState;
  /** How many Reviews in the series recorded that state. */
  readonly count: number;
  /** How many Reviews in the series recorded ANY state for this Project. */
  readonly of: number;
  /**
   * How many Reviews the series held in all. When `of` is smaller, some
   * Reviews recorded no reading for this Project, and the sentence says so
   * rather than calling `of` "the last N Reviews".
   */
  readonly reviews: number;
  /** The first day of the OLDEST Review that recorded a state for it. */
  readonly sinceIso: string;
  /** Oldest first, one per Review that recorded a state. */
  readonly states: readonly ProjectHealthState[];
}

/** A Goal's contribution classification across the series. */
export interface GoalContributionAcrossReviews {
  readonly goalId: string;
  readonly title: string;
  readonly state: SnapshotGoalContribution;
  readonly count: number;
  readonly of: number;
  /** How many Reviews the series held in all — see `ProjectHealthAcrossReviews`. */
  readonly reviews: number;
  /** The first day of the OLDEST Review that recorded this Goal. */
  readonly sinceIso: string;
  /** True when every Review that recorded this Goal recorded the same state. */
  readonly everyReview: boolean;
  readonly states: readonly SnapshotGoalContribution[];
}

/** A commitment that was carrying over at every Review in the series. */
export interface RepeatedCarryOver {
  readonly taskId: string;
  readonly title: string;
  /** How many Reviews it carried over at — always the whole series. */
  readonly reviews: number;
}

/** Everything the series says, with the window it says it over. */
export interface AcrossReviewsFacts {
  /** How many snapshots the series actually held. */
  readonly reviews: number;
  /** The first day of the OLDEST Review in the series, `YYYY-MM-DD`. */
  readonly sinceIso: string | null;
  readonly projects: readonly ProjectHealthAcrossReviews[];
  readonly goals: readonly GoalContributionAcrossReviews[];
  readonly repeatedCarryOver: readonly RepeatedCarryOver[];
  /**
   * True when the named commitments are fewer than the ids that repeated:
   * the list was cut to its bound, OR ids repeated that the caller's bounded
   * live Task set could not name. Either way "N" would understate, and the
   * surface says "N+" (found by review: the second case was reported exact).
   */
  readonly repeatedCarryOverBounded: boolean;
}

/**
 * Which health state is the more concerning of two.
 *
 * The same ranking `classifyProjectHealthChange` uses, so "the state it held
 * most often" breaks a tie toward the state worth looking at rather than
 * toward whichever the array happened to hold first.
 */
export const HEALTH_CONCERN_RANK: Readonly<Record<ProjectHealthState, number>> =
  {
    on_track: 0,
    completed: 0,
    stale: 1,
    blocked: 2,
    at_risk: 3,
  };

/** Contribution states ordered by how much they warrant a look. */
const CONTRIBUTION_CONCERN_RANK: Readonly<
  Record<SnapshotGoalContribution, number>
> = {
  completed: 0,
  moving: 0,
  limited: 1,
  none: 2,
  no_structure: 3,
};

/**
 * The value that occurs most often, ties broken by `rank` (higher wins).
 *
 * Returns null for an empty list rather than a default, because "no readings"
 * and "a reading" are different answers and only one of them is a finding.
 */
function dominant<Value extends string>(
  values: readonly Value[],
  rank: Readonly<Record<Value, number>>,
): { readonly value: Value; readonly count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<Value, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: Value | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (
      best === null ||
      count > bestCount ||
      (count === bestCount && rank[value] > rank[best])
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best === null ? null : { value: best, count: bestCount };
}

/**
 * Read a series of snapshots into across-Reviews facts.
 *
 * `series` is oldest first, as `listSnapshotSeries` returns it. `projects`,
 * `goals` and `tasks` are the LIVE subjects — a record absent from them is
 * absent from the result, which is how a deleted record leaves quietly rather
 * than being named from a stored title it never had.
 */
export function readAcrossReviews(input: {
  readonly series: readonly StoredReviewInsightSnapshot[];
  readonly projects: readonly AcrossReviewsSubject[];
  readonly goals: readonly AcrossReviewsSubject[];
  readonly tasks: readonly AcrossReviewsSubject[];
}): AcrossReviewsFacts {
  const { series } = input;
  const empty: AcrossReviewsFacts = {
    reviews: series.length,
    sinceIso: series[0]?.snapshot.periodStart ?? null,
    projects: [],
    goals: [],
    repeatedCarryOver: [],
    repeatedCarryOverBounded: false,
  };
  if (series.length < MIN_ACROSS_REVIEWS) return empty;

  const projectTitles = new Map(
    input.projects.map((subject) => [subject.id, subject.title]),
  );
  const goalTitles = new Map(
    input.goals.map((subject) => [subject.id, subject.title]),
  );
  const taskTitles = new Map(
    input.tasks.map((subject) => [subject.id, subject.title]),
  );

  /* -- Project health ------------------------------------------------------ */
  const healthById = new Map<string, ProjectHealthState[]>();
  const projectSince = new Map<string, string>();
  for (const stored of series) {
    for (const project of stored.snapshot.projects) {
      // `health: null` means there was NO reading at that Review (RECALL-04 /
      // DEBT-234). It is skipped rather than counted as anything, so a Project
      // with two readings across four Reviews says "2 of the 2 that recorded
      // one" instead of inventing two more.
      if (project.health === null) continue;
      const states = healthById.get(project.id) ?? [];
      states.push(project.health);
      healthById.set(project.id, states);
      if (!projectSince.has(project.id)) {
        projectSince.set(project.id, stored.snapshot.periodStart);
      }
    }
  }
  const projects: ProjectHealthAcrossReviews[] = [];
  for (const [projectId, states] of healthById) {
    const title = projectTitles.get(projectId);
    if (title === undefined) continue;
    if (states.length < MIN_ACROSS_REVIEWS) continue;
    // Absence renders less: a Project that held ONE state throughout has not
    // moved, and a list of unchanged Projects is a list nobody reads.
    if (new Set(states).size === 1) continue;
    const top = dominant(states, HEALTH_CONCERN_RANK);
    if (top === null) continue;
    projects.push({
      projectId,
      title,
      state: top.value,
      count: top.count,
      of: states.length,
      reviews: series.length,
      sinceIso: projectSince.get(projectId) ?? series[0].snapshot.periodStart,
      states,
    });
  }
  projects.sort(
    (left, right) =>
      HEALTH_CONCERN_RANK[right.state] - HEALTH_CONCERN_RANK[left.state] ||
      right.count - left.count ||
      left.title.localeCompare(right.title),
  );

  /* -- Goal contribution --------------------------------------------------- */
  const contributionById = new Map<string, SnapshotGoalContribution[]>();
  const goalSince = new Map<string, string>();
  for (const stored of series) {
    for (const goal of stored.snapshot.goals) {
      const states = contributionById.get(goal.id) ?? [];
      states.push(goal.contribution);
      contributionById.set(goal.id, states);
      if (!goalSince.has(goal.id)) {
        goalSince.set(goal.id, stored.snapshot.periodStart);
      }
    }
  }
  const goals: GoalContributionAcrossReviews[] = [];
  for (const [goalId, states] of contributionById) {
    const title = goalTitles.get(goalId);
    if (title === undefined) continue;
    if (states.length < MIN_ACROSS_REVIEWS) continue;
    const top = dominant(states, CONTRIBUTION_CONCERN_RANK);
    if (top === null) continue;
    goals.push({
      goalId,
      title,
      state: top.value,
      count: top.count,
      of: states.length,
      reviews: series.length,
      sinceIso: goalSince.get(goalId) ?? series[0].snapshot.periodStart,
      everyReview: top.count === states.length,
      states,
    });
  }
  // Most concerning first, then the most consistent — a Goal with no
  // contribution path at every Review is the one worth reading first.
  goals.sort(
    (left, right) =>
      CONTRIBUTION_CONCERN_RANK[right.state] -
        CONTRIBUTION_CONCERN_RANK[left.state] ||
      right.count - left.count ||
      left.title.localeCompare(right.title),
  );

  /* -- Repeated carry-over ------------------------------------------------- */
  // The intersection across EVERY Review in the series: a commitment that was
  // already carrying over at each one. Anything less is not "repeated".
  // Seeded from the OLDEST Review, then narrowed by each later one, so the
  // result is exactly "carrying over at every Review in the series".
  let repeated = new Set<string>(series[0].snapshot.carryOverTaskIds);
  for (const stored of series.slice(1)) {
    const ids = new Set<string>(stored.snapshot.carryOverTaskIds);
    repeated = new Set<string>([...repeated].filter((id) => ids.has(id)));
  }
  const repeatedLive = [...repeated]
    .flatMap((taskId) => {
      const title = taskTitles.get(taskId);
      return title === undefined
        ? []
        : [{ taskId, title, reviews: series.length }];
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  return {
    reviews: series.length,
    sinceIso: series[0]?.snapshot.periodStart ?? null,
    projects: projects.slice(0, MAX_ACROSS_REVIEWS_PROJECTS),
    goals: goals.slice(0, MAX_ACROSS_REVIEWS_GOALS),
    repeatedCarryOver: repeatedLive.slice(0, MAX_REPEATED_CARRY_OVER),
    // Cut to the bound, or more ids repeated than the live set could name
    // (the caller's carry-over page is itself bounded; a Task past it, or one
    // since deleted, still carried over at every Review). "N+" either way.
    repeatedCarryOverBounded:
      repeatedLive.length > MAX_REPEATED_CARRY_OVER ||
      repeated.size > repeatedLive.length,
  };
}

/** The words each contribution state carries in a Goal-story line. */
const CONTRIBUTION_LINE_LABELS: Readonly<
  Record<SnapshotGoalContribution, string>
> = {
  moving: "Moving",
  limited: "Limited movement",
  none: "No recent movement",
  no_structure: "No contribution path",
  completed: "Completed",
};

/**
 * One Goal's contribution across Reviews, as a sentence (V2.9 INS-02).
 *
 * Stated here rather than in the component so that every surface which
 * composes the Goal story prints the SAME words for the same machine value —
 * the point of ADR-111 decision 6. The count and the window travel together:
 * a classification is never shown without the reason that produced it.
 */
export function goalContributionAcrossReviewsLine(
  contribution: GoalContributionAcrossReviews,
): string {
  const label = CONTRIBUTION_LINE_LABELS[contribution.state];
  const reviews = contribution.of === 1 ? "Review" : "Reviews";
  // When a Review in the series recorded nothing for this Goal (it was created
  // mid-series, or fell past the snapshot's Goal bound), "your last N" would
  // quietly include it. The sentence names the Reviews that recorded it AND
  // the series they sit in, so the window is never misstated.
  if (contribution.of < contribution.reviews) {
    const recorded = `of the ${contribution.of} ${reviews} that recorded it, of your last ${contribution.reviews}`;
    return contribution.everyReview
      ? `${label} at every one ${recorded}`
      : `${label} at ${contribution.count} ${recorded}`;
  }
  return contribution.everyReview
    ? `${label} at every one of your last ${contribution.of} ${reviews}`
    : `${label} at ${contribution.count} of your last ${contribution.of} ${reviews}`;
}
