/**
 * REDESIGN-04 — the SHARED Goal summary read.
 *
 * Promoted verbatim out of `app/modules/today/day/goal-progress.ts`, where it
 * had been since GOAL-02, because `mockup3.png` puts the same compact Goal rail
 * on the Projects page and §5.3 is explicit that its figures must come from an
 * existing summary read rather than a new one. Two modules needing the same
 * bounded read is exactly what `~/shared` is for; Today importing from Projects
 * (or Projects from Today) is what AGENTS.md §9 forbids.
 *
 * Nothing about the read changed in the move: the ranking, the exclusions, the
 * limits and the query shape are the ones Today has always used, and Today now
 * calls this instead of its own copy.
 *
 * ── What Today shows, and why those Goals ───────────────────────────────────
 * Not every Goal. The ranking is six rules an owner could recite:
 *
 *   1. a Goal the product would call **Needs attention** or **Overdue** first —
 *      it is behind its own schedule or past its own date;
 *   2. then a Goal whose **target date is close** (inside a month);
 *   3. then a Goal with NO reading that **moved** inside the named window,
 *      because momentum is the most useful thing a daily surface can show;
 *   4. then a Goal that has not been **checked in** for a week;
 *   5. then the remaining Goals that have a reading;
 *   6. last, a Goal with no reading and no movement inside the window.
 *
 * A Goal that has just reached its target appears once — it is the most useful
 * thing the section can say that day — and never again after it is completed.
 * There is no hidden scoring function and no weighting to tune.
 *
 * ── FOLLOW-02: an unmeasured Goal is no longer silent ──────────────────────
 * This read used to `continue` past every Goal with no measurement
 * configuration, so a workspace whose Goals carry no numeric target — which is
 * the shape the product's own seed has — was told *"No measurable Goals yet"*
 * every morning, and the top two levels of the spine contributed nothing to the
 * surface the owner opens daily. An unmeasured Goal now arrives with a truthful
 * MOVEMENT statement instead of a blank, and it is never given a fabricated
 * percentage to sit beside a measured one: "no numeric target" is not "0%", so
 * `progress` stays the honest unmeasured shape and the bar is simply absent.
 *
 * A MEASURED Goal's figures are untouched. Its rank, its evaluation, its
 * comparison window and its wording are exactly what they were; movement is an
 * addition beside GOAL-02's arithmetic, never a second opinion about it.
 *
 * ── Why movement arrives as a FUNCTION rather than as an import ────────────
 * `readGoalMovement` lives in a `.server` module, and this file is reached from
 * the CLIENT bundle through `~/shared/goal-progress` — the barrel Today's own
 * check-in sheet imports. Importing the server read here would drag the whole
 * platform layer into the browser, which is exactly what React Router's
 * `.server` rule exists to prevent. So the caller (a loader, which IS
 * server-only) passes the read in, the same seam `buildActivityWindow` uses for
 * the timezone database and for the same reason: one dependency, injected at
 * the one boundary that legitimately has it.
 *
 * ── What it costs ──────────────────────────────────────────────────────────
 * A bounded page of Goals, then FOUR grouped reads over that page's ids
 * (configuration, measurement summaries, milestone weights, and FOLLOW-02's
 * two-statement movement read). No history is loaded, and there is no query per
 * Goal (AGENTS.md §16) — the flatness proof is in `test/kernel/goal-movement.test.ts`.
 */

import { addDaysToIsoDate, type GoalMovement } from "~/kernel/alignment";
import { UNMEASURED_GOAL, type GoalProgressEvaluation } from "~/kernel/goals";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  evaluateGoalFromSummary,
  goalCheckInDue,
  goalNeedsAttention,
} from "./goal-progress-view";

/**
 * How many Goals are READ before ranking. A small multiple of what is shown, so
 * the ranking has something to choose from without the read growing with the
 * workspace.
 */
const GOAL_SCAN_LIMIT = 12;

/** How many make it onto the surface. Four is the most a rail can hold without
 * becoming a second collection. */
export const GOAL_SUMMARY_LIMIT = 4;

/** The window the card's "this month" figure compares against. */
const COMPARISON_WINDOW_DAYS = 30;

/** "Approaching" — a target date inside a month is close enough to act on. */
const TARGET_SOON_DAYS = 30;

/** One Goal's bounded summary, for a rail or a compact section. JSON-safe. */
export interface GoalSummary {
  readonly id: string;
  readonly title: string;
  readonly areaTitle: string;
  /**
   * UIX-03 — the Area's identity, so Today draws a Goal with the SAME mark and
   * accent the Goals gallery draws it with.
   *
   * Today used to derive a tone from a hash of the Goal's id, on the stated
   * ground that "a Goal carries no persisted icon or colour of its own". That
   * premise is no longer true: a Goal inherits its Area's identity, which every
   * Goal read now resolves. A deterministic-but-arbitrary colour was stable, and
   * stable is not the same as MEANINGFUL — the same Goal was green on Today and
   * grey in the gallery, and neither colour said anything.
   */
  readonly areaColourRank: number | null;
  readonly areaIconKey: string | null;
  /** IDENTITY-01 — the Area's own CHOSEN colour, which beats its rank. */
  readonly areaColourSlot: string | null;
  /**
   * IDENTITY-01 — the Goal's OWN identity, which beats everything above.
   *
   * The premise that "a Goal carries no identity of its own" is now false in
   * both directions: it inherits its Area's, and it may also choose. The
   * reference draws Goals with individually meaningful icons, so the rail
   * carries both halves and lets the one resolver decide.
   */
  readonly iconKey: string | null;
  readonly colourSlot: string | null;
  readonly progress: GoalProgressEvaluation;
  /**
   * FOLLOW-02 — whether this Goal moved inside the named window, from the ONE
   * shared derivation Today, `/goals` and the Goal record all read.
   *
   * `null` only when the caller did not ask for movement; an unreadable
   * movement arrives as a `GoalMovement` with `available: false`, because
   * "nothing moved" and "we could not look" are different sentences.
   */
  readonly movement: GoalMovement | null;
  /** The change since the comparison reading, e.g. `-0.3`. `null` when there is
   * no earlier reading to compare with — never a fabricated zero. */
  readonly changeInWindow: number | null;
  readonly windowDays: number;
}

/**
 * The display rank. Lower sorts first. Six explicable buckets.
 *
 * The split is **whether the Goal has a READING to lead with**, not whether it
 * is configured — because a configured Goal with nothing recorded has exactly
 * as much of a figure to show as one with no target at all: none. Both are
 * ranked on movement instead.
 *
 * A Goal WITH a reading keeps exactly the four predicates and the order it had
 * before FOLLOW-02, so nothing about GOAL-02's Goals moved relative to one
 * another:
 *
 *   0  reading · behind its own schedule or past its own date
 *   1  reading · target date inside a month
 *   2  NO reading · moved inside the window — momentum is worth a glance
 *   3  reading · not checked in for a week
 *   4  reading · everything else
 *   5  NO reading · no movement inside the window
 *
 * Bucket 5 is deliberately BELOW every Goal with a reading. A Goal with nothing
 * recorded and nothing to report this week is the least useful thing a daily
 * surface can show, and letting it displace a Goal that is genuinely moving
 * would make the panel worse than it was before FOLLOW-02 — which is the
 * opposite of the point.
 */
export function goalSummaryRank(
  goal: GoalSummary,
  todayIso: string,
): 0 | 1 | 2 | 3 | 4 | 5 {
  if (goal.progress.current !== null) {
    if (goalNeedsAttention(goal.progress.status)) return 0;
    if (goal.progress.targetDate !== null) {
      const days = daysUntil(todayIso, goal.progress.targetDate);
      if (days !== null && days >= 0 && days <= TARGET_SOON_DAYS) return 1;
    }
    if (goalCheckInDue(goal.progress)) return 3;
    return 4;
  }
  return goal.movement?.moved === true ? 2 : 5;
}

function daysUntil(fromIso: string, toIso: string): number | null {
  const parse = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  };
  const a = parse(fromIso);
  const b = parse(toIso);
  return a === null || b === null ? null : Math.round((b - a) / 86_400_000);
}

/**
 * The Goals worth a look today.
 *
 * A completed Goal is excluded: Today is about what is still moving.
 *
 * ── One inclusion rule: a Goal earns its place by having something TRUE to say
 *
 * Before FOLLOW-02 the only thing a Goal could say here was a READING, so a Goal
 * without one — measured-but-unstarted, or unmeasured — was excluded. Movement
 * is a second thing it can say, and it is available to both.
 *
 * So: a Goal appears when it has a reading OR when this caller asked for
 * movement. Which means:
 *
 * - **Measured, with a reading** — exactly what it showed before FOLLOW-02: the
 *   evaluation, the bar and the comparison figure, all from GOAL-02.
 * - **Measured, nothing recorded yet** — included on a surface that asked for
 *   movement, with GOAL-02's own designed absence where the reading would be
 *   (never a 0% bar) and the movement sentence beneath it. A contributing
 *   Project completing genuinely moves such a Goal, and the panel could not say
 *   so while it was excluded.
 * - **Unmeasured** — included on a surface that asked for movement, with the
 *   movement statement and NO percentage.
 * - **Any Goal, on a caller that did not ask for movement** (the Projects page's
 *   compact measurement rail) — exactly the set GOAL-02 showed, unchanged,
 *   because a Goal drawn with no bar, no figure and no sentence is worse than an
 *   absent one.
 *
 * That single rule is what makes the EMPTY STATE honest. Today always asks for
 * movement, so an empty result there means the workspace has no open Goals —
 * which is what the empty line says. Under the previous two-rule version a
 * workspace whose Goals were all measurable-but-unstarted produced an empty
 * panel and was told to add a Goal, when what it needed was to record its first
 * measurement.
 */
export async function loadGoalSummaries(
  scope: WorkspaceScope,
  facts: {
    readonly now: Date;
    readonly timezone: string;
    readonly todayIso: string;
    readonly recentBoundaryStartIso: string;
    /**
     * FOLLOW-02 — the ONE shared movement read, injected by the loader.
     *
     * Given this page's Goal ids it returns the SAME `GoalMovement` values the
     * Goals collection and the Goal record show. Omitted by a caller that does
     * not want movement at all (the Projects page's measurement rail), in which
     * case every summary's `movement` is null and no extra query is made.
     */
    readonly readMovement?: (
      goalIds: readonly string[],
    ) => Promise<ReadonlyMap<string, GoalMovement>>;
  },
): Promise<readonly GoalSummary[]> {
  const page = await scope.goals.listGoalsByAlignment({
    activeBoundaryIso: facts.recentBoundaryStartIso,
  });
  const items = page.items
    .filter((item) => item.completedAt === null)
    .slice(0, GOAL_SCAN_LIMIT);
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return [];

  const comparisonFromIso = addDaysToIsoDate(
    facts.todayIso,
    -COMPARISON_WINDOW_DAYS,
  );
  const [detailsById, summaries, milestoneSummaries, movement] =
    await Promise.all([
      scope.goalDetails.listMany(ids),
      scope.goalMeasurements.listMeasurementSummaries(ids, {
        comparisonFromIso,
      }),
      scope.goalMeasurements.listMilestoneSummaries(ids),
      facts.readMovement ? facts.readMovement(ids) : Promise.resolve(null),
    ]);

  const goals: GoalSummary[] = [];
  for (const item of items) {
    const details = detailsById.get(item.id);
    const config = details?.measurement ?? UNMEASURED_GOAL;
    const summary = summaries.get(item.id) ?? null;
    const progress = evaluateGoalFromSummary({
      config,
      targetDate: details?.targetDate ?? null,
      summary,
      milestones: milestoneSummaries.get(item.id),
      startedOn: ownerCalendarIso(item.createdAt, facts.timezone),
      completed: false,
      todayIso: facts.todayIso,
    });
    /*
     * The ONE inclusion rule (see the note above): a reading, or a movement
     * statement this caller asked for. A Goal with neither has nothing true to
     * say on a glance surface, and is picked up on the Goals collection instead.
     */
    if (progress.current === null && movement === null) continue;
    const prior = summary?.priorInWindow ?? null;
    goals.push({
      id: item.id,
      title: item.title,
      areaTitle: item.area.title,
      areaColourRank: item.area.colourRank ?? null,
      areaIconKey: item.area.iconKey ?? null,
      areaColourSlot: item.area.colourSlot ?? null,
      iconKey: details?.iconKey ?? null,
      colourSlot: details?.colourSlot ?? null,
      progress,
      movement: movement?.get(item.id) ?? null,
      changeInWindow:
        prior !== null && summary?.latest
          ? summary.latest.value - prior.value
          : null,
      windowDays: COMPARISON_WINDOW_DAYS,
    });
  }

  return goals
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => {
      const rank =
        goalSummaryRank(a.goal, facts.todayIso) -
        goalSummaryRank(b.goal, facts.todayIso);
      // The repository's alignment order is the stable tiebreak, so two Goals in
      // the same bucket keep the order the collection would show them in.
      return rank !== 0 ? rank : a.index - b.index;
    })
    .slice(0, GOAL_SUMMARY_LIMIT)
    .map((entry) => entry.goal);
}
