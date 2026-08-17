/**
 * REVIEW-03 — the workspace-bound read/write contract behind Review insights.
 *
 * Storage-independent, and WORKSPACE-BOUND like every other kernel repository
 * (ADR-010): no method takes a `workspaceId`, so module code cannot select or
 * override the scope. A Review in another workspace is indistinguishable from
 * one that does not exist.
 *
 * It owns exactly two things:
 *
 *   1. **Bounded aggregate reads** over data that already exists — the
 *      append-only Activity stream and the spine's structural links. Every one
 *      is a grouped aggregate computed in the database, never "load the
 *      workspace into React and count it". The counts these return are EXACT
 *      for the whole workspace scope unless a method's documentation says
 *      otherwise, and where a list is bounded the bound is reported.
 *   2. **The Review insight snapshot** — the one persisted artefact REVIEW-03
 *      introduces (`review-insight-snapshot.ts` explains why it has to exist).
 *      It is written only when a Review is completed, read only to compare one
 *      Review against the previous one, and is never authoritative for any
 *      Area, Goal, Project or Task.
 *
 * Nothing here records Activity. Reading a Review's evidence is not an event in
 * the owner's history, and capturing a snapshot is bookkeeping about a
 * completion that already has its own event.
 */

import type {
  CarryOverTaskFact,
  PeriodCompletionCounts,
  PeriodContributionRow,
  ReviewPeriodWindow,
} from "./review-insight-facts";
import type {
  ReviewInsightSnapshot,
  StoredReviewInsightSnapshot,
} from "./review-insight-snapshot";

/** One period to count, keyed by the caller so several can be asked for at
 * once and lined up afterwards. */
export interface PeriodCountRequest {
  readonly key: string;
  readonly window: ReviewPeriodWindow;
}

/** A period's counts, returned against the key it was asked for. */
export interface PeriodCountResult extends PeriodCompletionCounts {
  readonly key: string;
}

/**
 * How much was overdue at one moment, returned against the key it was asked
 * for. CONVERGE-01 §8.
 */
export interface PeriodOverdueResult {
  readonly key: string;
  readonly overdue: number;
}

/** The upper bound on how many periods one series read may ask for. A trend is
 * a recent shape, not an archive: loading a decade of history to draw six bars
 * is exactly the thing this limit exists to prevent. */
export const MAX_TREND_PERIODS = 8;

/** The upper bound on the contribution breakdown, per period. */
export const MAX_CONTRIBUTION_ROWS = 100;

/** The upper bound on named carrying-over commitments. */
export const MAX_CARRY_OVER_TASKS = 50;

export interface ReviewInsightRepository {
  /**
   * Count the records COMPLETED inside each requested period, from the
   * append-only Activity stream.
   *
   * Exact for every period, past or present: `task.completed`,
   * `project.completed` and `goal.completed` events are never rewritten, so
   * this answers "what moved during that week" for a Review completed months
   * ago just as truthfully as for the current one. Distinct per record, so a
   * Task completed, reopened and completed again inside one period counts once.
   *
   * One grouped statement regardless of how many periods are requested (capped
   * at `MAX_TREND_PERIODS`); an empty request list performs no read at all.
   */
  countPeriodCompletions(
    requests: readonly PeriodCountRequest[],
  ): Promise<readonly PeriodCountResult[]>;

  /**
   * CONVERGE-01 §8 — how much was OVERDUE at the close of each requested
   * period. The backlog's history, as against completions' history.
   *
   * "Overdue at the close of a period" is the product's ONE overdue rule read at
   * a past moment rather than at today: a Task with a due date STRICTLY BEFORE
   * that period's last day (due-that-day is not overdue — the same rule the
   * `overdue` system view and the `smart` sort use) which was not yet complete
   * when the period ended (`completed_at` absent, or later than the period's
   * exclusive end instant). Cancelled and someday work is excluded, exactly as
   * `listCarryOverTasks` excludes it and for the reason recorded there: parked
   * or dropped work is not an unfinished commitment.
   *
   * It reuses `PeriodCountRequest` unchanged because it needs exactly what a
   * window already carries — `periodEnd` for the date comparison and
   * `endInstantIso` for the completion one.
   *
   * ── Two approximations, both stated on the surface ─────────────────────────
   * The schema stores no history for either field this reads, so:
   *
   *   - a Task whose DUE DATE has been changed since is measured against the
   *     date it carries now, not the one it carried then;
   *   - a Task DELETED since is absent from every reading, including readings
   *     for moments when it existed.
   *
   * They are the same class of approximation `listPeriodContributions` makes by
   * resolving ancestry through the current spine links, and the Analytics
   * surface says so in its notes rather than hiding it. Fixing either would need
   * a history table, which is a migration, which this read deliberately is not.
   *
   * One grouped statement regardless of how many moments are requested (capped
   * at `MAX_TREND_PERIODS`); an empty request list performs no read at all.
   */
  countOverdueAtPeriodEnd(
    requests: readonly PeriodCountRequest[],
  ): Promise<readonly PeriodOverdueResult[]>;

  /**
   * Break one period's completed Tasks down by the (Project, Goal, Area) they
   * roll up to TODAY, highest first.
   *
   * Ancestry is resolved from the CURRENT spine links, because the spine stores
   * no link history — a Task moved to another Project after completion is
   * attributed where it lives now. That is stated on the surface rather than
   * hidden. Titles come back with the counts so the caller needs no second
   * read. Bounded by `limit` (max `MAX_CONTRIBUTION_ROWS`); the caller learns
   * it was bounded from the row count.
   */
  listPeriodContributions(
    window: ReviewPeriodWindow,
    limit: number,
  ): Promise<readonly PeriodContributionRow[]>;

  /**
   * The commitments that were ALREADY outstanding when this period began and
   * are still open now — the honest, current-state half of carry-over.
   *
   * Two kinds, both derived without a snapshot: `overdue` (a due date before
   * `window.periodStart`, still not completed) and `waiting` (waiting since
   * before the period began). Both are exact statements about now; what a
   * snapshot adds is whether the SAME items were carrying over last time.
   *
   * Ordered deterministically (oldest commitment first, then id) and bounded by
   * `limit` (max `MAX_CARRY_OVER_TASKS`).
   */
  listCarryOverTasks(
    window: ReviewPeriodWindow,
    limit: number,
  ): Promise<readonly CarryOverTaskFact[]>;

  /**
   * Exact totals for the same two carry-over kinds, over the whole workspace
   * scope rather than the bounded list. This is what the surface displays, so a
   * bounded list of names never becomes a wrong count.
   */
  countCarryOverTasks(
    window: ReviewPeriodWindow,
  ): Promise<{ readonly overdue: number; readonly waiting: number }>;

  /** Read one Review's stored snapshot, or null when it has none (never
   * captured, or stored under a version this build does not recognise). */
  getSnapshot(reviewId: string): Promise<StoredReviewInsightSnapshot | null>;

  /**
   * The most recent stored snapshots whose period ENDS strictly before
   * `beforePeriodEnd`, newest first — how a Review finds the one before it. Ties
   * on period end break on captured instant, then review id, so the answer is
   * deterministic. Bounded by `limit`.
   */
  listSnapshotsBefore(
    beforePeriodEnd: string,
    limit: number,
  ): Promise<readonly StoredReviewInsightSnapshot[]>;

  /**
   * Write (or overwrite) one Review's snapshot. Idempotent for identical facts
   * — the same facts serialise identically — and safe to call again after a
   * reopen-and-complete, which is the only way a Review's snapshot changes.
   *
   * Refuses a Review that is not in this workspace by writing nothing and
   * returning `false`, rather than raising: a failed capture must never fail a
   * completion the owner already made.
   */
  saveSnapshot(
    reviewId: string,
    snapshot: ReviewInsightSnapshot,
  ): Promise<boolean>;
}
