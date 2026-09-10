/**
 * FOLLOW-02 — the pure GOAL MOVEMENT evaluator: did this Goal move inside a
 * named window?
 *
 * ── Why it lives here, beside `evaluateGoalAlignment` ───────────────────────
 * [ADR-110] decision 6 and [DEBT-78] both name this file's home in advance:
 * *"the derivation belongs in `~/shared/alignment` beside the existing
 * evaluator, so Today and the Goal record cannot disagree."* `~/shared/alignment`
 * is the presentation barrel over this kernel, so the RULES sit here and the
 * barrel re-exports them — exactly the arrangement alignment itself already has.
 *
 * ── The question, and the two it is NOT ─────────────────────────────────────
 * DalyHub now asks three different things about a Goal, and they compose rather
 * than compete. Keeping them apart is the whole point of this module:
 *
 *   - **Alignment** (`evaluateGoalAlignment`, ADR-040) — does the Goal have a
 *     reachable structure, and has ANY meaningful Task activity touched it
 *     lately? An unbounded "most recent contribution" against a fortnight.
 *   - **Measurement status** (`evaluateGoalProgress`, GOAL-02) — where does the
 *     number stand against the target and the date the owner chose?
 *   - **Movement** (this module) — did work that advances this Goal produce an
 *     OUTCOME inside one named period?
 *
 * A Goal can legitimately be aligned but unmoved this week, poorly aligned but
 * moved, numerically on track with no movement this week, or unmeasured and
 * clearly moving. Nothing here overwrites either of the other two answers, and
 * `test/unit/alignment/goal-movement.test.ts` asserts each of those four
 * combinations explicitly.
 *
 * ── What counts as movement ─────────────────────────────────────────────────
 * OUTCOME events, never "something happened". Renaming a Project is activity; it
 * is not the Goal moving. The accepted set is exactly {@link GOAL_MOVEMENT_KINDS}
 * and the reasoning for every inclusion and every refusal is recorded in
 * `docs/product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md` §4–5.
 *
 * ── Nothing is stored ───────────────────────────────────────────────────────
 * No `goal_snapshots`, no trend column, no cached movement flag. The facts this
 * evaluator reads are gathered at read time by one bounded query over the
 * append-only Activity stream ([ADR-110] decisions 1 and 2).
 *
 * Pure, storage-free and clock-free: the owner's day and the owner-calendar
 * mapping are ARGUMENTS, so the whole matrix is unit-testable without a
 * database, a timezone or a wall clock.
 */

import {
  activityWindowPhase,
  type ActivityWindow,
  type ActivityWindowPhase,
} from "~/kernel/activity-window/activity-window";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The events that legitimately demonstrate a Goal ADVANCED, in the order a
 * statement lists them.
 *
 * Each one is an outcome the spine records explicitly, and each is reachable
 * from the Goal through a path the spine actually models:
 *
 * - `task_completed`      — a Task completed under a Project that advances this
 *                           Goal (`Task → task.belongs_to_project → Project →
 *                           project.advances_goal → Goal`, the ONE indirect path
 *                           `SPINE_MODEL.md` allows). The ordinary case.
 * - `project_completed`   — a contributing Project itself completed. A whole
 *                           body of work finished is unambiguously the Goal
 *                           moving.
 * - `measurement_logged`  — a reading recorded against a measurable Goal. This
 *                           is GOAL-02's own "meaningful progress event", named
 *                           as such where it is defined.
 * - `milestone_completed` — a defined stage of a milestone-measured Goal
 *                           completed; the milestone equivalent of a reading.
 * - `goal_completed`      — the Goal itself completed. The largest movement a
 *                           Goal can make, and it would be absurd for the week
 *                           it happened in to read "no movement".
 *
 * DELIBERATELY ABSENT, each for a stated reason (see the record's §5):
 * `entity.updated` and `entity.created` (metadata and intent, not outcome),
 * `task.planned` / `task.rescheduled` / `task.plan_cleared` (FOLLOW-01's
 * question, not this one), the `task.waiting_*` trio (workflow), every `*.
 * reopened` (an outcome being UNDONE is not forward movement), `goal.
 * measurement_corrected` / `goal.measurement_removed` (repairing the record of
 * the past is not new movement), `goal.target_reached` (written by the SAME
 * atomic write as the reading that caused it, so counting both would count one
 * act twice), `goal.details_updated` (configuration) and `entity_link.*`
 * (structure — see {@link GoalMovementFacts.contributingProjectCount}).
 */
export const GOAL_MOVEMENT_KINDS = [
  "task_completed",
  "project_completed",
  "measurement_logged",
  "milestone_completed",
  "goal_completed",
] as const;

export type GoalMovementKind = (typeof GOAL_MOVEMENT_KINDS)[number];

/**
 * The stable machine key a surface renders as a data attribute and a test reads
 * INSTEAD of comparing three independently authored sentences.
 *
 * Today, the Goals collection and the Goal record all publish the same key for
 * the same Goal, so "all three speak from the same facts" is provable without
 * asserting prose three times.
 */
export const GOAL_MOVEMENT_KEYS = [
  /** The window has not begun. Never described as stalled. */
  "not_started",
  /** At least one qualifying outcome inside the window. */
  "moved",
  /** The window is running and nothing qualifying has happened in it YET. */
  "no_movement_yet",
  /** The window has closed with no qualifying outcome inside it. */
  "no_movement",
  /** The read failed. "Nothing moved" and "we could not look" differ. */
  "unavailable",
] as const;

export type GoalMovementKey = (typeof GOAL_MOVEMENT_KEYS)[number];

/* -------------------------------------------------------------------------- */
/* Facts (the evaluator's input)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The complete, storage-independent fact set for ONE Goal's movement in one
 * window — gathered by `ActivityWindowRepository.readGoalMovementFacts` in a
 * fixed number of grouped statements for a whole page of Goals, never one query
 * per Goal.
 *
 * It is an AGGREGATE rather than a list of events on purpose. Everything the
 * product says about movement is a count, a distinct-Project count or the most
 * recent day, so the aggregation happens in SQL where it is bounded by
 * construction — a Goal with four thousand completed Tasks costs the same read
 * as one with two, and there is no event cap that could silently drop a Goal's
 * only piece of evidence.
 */
export type GoalMovementFacts = {
  readonly goalId: string;
  /**
   * How many non-deleted Projects currently hold an active
   * `project.advances_goal` link to this Goal — the set that COULD move it.
   *
   * Resolved from the CURRENT structural links, which is the same documented
   * approximation REVIEW-03's contribution read and FOLLOW-01's ancestry
   * resolution both make and both state: a Project linked to the Goal after a
   * Task under it completed still contributes that completion. Reconstructing
   * historical link membership would need the link events to carry a reversible
   * before/after pair for every edge, which they do not.
   */
  readonly contributingProjectCount: number;
  /**
   * How many DISTINCT contributing Projects produced at least one qualifying
   * event inside the window. Zero for movement that came from the Goal itself
   * (a reading, a milestone, the Goal's own completion).
   */
  readonly movedProjectCount: number;
  /** Qualifying events inside the window, per kind. Absent kinds read zero. */
  readonly counts: Readonly<Partial<Record<GoalMovementKind, number>>>;
  /** The most recent qualifying event's instant, or null when there was none. */
  readonly latestMovementAt: Date | null;
};

/** The zero fact set for a Goal the read returned no row for. */
export function emptyGoalMovementFacts(
  goalId: string,
  contributingProjectCount = 0,
): GoalMovementFacts {
  return {
    goalId,
    contributingProjectCount,
    movedProjectCount: 0,
    counts: {},
    latestMovementAt: null,
  };
}

/**
 * The injected clock + owner-calendar seam, mirroring
 * `AlignmentEvaluationContext` exactly. Nothing here reads a wall clock.
 */
export type GoalMovementContext = {
  /** The named window every figure below is bounded by. */
  readonly window: ActivityWindow;
  /** The OWNER's calendar day (ADR-022), resolved server-side. */
  readonly todayIso: string;
  /** Maps an instant to the owner's calendar day. */
  readonly calendarIsoOf: (instant: Date) => string;
};

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

/** One line of evidence: a kind and how many of it the window holds. */
export type GoalMovementEvidence = {
  readonly kind: GoalMovementKind;
  readonly count: number;
};

/**
 * A Goal's derived movement inside one named window. Entirely JSON-safe, so a
 * loader hands it straight to the browser and every consumer renders the SAME
 * value rather than re-deriving one.
 */
export type GoalMovement = {
  readonly goalId: string;
  /** The window this answer is about. Every figure states its own period. */
  readonly window: ActivityWindow;
  /** Where the owner's today sits relative to it — decides the tense. */
  readonly phase: ActivityWindowPhase;
  /** False when the read failed. A surface then says so instead of "nothing". */
  readonly available: boolean;
  /** The machine key. One per surface, identical across all three. */
  readonly key: GoalMovementKey;
  /** The answer. Always false for a future window and for an unavailable read. */
  readonly moved: boolean;
  readonly contributingProjectCount: number;
  readonly movedProjectCount: number;
  /** Every qualifying event inside the window, summed across the kinds. */
  readonly eventCount: number;
  /** True when the Goal itself carried a reading or a completed milestone. */
  readonly directMeasurementMovement: boolean;
  /** The owner-calendar day of the most recent qualifying event, or null. */
  readonly latestMovementDay: string | null;
  /** The kinds behind the answer, in `GOAL_MOVEMENT_KINDS` order. Zeroes omitted. */
  readonly evidence: readonly GoalMovementEvidence[];
  /** True when the Goal's own completion falls inside the window. */
  readonly completedInWindow: boolean;
};

/**
 * The exact shape for a Goal whose movement could not be READ — a repository
 * failure, or a surface that has no workspace scope at all.
 *
 * FOLLOW-01's rule, restated: *"Nothing was planned"* and *"DalyHub could not
 * read your history"* are different sentences, and a page must never print the
 * first when it means the second.
 */
export function unavailableGoalMovement(
  goalId: string,
  ctx: Pick<GoalMovementContext, "window" | "todayIso">,
): GoalMovement {
  return {
    goalId,
    window: ctx.window,
    phase: activityWindowPhase(ctx.window, ctx.todayIso),
    available: false,
    key: "unavailable",
    moved: false,
    contributingProjectCount: 0,
    movedProjectCount: 0,
    eventCount: 0,
    directMeasurementMovement: false,
    latestMovementDay: null,
    evidence: [],
    completedInWindow: false,
  };
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Derive a Goal's movement from its facts and the named window.
 *
 * The phase does the work [ADR-110] decision 5 asks of it: a window that has not
 * begun is never counted and never described as stalled, and a window still
 * running says "yet" where a closed one does not. That is structural here rather
 * than editorial — the key a surface branches on is decided in this function,
 * not in a sentence somewhere downstream.
 */
export function evaluateGoalMovement(
  facts: GoalMovementFacts,
  ctx: GoalMovementContext,
): GoalMovement {
  const phase = activityWindowPhase(ctx.window, ctx.todayIso);

  const evidence: GoalMovementEvidence[] = [];
  let eventCount = 0;
  for (const kind of GOAL_MOVEMENT_KINDS) {
    const count = Math.max(0, Math.trunc(facts.counts[kind] ?? 0));
    if (count === 0) continue;
    evidence.push({ kind, count });
    eventCount += count;
  }

  /*
   * A future window cannot hold an event, and if a fact set somehow claims one
   * the phase still wins: describing a period that has not happened as having
   * moved would be exactly the sentence decision 5 forbids, inverted.
   */
  const moved = phase !== "future" && eventCount > 0;

  const latestMovementDay =
    facts.latestMovementAt === null || !moved
      ? null
      : ctx.calendarIsoOf(facts.latestMovementAt);

  const directMeasurementMovement =
    moved &&
    evidence.some(
      (entry) =>
        entry.kind === "measurement_logged" ||
        entry.kind === "milestone_completed",
    );

  const completedInWindow =
    moved && evidence.some((entry) => entry.kind === "goal_completed");

  return {
    goalId: facts.goalId,
    window: ctx.window,
    phase,
    available: true,
    key:
      phase === "future"
        ? "not_started"
        : moved
          ? "moved"
          : phase === "running"
            ? "no_movement_yet"
            : "no_movement",
    moved,
    contributingProjectCount: Math.max(
      0,
      Math.trunc(facts.contributingProjectCount),
    ),
    movedProjectCount: moved
      ? Math.max(0, Math.trunc(facts.movedProjectCount))
      : 0,
    eventCount: moved ? eventCount : 0,
    directMeasurementMovement,
    latestMovementDay,
    evidence: moved ? evidence : [],
    completedInWindow,
  };
}
