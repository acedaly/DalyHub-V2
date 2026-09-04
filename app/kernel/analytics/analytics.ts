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
 * substituted that pretends to be them: the surface shows the things this
 * product genuinely knows, and it says where each one comes from.
 *
 * Everything on it is therefore from an existing read, and exact except where it
 * says otherwise:
 *
 *   - completions come from the append-only Activity stream, counted distinct
 *     per record, so they are exact for any past range as well as the current
 *     one — the same guarantee `review-insights` documents, and it holds after
 *     a completed record is later deleted (HARDEN-06C, F-07): what happened
 *     during a week does not change because the owner tidied up afterwards;
 *   - the distribution resolves each completed Task's Area through the CURRENT
 *     spine links, which is a documented approximation the surface states out
 *     loud rather than hiding;
 *   - alignment is AREA-03's evaluator, unchanged and not re-derived here;
 *   - **overdue** (CONVERGE-01 §8) is the product's ONE overdue rule — a due
 *     date strictly past, still not complete — read at each bucket's close
 *     instead of at today, from the two stored columns a live overdue check
 *     already reads. It carries the same kind of approximation the distribution
 *     does, for the same reason (the schema keeps no history of a due date or of
 *     a deletion), and says so in the notes.
 *
 * ── Why the fifth metric is a LEVEL, and what that costs ────────────────────
 * The first four figures are FLOWS: things that happened inside the range. The
 * overdue figure is a LEVEL: how deep the backlog was at a moment. The two do
 * not mix — a level cannot be summed across buckets, and a flow cannot be read
 * "as at". Keeping them in separate shapes (`AnalyticsSeriesPoint` against
 * `AnalyticsOverduePoint`) is what stops the surface from ever adding six
 * readings of a backlog together and calling the result a total.
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

import { completedRangeTasksHref } from "~/kernel/task-views";

import type { Grain } from "~/kernel/history";

/*
 * The across-Reviews sentence comes from the Review-insight kernel rather than
 * being re-worded here: INS-02 built it, the Review panel and the Goal story
 * already say it, and a second phrasing of one classification is exactly the
 * duplicated fact ADR-079 d2 refuses.
 */
import {
  goalContributionAcrossReviewsLine,
  type GoalContributionAcrossReviews,
} from "~/kernel/review-insights";

import {
  GRAIN_NOUNS,
  type AnalyticsBucket,
  type AnalyticsSpan,
  type InsightWindowId,
} from "./insight-range";

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

/**
 * CONVERGE-01 §8 — how much was overdue at ONE bucket's close.
 *
 * Deliberately not a field on `AnalyticsSeriesPoint`. Every count there is
 * something that HAPPENED INSIDE the bucket; this is a level READ AT its close.
 * Merging them would put a stock and a flow in one record and invite the one
 * arithmetic this surface must never do — summing the buckets, which is
 * meaningless for a level and already forbidden for the flows.
 */
export interface AnalyticsOverduePoint {
  readonly key: string;
  readonly overdue: number;
}

/** Completed Tasks attributed to one Area, for the distribution. */
export interface AnalyticsAreaRow {
  readonly areaId: string;
  readonly title: string;
  readonly tasksCompleted: number;
  /** The Area's stable identity rank, so the bar takes the Area's own colour. */
  readonly colourRank: number | null;
}

/**
 * The current Goal ALIGNMENT tally — a state count, never a period figure, and
 * never a measurement-status figure.
 *
 * **V2.7 RECALL-04 renamed the field from `onTrack` (DEBT-234).** The number is
 * `evaluateGoalAlignment`'s `active` state — *"does this Goal have contributing
 * work recorded inside the recent window?"* — which is ADR-040's question, not
 * GOAL-02's *"is the measured outcome on track?"*. The two are different
 * predicates over different inputs, and a Goal can honestly be one and not the
 * other. Carrying the measurement word on the alignment value is how the label
 * above it came to say "Goals on track" for a set no measurement was consulted
 * about, and how `/views` came to draw the identical state as "Moving" while
 * Analytics called it "On track" (ADR-114 decision 6: no word may span two
 * predicates). The machine key now says which question it answers, so a future
 * surface cannot borrow the wrong word from the wrong field.
 */
export interface AnalyticsGoalTally {
  /** Goals whose alignment state is `active` — the moving ones. */
  readonly moving: number;
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
  /** V2.9 INS-03 — the named window the owner chose. */
  readonly window: InsightWindowId;
  /** The grain its series is cut at. */
  readonly grain: Grain;
  /**
   * V2.7 RECALL-02 — the range's own owner-calendar span.
   *
   * `current` is counted over exactly this window, so the "Tasks completed"
   * metric's LINK is built from it: the figure and the list it opens describe
   * the same days. Deriving the span from `buckets` instead would be a second
   * definition of the range, and the bucket layout is deliberately allowed to
   * differ from the total's window (see `~/kernel/history`'s bucket rule).
   */
  readonly span: AnalyticsSpan;
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
  /**
   * CONVERGE-01 §8 — overdue at each bucket's close, oldest first, in the same
   * order as `buckets`. Empty when the read failed.
   */
  readonly overdueSeries: readonly AnalyticsOverduePoint[];
  /**
   * Overdue at the close of the equally-long span BEFORE the range, or `null`.
   *
   * The comparison is level-to-level at two moments the same distance apart as
   * the completion metrics' two windows, so "4 fewer than the previous period"
   * means the same kind of thing on every card in the row.
   */
  readonly overduePrevious: number | null;
  /**
   * False when the overdue READ failed, as opposed to genuinely finding nothing
   * overdue — the same distinction `areasAvailable` exists for, and the same
   * reason: "nothing is overdue" is a claim about the workspace.
   */
  readonly overdueAvailable: boolean;
  /**
   * V2.9 INS-03 — one compact series per MEASURED Goal: the caller DEBT-212
   * asked for. Empty when no Goal has two readings in the window, which is an
   * ordinary absence rather than a failure.
   */
  readonly measuredGoals: readonly AnalyticsGoalSeries[];
  /** True when the Goal page was cut to its bound before the series were read. */
  readonly measuredGoalsBounded: boolean;
  readonly measuredGoalsAvailable: boolean;
  /**
   * V2.9 INS-03 — the across-Reviews contribution for a Goal with no
   * measurement, from INS-02's stored snapshots.
   *
   * A measured Goal has a shape to draw; an unmeasured one has none, and this
   * is what it has instead. The window is REVIEWS rather than the page's own
   * window, which is why the sentence says so — a Review period is not the span
   * the owner selected.
   */
  readonly goalContributions: readonly GoalContributionAcrossReviews[];
  /**
   * True when the grain's stated maximum shortened the window that was asked
   * for. The surface says so rather than presenting a shortened window as the
   * one it was given (ADR-079 d11).
   */
  readonly seriesBounded: boolean;
  readonly seriesBound: number | null;
  /**
   * How many moments the overdue LEVEL was read at, when that read's own bound
   * is below the number of buckets. Zero means every bucket carries a reading.
   */
  readonly overdueMoments: number;
}

/**
 * One measured Goal's readings over the window (V2.9 INS-03).
 *
 * The points are the Goal's OWN measurements rather than a bucketed count,
 * because a measurement is a level the owner recorded on a day: bucketing
 * levels would invent readings between them, and averaging them would be a
 * derived figure nobody asked for. Bounded per Goal, and the bound travels, so
 * a compact series can never be read as a whole history.
 */
export interface AnalyticsGoalContribution {
  readonly goalId: string;
  readonly title: string;
  /** The kernel's own sentence — the classification AND the Reviews it read. */
  readonly reading: string;
  readonly to: string;
}

export interface AnalyticsGoalSeries {
  readonly goalId: string;
  readonly title: string;
  /** Oldest first. `date` is the owner-calendar day the reading was taken. */
  readonly points: readonly {
    readonly key: string;
    readonly date: string;
    readonly value: number;
  }[];
  readonly bounded: boolean;
  readonly to: string;
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
  readonly window: InsightWindowId;
  readonly grain: Grain;
  readonly metrics: readonly AnalyticsMetric[];
  readonly series: readonly AnalyticsSeriesPoint[];
  /** Every bucket, with its span, so the surface labels the axis itself. */
  readonly buckets: readonly AnalyticsBucket[];
  /** Overdue at each bucket's close, aligned to `buckets`. Empty when unread. */
  readonly overdueSeries: readonly AnalyticsOverduePoint[];
  /** False when the overdue read failed — the panel then says so. */
  readonly overdueAvailable: boolean;
  readonly distribution: readonly AnalyticsDistributionRow[];
  /** Tasks attributed to an Area. Never the range's whole task total. */
  readonly distributionTotal: number;
  /** False when the distribution read failed — the panel then says so. */
  readonly distributionAvailable: boolean;
  /** V2.9 INS-03 — the measured Goals, ready to draw. */
  readonly measuredGoals: readonly AnalyticsGoalSeries[];
  readonly measuredGoalsAvailable: boolean;
  /**
   * V2.9 INS-03 — one row per unmeasured Goal that the Reviews have something
   * to say about, already worded by the kernel INS-02 built. Never a Goal that
   * also appears in `measuredGoals`: one Goal, one row.
   */
  readonly goalContributions: readonly AnalyticsGoalContribution[];
  /** True when the grain's maximum shortened the window that was asked for. */
  readonly seriesBounded: boolean;
  readonly seriesBound: number | null;
  /**
   * How many moments the overdue LEVEL was read at, when that read's own bound
   * is below the number of buckets. Zero means every bucket has a reading.
   */
  readonly overdueMoments: number;
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

/**
 * CONVERGE-01 §8 — the sentence under the overdue figure.
 *
 * `change` and `unavailable` are the row's shared wording, unchanged, so the
 * five cards read as one row: "4 fewer than the previous period (12)".
 *
 * Only `no_basis` is written here, because the shared phrasing is about a period
 * and this figure is about a MOMENT. "No overdue Tasks in the previous period"
 * would be a claim that nothing was overdue during it; what the reading actually
 * says is that nothing was overdue when it ended.
 */
export function overdueSentence(value: AnalyticsDelta): string {
  if (value.kind === "no_basis") {
    return "Nothing was overdue at the end of the previous period";
  }
  return deltaSentence(value, "overdue Tasks");
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

  /*
   * The headline overdue figure is the LAST bucket's reading, not a separate
   * read of "now".
   *
   * The newest bucket closes on the range's own last day (`rangeBuckets` lays
   * the buckets backward from the end of the span, so the most recent one is
   * always whole and always ends there), which means the figure on the card and
   * the right-hand end of the line beneath it are the same number by
   * construction. Reading "now" separately would let a page show a card and a
   * chart that disagree — the failure this surface refuses everywhere else.
   */
  const overdueNow = facts.overdueAvailable
    ? (facts.overdueSeries[facts.overdueSeries.length - 1]?.overdue ?? null)
    : null;
  const overdueDelta = delta(overdueNow, facts.overduePrevious);

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
      /*
       * V2.7 RECALL-02 — the link lands on the SAME days this figure counts.
       *
       * It used to be a bare `/tasks?system=completed`: the whole of the
       * workspace's finished work, ordered by EDIT time, under a figure that
       * described one period. Two different questions, one link. It now carries
       * the range's own span as the completion window and the completion sort,
       * built by the one kernel helper both surfaces share — so the count stated
       * here and the count the list returns are the same machine value over the
       * same window, which `test/kernel/recall-02-completed-time.test.ts`
       * asserts by comparing values rather than sentences.
       */
      to: completedRangeTasksHref({
        from: facts.span.startIso,
        to: facts.span.endIso,
      }),
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
       * "Goals moving" is true right now; it is not something that happened
       * during the range, so it carries no comparison and its supporting line
       * says what it is instead of pretending to a delta. Mixing a state into a
       * row of period figures is defensible only if the row says which is which,
       * so it does.
       *
       * ── V2.7 RECALL-04: the label names the question (DEBT-234) ──────────
       * It read "Goals on track" over a number that counts ALIGNMENT — Goals
       * with contributing work recorded inside the recent window (ADR-040) —
       * while Today and `/goals` used the same three words for GOAL-02's
       * measurement status. One label, two predicates, and a workspace where
       * they legitimately disagree; the owner had no way to tell which question
       * this tile answered. "Moving" is the product's existing word for exactly
       * this state (`/views` has always drawn it), so this tile adopts it rather
       * than inventing a third vocabulary.
       */
      id: "goals",
      label: "Goals moving",
      value: facts.goals?.moving ?? null,
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
      /*
       * CONVERGE-01 §8 — a LEVEL, and the only metric on the row that is one.
       *
       * "Goals on track" is a state with no comparable history, so it carries no
       * delta. This is a state WITH one: the same reading taken at two moments
       * the same distance apart as the completion metrics' two windows, which is
       * what makes "4 fewer than the previous period" mean the same kind of
       * thing here as it does two cards to the left.
       *
       * The word is the product's own (`/tasks` calls this view "Overdue — past
       * its date and still open"), the rule behind the number is that view's
       * rule, and the link goes to that view. There is one definition of overdue
       * in DalyHub and this is a reading of it, not a second one.
       */
      id: "overdue",
      label: "Overdue",
      value: overdueNow,
      supporting: overdueSentence(overdueDelta),
      delta: overdueDelta,
      to: "/tasks?system=overdue",
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
  /*
   * V2.7 RECALL-04 — the tile's question, named (DEBT-234).
   *
   * "Moving" is the product's word for the alignment state and `/views` has
   * always used it, but this is the surface that states every figure's
   * provenance, so it says out loud which of the two Goal questions it is
   * answering — and, by saying so, that it is NOT answering the other one.
   */
  if (facts.goals !== null && facts.goals.total > 0) {
    notes.push(
      "Goals moving counts Goals with contributing work recorded recently. It is not a measurement reading — whether a Goal's own target is on track is answered on Today and on Goals.",
    );
  }
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
  /*
   * The overdue history's own approximation, said out loud on the surface for
   * the same reason the distribution's is: the reader is entitled to know which
   * of these figures are exact and which are the best a schema without history
   * can give. Only stated when a past reading is actually drawn — on a range
   * with one bucket there is no history to qualify.
   */
  if (facts.overdueAvailable && facts.overdueSeries.length > 1) {
    notes.push(
      "Past overdue readings use each Task’s due date as it stands today, and count only Tasks that still exist. Changing a due date, or deleting a Task, changes its history here.",
    );
  }

  /*
   * V2.9 INS-03 — every bound this page applied, said out loud.
   *
   * The V2.9 acceptance rule: a figure about the owner's history names its
   * window AND its bound. A shortened series that did not say so would be a
   * capped population presented as a complete one (ADR-079 d11).
   */
  if (facts.seriesBounded && facts.seriesBound !== null) {
    notes.push(
      `This window is longer than a ${GRAIN_NOUNS[facts.grain]} series can hold, so the most recent ${facts.seriesBound} ${GRAIN_NOUNS[facts.grain]}s are shown. Choose a coarser grain to cover the whole window.`,
    );
  }
  if (facts.overdueMoments > 0) {
    notes.push(
      `Overdue is a level rather than a count, so it is read at a limited number of moments: the most recent ${facts.overdueMoments} of this window.`,
    );
  }
  if (facts.measuredGoalsBounded) {
    notes.push(
      "Goal series cover the Goals this page reads, ordered by alignment — not every measured Goal in the workspace.",
    );
  }
  if (facts.measuredGoals.some((goal) => goal.bounded)) {
    notes.push(
      "A Goal with many readings shows its most recent ones, so a compact series is a recent shape rather than the whole history.",
    );
  }

  const degraded =
    current === null ||
    facts.goals === null ||
    !facts.areasAvailable ||
    !facts.overdueAvailable;
  /*
   * "Nothing happened" requires every read to have SUCCEEDED and returned
   * nothing. A failed distribution read must not be able to produce the empty
   * state, because that state asserts a fact about the period.
   */
  /*
   * CONVERGE-01 §8 — a backlog is not nothing.
   *
   * The empty state replaces the WHOLE surface with "Nothing completed in this
   * period", which was true and complete while every figure on the page counted
   * completions. It is neither now: a period with no completions and forty-three
   * overdue Tasks is the single most important thing this screen can say, and
   * hiding it behind a calm empty state would be the surface reporting nought
   * for something it actually read.
   */
  /*
   * V2.9 INS-03 — the contribution rows, for the Goals with no series only.
   *
   * A Goal that already has a sparkline says more with it than a Review count
   * would add, and two rows for one Goal is the panel repeating itself. The
   * sentence is the kernel's, so the Insight page and the Review cannot word
   * the same classification differently.
   */
  const measuredIds = new Set(facts.measuredGoals.map((goal) => goal.goalId));
  const goalContributions: AnalyticsGoalContribution[] = facts.goalContributions
    .filter((contribution) => !measuredIds.has(contribution.goalId))
    .map((contribution) => ({
      goalId: contribution.goalId,
      title: contribution.title,
      reading: goalContributionAcrossReviewsLine(contribution),
      to: `/goals/${encodeURIComponent(contribution.goalId)}`,
    }));

  const isEmpty =
    !degraded &&
    (current?.tasksCompleted ?? 0) === 0 &&
    (current?.projectsCompleted ?? 0) === 0 &&
    (current?.goalsCompleted ?? 0) === 0 &&
    facts.areas.length === 0 &&
    (overdueNow ?? 0) === 0 &&
    // V2.9 INS-03 — a measured Goal with readings in this window is something
    // to show, for the same reason a backlog is: the empty state asserts a fact
    // about the period, and it would be false here.
    facts.measuredGoals.length === 0;

  return {
    window: facts.window,
    grain: facts.grain,
    metrics,
    series: facts.series,
    buckets: facts.buckets,
    overdueSeries: facts.overdueSeries,
    overdueAvailable: facts.overdueAvailable,
    distribution,
    distributionTotal: attributed,
    distributionAvailable: facts.areasAvailable,
    measuredGoals: facts.measuredGoals,
    measuredGoalsAvailable: facts.measuredGoalsAvailable,
    goalContributions,
    seriesBounded: facts.seriesBounded,
    seriesBound: facts.seriesBound,
    overdueMoments: facts.overdueMoments,
    notes,
    isEmpty,
    degraded,
  };
}
