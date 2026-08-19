/**
 * TASKS-12 Task dependencies — the domain model for "A blocks B".
 *
 * ── The distinction TASKS-12 is built on ─────────────────────────────────────
 * **Recurrence decides WHEN a Task occurrence exists. A dependency decides
 * WHETHER an existing Task can proceed.** They are two different questions about
 * two different things, and this file never mentions dates for exactly that
 * reason: a dependency has no schedule, no interval and no calendar arithmetic.
 * It is one directed edge between two Tasks.
 *
 * ── One canonical direction ──────────────────────────────────────────────────
 * The stored relationship is ALWAYS `blocker --task.blocks--> blocked`. "B is
 * blocked by A" is not a second record; it is the SAME row read from the other
 * end, which is precisely what an EntityLink is (ADR-002/ADR-011: direction is
 * meaningful, the row is stored once, and the endpoints are never reordered).
 * Storing both directions would create two mutable truths that could disagree,
 * and there would be no way to say which one was right.
 *
 * ── Why EntityLinks and not a `task_dependencies` table ──────────────────────
 * A dependency is a typed, directed, workspace-isolated relationship between two
 * entities, which is the definition of the kernel primitive DalyHub already has.
 * The existing schema supplies, without a new table: the composite endpoint
 * foreign keys that make a cross-workspace edge impossible AT THE DATABASE
 * LEVEL, the `source <> target` CHECK that refuses a self-dependency, the unique
 * `(workspace, source, target, type)` identity that refuses a duplicate edge and
 * survives unlink/restore, and four partial indexes — including
 * `(workspace, source, type)` and `(workspace, target, type)` — that are exactly
 * the two access paths a blocker read and a cycle walk need. A second join model
 * would have re-earned all of that and given Tasks two relationship systems.
 *
 * What EntityLinks does NOT supply is dependency SEMANTICS — no cycles, a bounded
 * fan-in and fan-out, and Task-only endpoints. Those are enforced in the
 * workspace-bound `TaskRepository`, inside the write, exactly as `task.waiting_on`
 * is (see {@link RESERVED_TASK_LINK_TYPES}); the generic link repository REFUSES
 * `task.blocks`, so there is no second way to create one.
 *
 * ── Blocked is DERIVED, never stored ─────────────────────────────────────────
 * There is no `is_blocked` column and no `blocked` status anywhere in DalyHub. A
 * Task is blocked iff at least one active `task.blocks` edge points at it from a
 * Task that is alive and not complete. Completing the last blocker unblocks it;
 * REOPENING that blocker blocks it again — with no reconciliation job, no cache
 * to invalidate and no stale flag, because there is nothing to keep in step.
 */

import { TaskValidationError } from "./task-errors";

/**
 * The reserved link type recording a dependency, directed
 * BLOCKER → BLOCKED. Only the `TaskRepository` may create or remove one, so the
 * cycle, bound, endpoint-kind and workspace invariants cannot be bypassed by the
 * generic EntityLink picker.
 */
export const TASK_BLOCKS = "task.blocks";

/**
 * The most direct BLOCKERS one Task may have.
 *
 * Twenty is chosen against what the relationship is FOR. A dependency answers
 * "what has to happen before I can start this?", and a Task with more than twenty
 * distinct answers is not a Task — it is a Project, and DalyHub already has one
 * of those. The bound also keeps every dependency read provably small: a Task's
 * blockers are at most twenty rows, and a blocked-state aggregate over a page of
 * fifty Tasks is at most one thousand.
 *
 * Enforced INSIDE the insert (a count predicate in the same statement), never by
 * a read-then-decide, so two concurrent adds cannot both see nineteen.
 */
export const MAX_TASK_BLOCKERS = 20;

/**
 * The most Tasks one Task may BLOCK.
 *
 * Symmetric with {@link MAX_TASK_BLOCKERS} and for the same reason: an unbounded
 * fan-out makes the cycle walk and the "what does this unblock?" read unbounded
 * too. A Task that gates more than twenty others is a milestone, and a milestone
 * is a Project.
 */
export const MAX_TASK_BLOCKS = 20;

/**
 * The furthest the cycle walk follows the dependency graph before it stops.
 *
 * The walk is BOUNDED BY CONSTRUCTION rather than trusted to terminate: the
 * recursive query carries a depth column and refuses to go past this, so a graph
 * that somehow already contained a cycle (a restored archive, a future bug) makes
 * the walk stop rather than run forever. Sixty-four is far beyond any real chain —
 * a personal productivity app's dependency depth is two or three — and small
 * enough that the worst case is a handful of index seeks.
 */
export const MAX_DEPENDENCY_DEPTH = 64;

/** One end of a dependency, as every dependency surface shows it. */
export interface TaskDependencyEndpoint {
  /** The other Task's id. */
  readonly taskId: string;
  readonly title: string;
  /** Completion is the spine's, never a status: `null` means still open. */
  readonly completedAt: Date | null;
}

/**
 * One Task's dependencies in both directions, as ONE bounded read.
 *
 * `blockedBy` and `blocks` are the two ends of the same relationship type, read
 * from the same table; they are returned together because the record draws them
 * together and two reads would be two chances to disagree.
 */
export interface TaskDependencies {
  /** Tasks that must be complete before this one can proceed. */
  readonly blockedBy: readonly TaskDependencyEndpoint[];
  /** Tasks this one is holding up. */
  readonly blocks: readonly TaskDependencyEndpoint[];
}

/** The dependencies of a Task with none. Shared so no caller invents it. */
export const EMPTY_TASK_DEPENDENCIES: TaskDependencies = {
  blockedBy: [],
  blocks: [],
};

/**
 * The blocked state of ONE Task, reduced to what a ROW draws.
 *
 * `blockerCount` counts only blockers that still block — alive and not complete —
 * so it is already the answer to "is this blocked?" (`> 0`) and never needs a
 * second derivation on the client. `firstBlockerTitle` is the alphabetically-first
 * such blocker's title, so a row can say WHY without a per-row read and without
 * two devices disagreeing about which blocker to name.
 */
export interface TaskBlockedSummary {
  readonly blockerCount: number;
  readonly firstBlockerTitle: string;
}

/**
 * "Blocked by Get director approval" / "Blocked by 2 tasks" — the ONE wording
 * DalyHub uses for a blocked Task, wherever it appears.
 *
 * One blocker is NAMED, because the name is the actionable fact ("go and chase
 * that"). More than one is COUNTED, because a row cannot carry three titles and
 * naming only the first would be a half-truth. Returns null when nothing blocks,
 * so a surface never has to decide what "blocked by 0" means.
 */
export function taskBlockedLabel(
  summary: TaskBlockedSummary | null | undefined,
): string | null {
  if (!summary || summary.blockerCount < 1) return null;
  return summary.blockerCount === 1
    ? `Blocked by ${summary.firstBlockerTitle}`
    : `Blocked by ${summary.blockerCount} tasks`;
}

/** True when this summary means the Task cannot proceed. */
export function isTaskBlocked(
  summary: TaskBlockedSummary | null | undefined,
): boolean {
  return (summary?.blockerCount ?? 0) > 0;
}

/**
 * Validate the PAIR of ids a dependency mutation names.
 *
 * The self-dependency refusal lives here — in the kernel, at the boundary — as
 * well as in the schema's `source <> target` CHECK, because a refusal the owner
 * reads as a sentence is worth more than a constraint violation, and because the
 * kernel must not depend on the database to state a domain rule.
 */
export function validateTaskDependencyPair(
  blockerId: string,
  blockedId: string,
): { readonly blockerId: string; readonly blockedId: string } {
  const blocker = blockerId.trim();
  const blocked = blockedId.trim();
  if (blocker.length === 0 || blocked.length === 0) {
    throw new TaskValidationError("dependency", "choose a task");
  }
  if (blocker === blocked) {
    throw new TaskValidationError(
      "dependency",
      "a task cannot block itself",
    );
  }
  return { blockerId: blocker, blockedId: blocked };
}
