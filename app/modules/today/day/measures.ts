/**
 * TODAY-11 — the stat rank and the Insights ring (pure, React-free, clock-free).
 *
 * `MOCKUP 5.png` opens Today with four figures and closes it with an Insights
 * panel carrying a completion ring. Two of the four figures — **Focus time** and
 * **Productivity score** — do not exist in DalyHub and are not invented here;
 * `TODAY_11_COMMAND_CENTRE_2026_08.md` records both omissions and why. What is
 * left is three real readings and one real ratio, and this module derives every
 * one of them from data the page has ALREADY loaded.
 *
 * ── One derivation, several places ──────────────────────────────────────────
 * The week's completed and captured counts come from ONE read
 * (`loadActivityTrend`, a single bounded grouped query over fourteen days). The
 * "Tasks completed" card, the "Tasks captured" card and the Insights ring are
 * three PRESENTATIONS of that one derivation, not three computations of the same
 * facts — which is the rule that stops two figures on one screen disagreeing.
 *
 * ── The window is named, every time ─────────────────────────────────────────
 * Both spans are ROLLING seven days ending today, not calendar weeks, so every
 * label says "Last 7 days". The mockup says "This week"; copying that would be a
 * small lie with a real cost, because read on a Wednesday it means three days to
 * the owner and seven to the query — and the comparison underneath would be
 * measuring a full week against a partial one. `goal-progress.ts` has held that
 * line since GOAL-02; this module holds it too.
 */

import type { TodayActivityTrend } from "./goal-progress";
import type { TodayGoal } from "./goal-progress";
import { goalIsOnTrack } from "~/shared/goal-progress";

/** How the window is named wherever one of these figures is printed. */
export const MEASURE_WINDOW_LABEL = "Last 7 days";

/**
 * Which visualisation a card carries. Each is a shared chart primitive.
 *
 * ── Why there are no BARS here ──────────────────────────────────────────────
 * MOCKUP 5 draws a bar series on two of its four cards, and `TrendBars` exists.
 * It is not used, for the reason REDESIGN-03 recorded when it deleted this
 * screen's workload chart: the bars share one linear scale, so a single day of
 * bulk capture flattens the other six to hairlines. Measured again on the seeded
 * fixture at 1440 — sixteen captures, most of them on one day — the "Tasks
 * captured" card drew one solid block and six invisible lines. "A chart that is
 * only legible on unremarkable weeks is not a chart."
 *
 * A sparkline auto-scales to the series' own min and max with head-room, so it
 * shows the SHAPE of the same week rather than one spike and a flat floor. Both
 * daily series therefore take the same primitive, which also gives the rank one
 * chart language instead of two.
 */
export type MeasureChart =
  | { readonly kind: "spark"; readonly points: readonly DayPoint[] }
  | {
      readonly kind: "meter";
      readonly percent: number;
      readonly valueText: string;
    };

/** One day of a card's series. */
export interface DayPoint {
  readonly dateIso: string;
  /** The day, as the bar axis prints it: "Mon". */
  readonly label: string;
  readonly value: number;
}

/** One card of the stat rank. */
export interface TodayMeasure {
  readonly id: string;
  readonly label: string;
  /** The figure, already formatted. */
  readonly value: string;
  /** The one supporting line under the figure. */
  readonly note: string;
  /** Where the figure can be CHECKED, when a canonical view of it exists. */
  readonly href: string | null;
  readonly chart: MeasureChart | null;
}

/** A weekday label from a DATE at noon UTC — never from an instant. */
function weekdayLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

/**
 * The delta sentence, stated against the window it compares.
 *
 * `null` previous is a real state and reads as an absence rather than as zero
 * change: "no data for the previous 7 days" and "exactly the same as the
 * previous 7 days" are different facts, and only one of them is a comparison.
 */
export function completedNote(trend: TodayActivityTrend): string {
  if (trend.previousCompleted === null) return MEASURE_WINDOW_LABEL;
  const delta = trend.totalCompleted - trend.previousCompleted;
  if (delta === 0) {
    return `${MEASURE_WINDOW_LABEL} · level with the previous 7`;
  }
  const sign = delta > 0 ? "+" : "−";
  return `${MEASURE_WINDOW_LABEL} · ${sign}${Math.abs(delta)} on the previous 7`;
}

/**
 * The three cards, in the mockup's order, each omitted when its source is silent.
 *
 * A card whose data is missing renders no card — so the rank can be three, two,
 * one or none, and a workspace with no measurable Goals shows no "0 of 0".
 */
export function todayMeasures(input: {
  readonly trend: TodayActivityTrend | null;
  readonly goals: readonly TodayGoal[];
}): readonly TodayMeasure[] {
  const measures: TodayMeasure[] = [];
  const { trend, goals } = input;

  if (trend !== null) {
    const points: DayPoint[] = trend.days.map((day) => ({
      dateIso: day.dateIso,
      label: weekdayLabel(day.dateIso),
      value: day.completed,
    }));
    measures.push({
      id: "completed",
      label: "Tasks completed",
      value: String(trend.totalCompleted),
      note: completedNote(trend),
      // Analytics owns a real range picker and states each figure's provenance,
      // so the one figure the owner may want to check links straight there.
      href: "/analytics",
      chart: points.length >= 2 ? { kind: "spark", points } : null,
    });

    const captured: DayPoint[] = trend.days.map((day) => ({
      dateIso: day.dateIso,
      label: weekdayLabel(day.dateIso),
      value: day.created,
    }));
    measures.push({
      id: "captured",
      label: "Tasks captured",
      value: String(trend.totalCreated),
      note: MEASURE_WINDOW_LABEL,
      /*
       * Deliberately does NOT link. There is no canonical view of "created in
       * the last seven days", and a link to an approximation of itself is worse
       * than no link at all.
       */
      href: null,
      chart: captured.length >= 2 ? { kind: "spark", points: captured } : null,
    });
  }

  /*
   * FOLLOW-02 — the DENOMINATOR is the MEASURED Goals, and it is now filtered
   * here rather than assumed.
   *
   * `loadGoalSummaries` used to exclude unmeasured Goals entirely, so "the
   * Goals this read returned" and "the Goals with a measurable schedule" were
   * the same set and the note below could say "of N measurable goals" without
   * checking. Today's Goal panel now carries unmeasured Goals as well, so this
   * card filters for the set it actually describes — otherwise a workspace with
   * four Goals and one target would read "1 of 4 measurable goals on track",
   * which names four measurable Goals that do not exist.
   */
  const measured = goals.filter((goal) => goal.progress.measured);
  if (measured.length > 0) {
    /*
     * `goalIsOnTrack`, NOT `!goalNeedsAttention`. The evaluator has nine
     * statuses and only two of them need attention, so the negation would count
     * "no measurement configured", "nothing recorded yet" and "stale" as on
     * track — which is how a card comes to read "4 of 4" for a set of Goals that
     * are mostly not being measured. The predicate lives beside its sibling in
     * `~/shared/goal-progress`, so "on track" has one definition.
     *
     * The DENOMINATOR is `measured` above — the Goals on this surface that
     * actually carry a measurable schedule. A workspace with none produces no
     * card rather than "0 of 0".
     */
    const onTrack = measured.filter((goal) =>
      goalIsOnTrack(goal.progress.status),
    ).length;
    const valueText = `${onTrack} of ${measured.length} measurable ${
      measured.length === 1 ? "goal" : "goals"
    } on track`;
    measures.push({
      id: "goals",
      label: "Goals on track",
      value: String(onTrack),
      note: `of ${measured.length} measurable ${measured.length === 1 ? "goal" : "goals"}`,
      href: "/goals",
      chart: {
        kind: "meter",
        percent: (onTrack / measured.length) * 100,
        valueText,
      },
    });
  }

  return measures;
}

/**
 * A daily series stated in words.
 *
 * A sparkline is `aria-hidden` by design — it sits beside a figure and a note
 * that already say what it shows, and a fourth reading of the same facts is
 * noise, not access (see `Sparkline`'s own module comment). This sentence is not
 * the chart's label, then; it is the series' text form for anything that wants
 * one, and it is what a `title` or a future tooltip would say.
 */
export function daySeriesSummary(
  label: string,
  points: readonly DayPoint[],
): string {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const detail = points
    .map((point) => `${point.label} ${point.value}`)
    .join(", ");
  return `${label} over the last ${points.length} days, ${total} in total: ${detail}.`;
}
