/**
 * GOAL-02 Goals kernel — the measurement + milestone repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `goal-details-repository.ts`. Every write verifies the target is an ACTIVE Goal
 * in the bound workspace (missing, deleted, wrong-kind and cross-workspace ids
 * all fail closed with {@link GoalMeasurementNotFoundError}, never distinguished)
 * and is atomic with its Activity append.
 *
 * ── Why the reads are split three ways ──────────────────────────────────────
 * The performance rule for this feature is that Today must never pay for history
 * it does not draw (AGENTS.md §16). So the contract offers exactly three shapes,
 * and each surface takes the smallest one that answers its question:
 *
 *   `listMeasurementSummaries(ids, …)`  a page of Goals → current value, first
 *                                       value, the comparison point for "this
 *                                       week" and a count. ONE grouped query for
 *                                       the whole page — never one per Goal.
 *   `listRecentMeasurements(id, limit)` one Goal's chart and history list.
 *   `listMeasurements(id)`              the complete series, for the record page's
 *                                       own arithmetic.
 *
 * There is deliberately no "get the current value" method: the current value is
 * the latest row of the summary, and a second way to ask would be a second place
 * for the answer to drift.
 */

import type {
  GoalMeasurement,
  GoalMeasurementPoint,
  GoalMeasurementSummary,
  GoalMilestone,
  GoalMilestoneSummary,
  NewGoalMeasurementInput,
  NewGoalMilestoneInput,
  UpdateGoalMeasurementInput,
  UpdateGoalMilestoneInput,
} from "./goal-measurement";

/** Options for the batched summary read. */
export type GoalMeasurementSummaryInput = {
  /**
   * The owner-calendar date that separates "recent" from "before". The summary's
   * `priorInWindow` is the latest reading strictly BEFORE this date, which is
   * what makes "↓ 0.3 kg this week" a comparison against a real earlier reading
   * rather than against the second-newest row whenever that happens to be.
   */
  readonly comparisonFromIso: string;
};

/** Options for the batched sparkline-series read. */
export type GoalMeasurementSeriesInput = {
  /**
   * The most readings any ONE Goal contributes, newest kept. A card-sized
   * sparkline resolves nothing beyond a couple of dozen points at 100px wide,
   * so this is a display bound as much as a query bound.
   */
  readonly perGoalLimit: number;
};

export interface GoalMeasurementRepository {
  /* ---- measurements: read ------------------------------------------------ */

  /** The complete, chronologically ascending series for one Goal. Bounded by
   * `limit` (the repository applies a hard maximum regardless). */
  listMeasurements(
    goalId: string,
    limit?: number,
  ): Promise<readonly GoalMeasurement[]>;

  /**
   * The batched per-Goal summary for a bounded page of Goal ids — a fixed, small
   * number of grouped queries, never one per Goal (mirrors
   * `GoalRepository.listGoalProjectContributions`). EVERY requested id appears,
   * with the all-null summary when the Goal has recorded nothing — so a caller
   * renders the honest "no progress logged yet" state rather than treating a
   * missing key as an error.
   */
  listMeasurementSummaries(
    goalIds: readonly string[],
    input: GoalMeasurementSummaryInput,
  ): Promise<Map<string, GoalMeasurementSummary>>;

  /**
   * UIX-03 — the batched SPARKLINE series: each Goal's most recent readings,
   * chronologically ascending, capped per Goal.
   *
   * The summary above carries three readings chosen for arithmetic (first,
   * comparison, latest), which is the right shape for a percentage and the
   * wrong one for a SHAPE: three points drawn as a line assert a smooth path
   * through a history that may have wandered. A card-sized trend needs the
   * recent run of readings, and it needs them for a page of Goals at once.
   *
   * Bounded twice over, so this cannot become the "load everything" read the
   * summary exists to avoid: the caller's page of ids, and a hard per-Goal cap
   * applied inside the window function rather than in JavaScript — a Goal with a
   * year of daily weigh-ins contributes `perGoalLimit` rows to the result, not
   * 365. Still a fixed, small number of statements; never one per Goal.
   *
   * A Goal with fewer than two readings may be absent, or present with one
   * point: the caller draws no sparkline either way, and asking it to tell the
   * difference would be a distinction with no consequence.
   */
  listMeasurementSeries(
    goalIds: readonly string[],
    input: GoalMeasurementSeriesInput,
  ): Promise<Map<string, readonly GoalMeasurementPoint[]>>;

  /* ---- measurements: write ----------------------------------------------- */

  /**
   * Record a measurement. Atomic with `goal.measurement_logged` — and with
   * `goal.target_reached` when this reading is the one that first reaches the
   * Goal's configured target.
   */
  createMeasurement(
    goalId: string,
    input: NewGoalMeasurementInput,
  ): Promise<GoalMeasurement>;

  /**
   * Correct an existing measurement. A patch that changes nothing is an
   * idempotent no-op: no write, no Activity. A real change appends
   * `goal.measurement_corrected`.
   */
  updateMeasurement(
    measurementId: string,
    patch: UpdateGoalMeasurementInput,
  ): Promise<GoalMeasurement>;

  /** Remove a measurement, atomic with `goal.measurement_removed`. */
  deleteMeasurement(measurementId: string): Promise<void>;

  /* ---- milestones -------------------------------------------------------- */

  listMilestones(goalId: string): Promise<readonly GoalMilestone[]>;

  /** The batched completed/total weight for a page of Goal ids. */
  listMilestoneSummaries(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalMilestoneSummary>>;

  createMilestone(
    goalId: string,
    input: NewGoalMilestoneInput,
  ): Promise<GoalMilestone>;

  /**
   * Update a stage. Completing one appends `goal.milestone_completed` and
   * reopening one appends `goal.milestone_reopened`; renaming or reweighting a
   * stage appends nothing, because editing the DEFINITION of a measurement is
   * configuration rather than progress, and an Activity feed full of "renamed a
   * milestone" is the flooding this feature is explicitly told to avoid.
   */
  updateMilestone(
    milestoneId: string,
    patch: UpdateGoalMilestoneInput,
  ): Promise<GoalMilestone>;

  deleteMilestone(milestoneId: string): Promise<void>;
}
