/**
 * UIX-05 Analytics — the evaluator. Pure, storage-independent, React-free.
 *
 * Given one range's facts — completion counts for the range and the one before
 * it, a bucketed series, where the completed work landed, and the current Goal
 * alignment tally — it returns the presentation model the Analytics surface
 * renders. It reads no repository, imports no React and never touches the wall
 * clock, so the whole rule set is unit-testable directly.
 *
 * ── What this surface refuses to show ───────────────────────────────────────
 * The supplied reference design for this screen carries four figures: tasks
 * completed, FOCUS TIME ("12h 30m"), DAILY PROGRESS ("68%") and goals on track.
 * DalyHub records no time and computes no daily percentage of a life, so two of
 * those four would have to be invented. They are not here, and nothing has been
 * substituted that pretends to be them: the surface shows the four things this
 * product genuinely knows, and it says where each one comes from.
 *
 * Everything on it is therefore EXACT and from an existing read:
 *
 *   - completions come from the append-only Activity stream, counted distinct
 *     per record, so they are exact for any past range as well as the current
 *     one — the same guarantee `review-insights` documents;
 *   - the distribution resolves each completed Task's Area through the CURRENT
 *     spine links, which is a documented approximation the surface states out
 *     loud rather than hiding;
 *   - alignment is AREA-03's evaluator, unchanged and not re-derived here.
 *
 * There is no score, no index, no productivity grade and no weighted composite
 * of unlike things — the same refusal REVIEW-03 makes, for the same reason: a
 * single number mixing tasks, goals and areas would look precise and mean
 * nothing.
 *
 * ── And what it refuses to invent ───────────────────────────────────────────
 * A comparison against a previous period with NO activity is not "+100%", it is
 * "nothing to compare against". A range whose reads failed says so rather than
 * reporting nought. A workspace with no completed work in the range shows one
 * calm empty state, not five empty panels.
 */

import type { AnalyticsBucket, AnalyticsRangeId } from "./analytics-range";

/* -------------------------------------------------------------------------- */
/* Input facts                                                                 */
/* -------------------------------------------------------------------------- */

/** Distinct records completed inside one span. */
export interface AnalyticsCompletionCounts {
  readonly tasksCompleted: number;
  readonly projectsCompleted: number;
  readonly goalsCompleted: number;
}

/** One bucket's counts, against the bucket it was asked for. */
export interface AnalyticsSeriesPoint extends AnalyticsCompletionCounts {
  readonly key: string;
}

/** Completed Tasks attributed to one Area, for the distribution. */
export interface AnalyticsAreaRow {
  readonly areaId: string;
  readonly title: string;
  readonly tasksCompleted: number;
  /** The Area's stable identity rank, so the bar takes the Area's own colour. */
  readonly colourRank: number | null;
}

/** The current Goal alignment tally — a state count, never a period figure. */
export interface AnalyticsGoalTally {
  readonly onTrack: number;
  readonly total: number;
  /**
   * True when the Goal read hit its bound, so BOTH figures describe the Goals
   * examined rather than the workspace.
   *
   * It has to travel, because the alignment ordering decides which Goals enter a
   * bounded page: on a workspace with more Goals than the bound, the numerator
   * and the denominator can both differ from the workspace-wide tally, and
   * "5 of 9 Goals" would be a precise-looking claim about a set the reader
   * cannot see. REVIEW-03 reports its own bounds the same way.
   */
  readonly bounded: boolean;
}

export interface AnalyticsFacts {
  readonly range: AnalyticsRangeId;
  readonly buckets: readonly AnalyticsBucket[];
  /** Exact totals for the range, or `null` when the read failed. */
  readonly current: AnalyticsCompletionCounts | null;
  /** Exact totals for the equally-long span before it, or `null`. */
  readonly previous: AnalyticsCompletionCounts | null;
  /** One point per bucket, oldest first. Empty when the read failed. */
  readonly series: readonly AnalyticsSeriesPoint[];
  /** Where the range's completed Tasks landed. Empty when none did. */
  readonly areas: readonly AnalyticsAreaRow[];
  /** True when the distribution read hit its row bound. */
  readonly areasBounded: boolean;
  /**
   * False when the distribution READ failed, as opposed to genuinely finding
   * nothing.
   *
   * The two are the same empty array and must never be the same sentence: "none
   * of this period's completed work rolled up to an Area" is a claim about the
   * workspace, and saying it because a query fell over is the module's own
   * "failure is said, not zeroed" rule broken in the one place it is easiest to
   * break it.
   */
  readonly areasAvailable: boolean;
  /** The Goal tally, or `null` when the read failed. */
  readonly goals: AnalyticsGoalTally | null;
}

/* -------------------------------------------------------------------------- */
/* The presentation model                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How a figure moved against the previous, equally-long span.
 *
 * `no_basis` is a real answer and the reason this is a union rather than a
 * number: with nothing completed in the previous period there is no percentage
 * to state, and "+100%" from a base of zero is arithmetic pretending to be
 * information. `unavailable` is the failed-read case, kept separate from "no
 * change" for the same reason.
 */
export type AnalyticsDelta =
  | { readonly kind: "unavailable" }
  | { readonly kind: "no_basis"; readonly previous: number }
  | {
      readonly kind: "change";
      readonly previous: number;
      /** Signed absolute difference. The percentage is deliberately absent. */
      readonly difference: number;
    };

/** One figure on the metric row. */
export interface AnalyticsMetric {
  readonly id: string;
  readonly label: string;
  /** The figure itself, or `null` when its read failed. */
  readonly value: number | null;
  /** The sentence beneath it — the comparison, or what the figure counts. */
  readonly supporting: string;
  /** How it moved, for the metric that has a comparable previous period. */
  readonly delta: AnalyticsDelta | null;
  /** Where the figure comes from, so a doubted number can be checked. */
  readonly to: string | null;
}

/** One row of the distribution. */
export interface AnalyticsDistributionRow {
  readonly areaId: string;
  readonly title: string;
  readonly tasksCompleted: number;
  /** Share of the attributed total, 0–100, rounded for display only. */
  readonly percent: number;
  readonly colourRank: number | null;
  readonly to: string;
}

export interface AnalyticsModel {
  readonly range: AnalyticsRangeId;
  readonly metrics: readonly AnalyticsMetric[];
  readonly series: readonly AnalyticsSeriesPoint[];
  /** Every bucket, with its span, so the surface labels the axis itself. */
  readonly buckets: readonly AnalyticsBucket[];
  readonly distribution: readonly AnalyticsDistributionRow[];
  /** Tasks attributed to an Area. Never the range's whole task total. */
  readonly distributionTotal: number;
  /** False when the distribution read failed — the panel then says so. */
  readonly distributionAvailable: boolean;
  /** Calm sentences about the limits of what is shown. Never a disclaimer wall. */
  readonly notes: readonly string[];
  /** True when there is genuinely nothing to show — ONE empty state, not five. */
  readonly isEmpty: boolean;
  /** True when a read failed, so the surface says so rather than reporting nought. */
  readonly degraded: boolean;
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

/** How many Areas the distribution names before it stops listing. */
export const MAX_DISTRIBUTION_ROWS = 8;

function delta(
  current: number | null,
  previous: number | null,
): AnalyticsDelta {
  if (current === null || previous === null) return { kind: "unavailable" };
  if (previous === 0) return { kind: "no_basis", previous };
  return { kind: "change", previous, difference: current - previous };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/**
 * The sentence under a figure.
 *
 * It states the COMPARISON where one can honestly be made, and what the figure
 * counts where one cannot — never a blank, and never a zero dressed as a change.
 */
export function deltaSentence(value: AnalyticsDelta, noun: string): string {
  switch (value.kind) {
    case "unavailable":
      return "Comparison not available";
    case "no_basis":
      return `No ${noun} in the previous period`;
    case "change": {
      if (value.difference === 0) {
        return `Same as the previous period (${value.previous})`;
      }
      const direction = value.difference > 0 ? "more" : "fewer";
      return `${Math.abs(value.difference)} ${direction} than the previous period (${value.previous})`;
    }
  }
}

export function evaluateAnalytics(facts: AnalyticsFacts): AnalyticsModel {
  const current = facts.current;
  const tasksDelta = delta(
    current?.tasksCompleted ?? null,
    facts.previous?.tasksCompleted ?? null,
  );
  const projectsDelta = delta(
    current?.projectsCompleted ?? null,
    facts.previous?.projectsCompleted ?? null,
  );

  const attributed = facts.areas.reduce(
    (total, area) => total + area.tasksCompleted,
    0,
  );

  const metrics: AnalyticsMetric[] = [
    {
      id: "tasks",
      label: "Tasks completed",
      value: current?.tasksCompleted ?? null,
      supporting: deltaSentence(tasksDelta, "Tasks"),
      delta: tasksDelta,
      to: "/tasks?system=completed",
    },
    {
      id: "projects",
      label: "Projects finished",
      value: current?.projectsCompleted ?? null,
      supporting: deltaSentence(projectsDelta, "Projects"),
      delta: projectsDelta,
      to: "/projects",
    },
    {
      /*
       * A STATE, not a period figure — and the only metric on the row that is.
       *
       * "Goals on track" is true right now; it is not something that happened
       * during the range, so it carries no comparison and its supporting line
       * says what it is instead of pretending to a delta. Mixing a state into a
       * row of period figures is defensible only if the row says which is which,
       * so it does.
       */
      id: "goals",
      label: "Goals on track",
      value: facts.goals?.onTrack ?? null,
      supporting:
        facts.goals === null
          ? "Not available"
          : facts.goals.total === 0
            ? "No Goals yet"
            : facts.goals.bounded
              ? // The bound is in the sentence, not only in a note: a reader who
                // never reaches the notes must not take this for a workspace
                // total.
                `of the ${plural(facts.goals.total, "Goal", "Goals")} read, right now`
              : `of ${plural(facts.goals.total, "Goal", "Goals")}, right now`,
      delta: null,
      to: "/goals",
    },
    {
      id: "areas",
      label: "Areas worked in",
      value:
        facts.areas.length === 0 && current === null
          ? null
          : facts.areas.length,
      supporting:
        facts.areas.length === 0
          ? "No completed work landed in an Area"
          : `${plural(attributed, "Task", "Tasks")} attributed`,
      delta: null,
      to: "/areas",
    },
  ];

  const distribution = [...facts.areas]
    .sort((a, b) => {
      const value = b.tasksCompleted - a.tasksCompleted;
      if (value !== 0) return value;
      const title = a.title.localeCompare(b.title);
      return title !== 0 ? title : a.areaId.localeCompare(b.areaId);
    })
    .slice(0, MAX_DISTRIBUTION_ROWS)
    .map<AnalyticsDistributionRow>((area) => ({
      areaId: area.areaId,
      title: area.title,
      tasksCompleted: area.tasksCompleted,
      percent:
        attributed === 0
          ? 0
          : Math.round((area.tasksCompleted / attributed) * 100),
      colourRank: area.colourRank,
      to: `/areas/${area.areaId}`,
    }));

  const notes: string[] = [];
  if (facts.goals?.bounded) {
    notes.push(
      "Goal figures cover the Goals this reads, ordered by alignment — not every Goal in the workspace.",
    );
  }
  if (facts.areas.length > 0) {
    notes.push(
      "Completed work is attributed to the Area its Project belongs to today. Moving a Project later moves its history with it.",
    );
  }
  if (facts.areasBounded) {
    notes.push(
      "Where completed work landed is read under a limit, so a very busy period may not attribute every Task.",
    );
  }
  if (facts.areas.length > MAX_DISTRIBUTION_ROWS) {
    notes.push(
      `The ${MAX_DISTRIBUTION_ROWS} Areas with the most completed work are shown; ${facts.areas.length - MAX_DISTRIBUTION_ROWS} more received some.`,
    );
  }

  const degraded =
    current === null || facts.goals === null || !facts.areasAvailable;
  /*
   * "Nothing happened" requires every read to have SUCCEEDED and returned
   * nothing. A failed distribution read must not be able to produce the empty
   * state, because that state asserts a fact about the period.
   */
  const isEmpty =
    !degraded &&
    (current?.tasksCompleted ?? 0) === 0 &&
    (current?.projectsCompleted ?? 0) === 0 &&
    (current?.goalsCompleted ?? 0) === 0 &&
    facts.areas.length === 0;

  return {
    range: facts.range,
    metrics,
    series: facts.series,
    buckets: facts.buckets,
    distribution,
    distributionTotal: attributed,
    distributionAvailable: facts.areasAvailable,
    notes,
    isEmpty,
    degraded,
  };
}
