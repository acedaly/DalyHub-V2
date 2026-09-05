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

/**
 * How many MOMENTS one overdue-level read may be asked about (V2.9 INS-03).
 *
 * Deliberately larger than `MAX_TREND_PERIODS`, and for a different reason.
 * The Review panel's eight is a DISPLAY bound — a trend is a recent shape.
 * This is a STORAGE bound: the overdue read is a level rather than a flow, so
 * the moments do not partition anything and each gets its own `SUM(CASE …)`
 * column over one scan. Two bound parameters per column against D1's ceiling of
 * 100 puts the real limit near 48, and 40 leaves room while covering every
 * window Insight offers except the longest daily and weekly ones — which say so
 * rather than truncating quietly.
 *
 * It could NOT be lifted the way the counting reads were: those partition their
 * window, so a bucket's boundaries can travel as JSON and be joined; a level
 * asked at N moments genuinely needs N answers from one pass over the Tasks,
 * and a JSON join would re-scan per moment instead. The column-per-moment shape
 * is the cheap one, and its ceiling is the honest cost of that.
 */
export const MAX_OVERDUE_MOMENTS = 40;

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
   * HARDEN-06C (F-07) — and it counts the record's LATER FATE out of the
   * question. Deleting a completed Task does not change what happened during
   * the week the owner completed it, so a closed Review's figures no longer
   * move when they tidy up. The adapter's own comment records how. (The
   * `overdue` reading below is a different question and says so explicitly:
   * it is the state of records that still exist.)
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
   * at `MAX_OVERDUE_MOMENTS` — a level read's storage bound, larger than the
   * Review panel's display bound); an empty request list performs no read at all.
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
   * V2.9 INS-01 — the snapshots of one Review and the `n - 1` before it, in
   * REVIEW ORDER (oldest first), as the series an across-Reviews fact is read
   * from (INS-02).
   *
   * The product has written one snapshot per completed Review since REVIEW-03
   * — roughly fifty a year, each holding up to 40 Project states, 25 Goal
   * states, 20 Area counts and 50 carry-over ids — and until V2.9 read exactly
   * one of them (`priorReviews[0]`). Every fact needed to say *"at risk in 3 of
   * the last 4 Reviews"* was already stored and unreadable. This is the read
   * that makes the series available; nothing new is captured or stored to
   * provide it.
   *
   * Semantics:
   *   - the anchor Review's own snapshot is INCLUDED when it has one, as the
   *     most recent element, so a completed Review's panel describes the period
   *     it is about rather than only the ones before it;
   *   - `n` counts snapshots, and the result is bounded by it and by
   *     `MAX_TREND_PERIODS` — a series is a recent shape, not an archive;
   *   - ONE statement whatever `n`, and flat in the number of Reviews the
   *     workspace holds;
   *   - **the same-type rule holds**: a weekly Review's series contains only
   *     weekly Reviews, so a monthly Review never dilutes a weekly trend with a
   *     period four times its length;
   *   - **an OVERLAPPING Review is not "before" this one**: everything but the
   *     anchor must end strictly before the anchor's period START, which is the
   *     same rule the comparison series applies. Overlapping periods are
   *     permitted by the product, so comparing against the anchor's END would
   *     admit a Review covering some of the same days and report two
   *     overlapping Reviews as consecutive history;
   *   - a missing snapshot SHORTENS the series rather than leaving a hole. A
   *     Review whose snapshot was never captured is simply absent, and the
   *     surface says "over the last N Reviews" with the N it actually has
   *     (ADR-079 decision 5 — never invent a state);
   *   - workspace-scoped, and an anchor from another workspace yields an empty
   *     series rather than disclosing anything.
   */
  listSnapshotSeries(
    reviewId: string,
    n: number,
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
