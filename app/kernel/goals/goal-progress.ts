/**
 * AREA-02 Goals kernel — the pure Goal-project-contribution evaluator.
 *
 * Progress from linked Projects is DERIVED information, computed fresh from the
 * complete `GoalProjectFact` set (never a stored percentage, never a cached
 * score, never an average of Project task percentages). It is entirely
 * React-free and storage-free so it can be unit-tested directly with hand-built
 * facts, mirroring `evaluateAreaMomentum`.
 *
 * Precedence: a Project that is BOTH completed and archived counts once, under
 * `archived` — the same Archived-over-Completed precedence AREA-01's momentum
 * evaluator and Project card presentation already use. `total`/`completed`
 * count every non-deleted Project regardless of archived state, so they agree
 * exactly with the spine's own `GoalRollup.projects` definition. The four
 * workflow buckets (`active`/`planned`/`onHold`/`archived`) partition the set:
 * every fact lands in exactly one, so together with the completed-but-not-
 * archived remainder they sum to `total`.
 */

import type { GoalProjectContribution, GoalProjectFact } from "./goal";

/** The exact, zero-contribution presentation for a Goal with no linked Projects. */
export const EMPTY_GOAL_PROJECT_CONTRIBUTION: GoalProjectContribution = {
  total: 0,
  completed: 0,
  incomplete: 0,
  active: 0,
  planned: 0,
  onHold: 0,
  archived: 0,
};

/**
 * Evaluate the exact contribution counts from a complete fact set. De-duplicates
 * by Project id first (defence in depth against a corrupt or repeated
 * structural link — the database's partial unique index already prevents a
 * Project from holding two active `project.advances_goal` links, but a caller
 * must never double-count even if a duplicate somehow reaches here).
 */
export function evaluateGoalProjectContribution(
  facts: readonly GoalProjectFact[],
): GoalProjectContribution {
  const byId = new Map<string, GoalProjectFact>();
  for (const fact of facts) {
    byId.set(fact.id, fact);
  }
  const deduped = [...byId.values()];

  let completed = 0;
  let active = 0;
  let planned = 0;
  let onHold = 0;
  let archived = 0;

  for (const fact of deduped) {
    if (fact.completedAt !== null) {
      completed += 1;
    }
    if (fact.archivedAt !== null) {
      archived += 1;
      continue;
    }
    if (fact.completedAt !== null) {
      continue;
    }
    if (fact.status === "active") {
      active += 1;
    } else if (fact.status === "on_hold") {
      onHold += 1;
    } else {
      planned += 1;
    }
  }

  const total = deduped.length;
  return {
    total,
    completed,
    incomplete: total - completed,
    active,
    planned,
    onHold,
    archived,
  };
}
