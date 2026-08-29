/**
 * FIND-01 — the workspace-bound read contract behind the recency rule.
 *
 * Storage-independent and WORKSPACE-BOUND like every other kernel repository
 * (ADR-010): no method takes a `workspaceId`, so module code cannot select,
 * widen or override the scope. Workspace isolation is structural here rather
 * than a caller's responsibility — there is no parameter through which a caller
 * could ask for another workspace's records even by mistake.
 *
 * It owns exactly one thing: a BOUNDED READ OVER DATA THAT ALREADY EXISTS.
 * There is no write method here and there never will be. ADR-112 decision 5
 * makes recency derived rather than stored, so this repository has nothing of
 * its own to persist — no table, no column, no migration and no write path
 * behind it. It reads the append-only Activity stream (ADR-005/ADR-012) and the
 * `entities` substrate (ADR-009), both of which the product already maintains.
 *
 * Modelled on `ActivityWindowRepository` (FOLLOW-01), deliberately: that is the
 * established shape for "a bounded derivation over the Activity stream that is
 * product machinery rather than one surface's helper", and a second shape for
 * the same kind of read would be a second convention.
 */

import type { RecentRecord } from "./recent-records";

export interface RecentRecordsRepository {
  /**
   * The workspace's most recently worked-on records, newest first.
   *
   * ONE statement, whatever the workspace holds, and flat in workspace size:
   * the read looks back over at most `RECENT_ACTIVITY_SCAN_LIMIT` Activity
   * events through the existing `(workspace_id, occurred_at, id)` index, groups
   * those to each record's newest event, and returns at most `limit` rows. A
   * workspace with ten records and one with ten thousand cost the same.
   *
   * Excludes, structurally rather than by the caller's care:
   *
   *   - other workspaces (the scope is bound, not passed);
   *   - soft-deleted records — a deleted record is not something to re-open, and
   *     `activity_subjects` deliberately outlives soft-delete so its history
   *     survives (migration 0004), which means the join MUST filter or a deleted
   *     record would reappear at the top of the list the moment it was deleted;
   *   - `RECENCY_EXCLUDED_TYPES`.
   *
   * Returns fewer than `limit` rows — including none — whenever the workspace
   * genuinely has that little recent history. That is an honest answer, not a
   * failure, and the surface renders it as one.
   */
  listRecentlyWorkedOn(options?: {
    /** Maximum rows to return. Defaults to `RECENT_RECORD_LIMIT`. */
    readonly limit?: number;
    /** Activity events to look back over. Defaults to `RECENT_ACTIVITY_SCAN_LIMIT`. */
    readonly scanLimit?: number;
  }): Promise<readonly RecentRecord[]>;
}
