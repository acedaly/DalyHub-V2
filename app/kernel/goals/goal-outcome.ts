/**
 * STEER-01 Goals kernel — the OUTCOME display rank and the collection lenses.
 *
 * `/goals` is the outcomes workspace. The question it answers is recorded here,
 * once, so the SQL ordering expression, the pure comparator and the module
 * documentation cannot drift into three versions of it:
 *
 * > **"How are my outcomes going — and which need my decision first?"**
 *
 * The order is the answer, stated as a deterministic precedence over the
 * statuses `evaluateGoalProgress` already produces (GOAL-02) plus the spine's
 * explicit completion. Nothing here is a new derivation: the rank CONSUMES the
 * one evaluator's status, exactly as `GOAL_ALIGNMENT_DISPLAY_RANK` consumes
 * `evaluateGoalAlignment`'s state (the DEBT-23 precedent this mirrors).
 *
 * ── The precedence, and why ─────────────────────────────────────────────────
 *  1. Outcomes that are off their own schedule lead — `overdue` (the owner's
 *     own date has passed), then `needs_attention` (behind the line the owner
 *     set, or moving backwards).
 *  2. Then `stale`: a measured Goal whose readings went quiet a month ago — it
 *     cannot answer the outcome question until a reading arrives, which is
 *     itself a steering fact.
 *  3. Then outcomes under way — `on_track`, `ahead`, `in_progress` (moving,
 *     with no date to compare against).
 *  4. Then `achieved`: the target is reached and only the owner's explicit
 *     completion remains. Good news, and one action — after the problems,
 *     before the absences.
 *  5. Then the absences — `not_started` (configured, nothing recorded), then
 *     `not_measured` (never given a measurement; alignment tells its story).
 *     FOLLOW-02's recorded finding is an input here: **a Goal with a reading to
 *     lead with outranks one with only absence to report** — which is also
 *     DEBT-120's exemplar defect, inverted: an unmeasured Goal can no longer
 *     sit above a measured Goal that is behind its own target date.
 *  6. The spine's explicit completion sits last, whatever the readings say —
 *     a closed chapter is read after the open ones.
 *
 * Within a rank the tiebreak is `(createdAt, id)` ascending — the same
 * immutable, deterministic tail every keyset cursor in this module uses.
 *
 * Two things this rank deliberately does NOT read:
 *  - **Movement.** FOLLOW-02's recorded rule stands: movement is an ATTENTION
 *    signal, never an outcome metric, so it does not move a Goal in an outcome
 *    ordering. Alignment likewise keeps its own ordering for the surfaces that
 *    still ask the alignment question (`listGoalsByAlignment` — ADR-040).
 *  - **The owner's condition (STEER-02).** A set-aside Goal keeps exactly the
 *    place its outcome earns: the collection is where the owner deliberately
 *    looks, not an attention surface, and the condition is stated beside the
 *    facts rather than re-ranking them (ADR-111 decision 3).
 */

import type { GoalProgressStatus } from "./goal-progress-evaluator";
import type { GoalCondition } from "./goal-details";

/**
 * The recorded question the `/goals` collection order answers. Referenced by
 * the module documentation; kept here so code and prose share one sentence.
 */
export const GOAL_OUTCOME_QUESTION =
  "How are my outcomes going — and which need my decision first?";

/**
 * The outcome display rank for each GOAL-02 status (lower = shown first).
 *
 * ONE source of truth: `goalOutcomeDisplayRank` derives from this table and the
 * repository's SQL `CASE` mirrors it under a parity test
 * (`test/kernel/goal-outcome.test.ts`) — the `GOAL_ALIGNMENT_DISPLAY_RANK`
 * precedent, so the two cannot silently disagree.
 */
export const GOAL_OUTCOME_DISPLAY_RANK: Readonly<
  Record<GoalProgressStatus, number>
> = {
  overdue: 0,
  needs_attention: 1,
  stale: 2,
  on_track: 3,
  ahead: 4,
  in_progress: 5,
  achieved: 6,
  not_started: 7,
  not_measured: 8,
};

/** The rank of a Goal the spine says is explicitly complete — always last. */
export const GOAL_OUTCOME_COMPLETED_RANK = 9;

/**
 * The workspace-wide outcome display rank for one Goal (lower = shown first).
 *
 * Explicit completion is the spine's fact and always outranks the derived
 * status — a completed Goal whose last reading implied "overdue" is finished,
 * not late.
 */
export function goalOutcomeDisplayRank(goal: {
  readonly completed: boolean;
  readonly status: GoalProgressStatus;
}): number {
  if (goal.completed) return GOAL_OUTCOME_COMPLETED_RANK;
  return GOAL_OUTCOME_DISPLAY_RANK[goal.status];
}

/* -------------------------------------------------------------------------- */
/* Collection lenses                                                          */
/* -------------------------------------------------------------------------- */

/**
 * UIX-03 / STEER-01 — the Goals collection's lenses, now a KERNEL vocabulary.
 *
 * Every lens is a partition over facts the evaluators already produce, so the
 * filter can never disagree with the word printed on the row. STEER-01 moved
 * the partition here (from `~/shared/goal-progress`) because the lens now
 * filters the WORKSPACE in the repository read, and the SQL bucket expression
 * must derive from the same table as the pure predicate — the same
 * one-authority rule the display rank follows. The shared module re-exports it.
 *
 * `completed` is the SPINE's explicit completion, never the derived "target
 * achieved". `set_aside` (STEER-02) is the owner's stored condition — a Goal
 * the owner is deliberately not pursuing right now; like every other lens it
 * excludes explicitly completed Goals, which appear under Completed (and All)
 * only.
 */
export const GOAL_COLLECTION_VIEWS = [
  "all",
  "on_track",
  "attention",
  "set_aside",
  "completed",
] as const;

export type GoalCollectionView = (typeof GOAL_COLLECTION_VIEWS)[number];

export const GOAL_COLLECTION_VIEW_LABELS: Readonly<
  Record<GoalCollectionView, string>
> = {
  all: "All",
  on_track: "On track",
  attention: "Needs attention",
  set_aside: "Set aside",
  completed: "Completed",
};

export function parseGoalCollectionView(
  value: string | null,
): GoalCollectionView {
  return value !== null &&
    (GOAL_COLLECTION_VIEWS as readonly string[]).includes(value)
    ? (value as GoalCollectionView)
    : "all";
}

/**
 * Does this Goal belong in the given lens?
 *
 * `completed` is asked FIRST and answered from explicit completion alone, so a
 * finished Goal appears once — in "Completed" — rather than also under
 * whatever its last reading (or its stored condition) implied.
 *
 * The status lenses are deliberately CONDITION-BLIND (ADR-111 decision 3): a
 * set-aside Goal whose readings say "needs attention" still appears under
 * Needs attention, because the lens filters derived truth and the condition
 * never suppresses it. "Set aside" is an additional lens for finding those
 * Goals, not a hole the others quietly acquire.
 */
export function goalMatchesCollectionView(
  view: GoalCollectionView,
  goal: {
    readonly completed: boolean;
    readonly status: GoalProgressStatus;
    /** STEER-02 — the owner's stored condition; absent reads as "pursuing". */
    readonly condition?: GoalCondition | null;
  },
): boolean {
  if (view === "completed") return goal.completed;
  if (goal.completed) return view === "all";
  switch (view) {
    case "on_track":
      return goal.status === "on_track" || goal.status === "ahead";
    case "attention":
      return goal.status === "needs_attention" || goal.status === "overdue";
    case "set_aside":
      return goal.condition === "set_aside";
    default:
      return true;
  }
}

/**
 * The workspace-true count for every lens — the shape
 * `GoalRepository.countGoalsByOutcomeLens` returns and the collection's tabs
 * print. DEBT-121's rule, satisfied structurally: a count shown beside a lens
 * is a workspace figure or it is not shown.
 */
export type GoalOutcomeLensCounts = {
  /** Every Goal in the workspace's active collection (completed included). */
  readonly total: number;
  readonly on_track: number;
  readonly attention: number;
  readonly set_aside: number;
  readonly completed: number;
};
