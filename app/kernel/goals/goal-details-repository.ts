/**
 * AREA-02 Goals kernel — the Goal-details mutation + read repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `~/kernel/project-settings/project-settings-repository.ts`. Every write
 * verifies the target is an ACTIVE Goal in the bound workspace (missing,
 * deleted, wrong-kind and cross-workspace ids fail closed via
 * {@link GoalDetailsNotFoundError}) and is atomic with its Activity append —
 * never a separate precondition read followed by an unguarded write.
 */

import type {
  GoalDetailsChangeResult,
  GoalDetailsRecord,
  UpdateGoalDetailsInput,
} from "./goal-details";

export interface GoalDetailsRepository {
  /**
   * Read a Goal's detail fields. Returns the default `{ targetDate: null,
   * definitionOfDone: null }` shape when the Goal exists but has no
   * `goal_details` row (never backfilled). Returns `null` for a missing,
   * deleted, wrong-kind or cross-workspace Goal id — the cases are never
   * distinguished.
   */
  get(id: string): Promise<GoalDetailsRecord | null>;

  /**
   * Update one or both detail fields. An omitted key leaves that field
   * unchanged; `null` clears it. A patch that changes nothing (after
   * normalisation) is an idempotent no-op: no write, no Activity. A genuine
   * change atomically upserts `goal_details` and appends
   * `goal.details_updated` in the SAME transaction — an Activity-insert failure
   * rolls the details write back too.
   */
  update(
    id: string,
    patch: UpdateGoalDetailsInput,
  ): Promise<GoalDetailsChangeResult>;
}
