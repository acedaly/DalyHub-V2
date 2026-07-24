/**
 * AREA-03 Alignment kernel — the read-only facts repository contract
 * (ADR-040 §40.6).
 *
 * A storage-independent, WORKSPACE-BOUND read projection that gathers the raw
 * `GoalAlignmentActivityFacts`/`GoalAlignmentEvidence` a Goal's alignment is
 * partly derived from (Goal completion and Project contribution stay
 * `GoalRepository`'s authority — the route composes all three into a
 * `GoalAlignmentFacts` via `composeGoalAlignmentFacts`). It performs NO
 * mutations and stores NOTHING — alignment is recomputed from live spine,
 * `entity_links` and Activity data every read. Like `ProjectHealthRepository`,
 * no method accepts a `workspaceId`; scope is fixed at construction
 * (ADR-010), and a Goal in another workspace (or a non-Goal id) is
 * indistinguishable from "not found".
 *
 * The rules live in `evaluateGoalAlignment` (`goal-alignment.ts`); this
 * contract only supplies facts and evidence. `listGoalAlignmentFacts` is
 * bounded and N+1-free: it gathers the COMPLETE activity aggregate for a
 * WHOLE bounded page of Goals in a fixed number of grouped queries, never one
 * query per Goal.
 */

import type {
  GoalAlignmentActivityFacts,
  GoalAlignmentEvidence,
} from "./goal-alignment";

/** The pre-computed window boundaries the repository needs — never computed
 * inside the D1 adapter, so no timezone logic ever lives in SQL. */
export type AlignmentWindow = {
  /** The UTC-instant lower bound for the SUPPORTING recent-count read only
   * (see `recentWindowStartIso`). `lastContributingActivityAt` is always read
   * UNBOUNDED — the evaluator, not this window, decides recency by mapping it
   * to the owner's calendar day. */
  readonly recentWindowStartIso: string;
};

export interface AlignmentRepository {
  /**
   * Gather the COMPLETE activity-contribution facts for a bounded set of
   * Goal ids (a collection page), returning a map keyed by Goal id. Ids are
   * validated and de-duplicated; a Goal id with no qualifying Task activity
   * is simply absent from the map (the caller composes the honest zero/null
   * shape via `composeGoalAlignmentFacts`) — never disclosed, never an
   * error. Computed in a fixed number of grouped queries regardless of page
   * size (no N+1).
   */
  listGoalAlignmentFacts(
    goalIds: readonly string[],
    window: AlignmentWindow,
  ): Promise<Map<string, GoalAlignmentActivityFacts>>;

  /**
   * Gather the complete activity-contribution facts for one Goal. Returns
   * null when the Goal has no qualifying Task activity recorded (the caller
   * composes the honest zero/null shape) — this method does not verify the
   * Goal itself exists; callers verify that separately (e.g. via
   * `GoalRepository.getGoalOverview`).
   */
  getGoalAlignmentFacts(
    goalId: string,
    window: AlignmentWindow,
  ): Promise<GoalAlignmentActivityFacts | null>;

  /**
   * A SEPARATE, bounded, single-Goal evidence page — up to `limit` of the
   * most recent qualifying contributing-Task activity rows, newest first
   * (one row per Task — its own most recent qualifying event), plus an
   * honest `hasMore` flag (the fetch-`limit`-plus-one pattern every bounded
   * collection in this codebase uses, never a separate COUNT). Display only;
   * never consulted for classification (ADR-040 §40.6), so truncating it can
   * never silently change a Goal's alignment state.
   */
  listGoalAlignmentEvidence(
    goalId: string,
    limit: number,
  ): Promise<GoalAlignmentEvidencePage>;
}

export type GoalAlignmentEvidencePage = {
  readonly items: readonly GoalAlignmentEvidence[];
  readonly hasMore: boolean;
};
