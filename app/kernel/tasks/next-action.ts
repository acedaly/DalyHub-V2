/**
 * STEER-04 — the ONE next-action rule in the product (ADR-111 decision 4).
 *
 * ── The question, stated once ──────────────────────────────────────────────
 *
 *   > Given a Project, what is the next Task the owner should see as the next
 *   > actionable step under DalyHub's existing Task ordering rules?
 *
 * And the answer, which is deliberately not a new idea:
 *
 *   > The FIRST Task of that Project in the workspace's canonical **active
 *   > planning scope**, excluding dependency-blocked work, under the canonical
 *   > **`smart`** ordering.
 *
 * Nothing here invents a priority model, a score or a rank. `smart` is the
 * ordering `/tasks` already uses, expressed in `d1-task-repository.ts` as one
 * comparable string; the active planning scope is the predicate that repository
 * already applies to the `active` system view. DEBT-77 wrote the warning this
 * module obeys: *"reuse it rather than inventing a second notion of 'next', or
 * Today and `/tasks` will disagree about which task is next."*
 *
 * ── What is excluded, and by whose rule ────────────────────────────────────
 * Every exclusion below is an EXISTING DalyHub state, not a new one:
 *
 *   | excluded | because |
 *   |---|---|
 *   | completed | it is done (spine `completed_at`) |
 *   | cancelled / on hold | ADR-043 §5–§6: parked work is not active work |
 *   | Someday/Maybe | the owner has said "not now" (commitment state) |
 *   | waiting | TODAY-03: it is blocked on somebody else |
 *   | dependency-blocked | TASKS-12: a live, incomplete blocker points at it |
 *
 * The first four are exactly `#activePlanningWhere`. The fifth is the exact
 * complement of the repository's own `blocked` filter — a derived predicate
 * over live `task.blocks` edges, never a stored flag. Calling a Task whose
 * blocker is still open "the next action" would be the product recommending
 * work the owner cannot start, which is the one thing a next-action row must
 * never do.
 *
 * ── Why a pure mirror exists at all ────────────────────────────────────────
 * The repository is the implementation; this is the RULE, in the one place a
 * test can drive it without a database. The two are proven equal over a seeded
 * fact matrix by `test/kernel/task-next-action.test.ts` — the
 * `GOAL_ALIGNMENT_DISPLAY_RANK` / `GOAL_OUTCOME_DISPLAY_RANK` precedent — so a
 * future edit to either side that changes the answer fails a build rather than
 * an audit.
 */

import type { CommitmentState, TaskPriority, TaskStatus } from "./task";

/**
 * The recorded sentence. Documentation reads it, and so does a test, so the
 * rule the product ships and the rule the docs state cannot drift.
 */
export const NEXT_ACTION_RULE =
  "The first Task of the Project in the active planning scope (not completed, " +
  "cancelled, on hold, Someday/Maybe, waiting or dependency-blocked), under the " +
  "canonical Tasks smart ordering.";

/**
 * The canonical system view and sort the rule is expressed in. A caller that
 * wants to reproduce the rule through the ordinary collection read uses exactly
 * these, which is what the repository parity test does.
 */
export const NEXT_ACTION_VIEW = "active" as const;
export const NEXT_ACTION_SORT = "smart" as const;

/** The sentence a surface prints when the honest answer is "nothing visible". */
export const NO_NEXT_ACTION_TEXT = "No next action visible here";

/** The facts the rule reads. A subset of `TaskListItem`, by design. */
export interface NextActionFacts {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly status: TaskStatus;
  readonly commitmentState: CommitmentState;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  /** TODAY-03 — non-null while the Task waits on somebody or something else. */
  readonly waitingSince: Date | null;
  /** TASKS-12 — true while a live, incomplete blocker points at this Task. */
  readonly blocked: boolean;
}

/**
 * ELIGIBILITY — the active planning scope, plus TASKS-12's blocked exclusion.
 *
 * This is `#activePlanningWhere` read back in TypeScript, member for member, so
 * the two can be driven over one fact matrix and compared.
 */
export function isNextActionEligible(task: NextActionFacts): boolean {
  if (task.completedAt !== null) return false;
  if (task.status === "cancelled" || task.status === "on_hold") return false;
  if (task.commitmentState === "someday") return false;
  if (task.waitingSince !== null) return false;
  if (task.blocked) return false;
  return true;
}

/**
 * The canonical `smart` sort key, as ONE comparable string.
 *
 * Character-for-character the expression `#workspaceSortSpec("smart")` builds
 * in SQL, so the pure rule and the database sort the same population the same
 * way. Segments, most significant first:
 *
 *   1. open (`0`) before completed (`1`);
 *   2. among OPEN Tasks, OVERDUE (`0`) before not (`1`) — a due date STRICTLY
 *      before the owner's calendar day; due-today is not overdue;
 *   3. priority P1..P4, absent sorting last as `p9`;
 *   4. due date ascending, absent sorting last as `9999-99-99`.
 *
 * Lexicographic comparison of the joined string is the ordering; the SQL does
 * exactly the same thing, which is why it keysets as a single column.
 */
export function nextActionSortKey(
  task: Pick<NextActionFacts, "completedAt" | "dueDate" | "priority">,
  todayIso: string,
): string {
  const open = task.completedAt === null;
  const overdue =
    open && task.dueDate !== null && task.dueDate < todayIso ? "0" : "1";
  return [
    open ? "0" : "1",
    overdue,
    task.priority ?? "p9",
    task.dueDate ?? "9999-99-99",
  ].join("|");
}

/**
 * The full deterministic comparison: the smart key, then the repository's own
 * tiebreak (`created_at ASC, id ASC`).
 *
 * The tiebreak is not decoration. Without it two Tasks with the same priority
 * and no due date have no defined order, and "the next action" would change
 * between two reads of unchanged data — which is the kind of quiet
 * unpredictability that makes an owner stop trusting a suggestion.
 */
export function compareNextActionCandidates(
  left: NextActionFacts,
  right: NextActionFacts,
  todayIso: string,
): number {
  const leftKey = nextActionSortKey(left, todayIso);
  const rightKey = nextActionSortKey(right, todayIso);
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  const leftCreated = left.createdAt.getTime();
  const rightCreated = right.createdAt.getTime();
  if (leftCreated !== rightCreated) return leftCreated - rightCreated;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/**
 * THE RULE. Select the next action from a set of a Project's Tasks.
 *
 * Returns `null` when nothing is eligible — a Project with no Tasks, one whose
 * work is all finished, and one whose every open Task is blocked or parked all
 * arrive here, and all three get the same honest absence. A next action is
 * never fabricated to fill a row.
 */
export function selectNextAction<T extends NextActionFacts>(
  tasks: readonly T[],
  todayIso: string,
): T | null {
  let best: T | null = null;
  for (const task of tasks) {
    if (!isNextActionEligible(task)) continue;
    if (
      best === null ||
      compareNextActionCandidates(task, best, todayIso) < 0
    ) {
      best = task;
    }
  }
  return best;
}

/**
 * The GOAL-level composition (ADR-111 decision 4's second half).
 *
 * A Goal owns no Tasks — the spine forbids it (`AGENTS.md` §4), and
 * REDESIGN-04 §4.2 already refused a Goal Tasks tab for exactly that reason. So
 * a Goal's next step is composed THROUGH its structure:
 *
 *     Goal → contributing Projects (`project.advances_goal`)
 *          → each Project's canonical next action
 *          → the best of those, by the SAME ordering
 *
 * The choice among candidates is the same `compareNextActionCandidates` a
 * single Project's list is ranked by — not a second, Goal-specific model. Where
 * two Projects' next actions tie all the way down, the Task id decides, so a
 * Goal with several Projects selects predictably across reloads.
 */
export function selectGoalNextAction<T extends NextActionFacts>(
  candidates: readonly T[],
  todayIso: string,
): T | null {
  return selectNextAction(candidates, todayIso);
}
