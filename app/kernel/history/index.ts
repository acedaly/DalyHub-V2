/**
 * V2.9 INS-01 — the HISTORY kernel: one vocabulary for "over time".
 *
 * DalyHub already remembers what happened; this slice is how the product says
 * so. It holds four ideas and nothing else — a **window**, a **grain**, the
 * **buckets** a window cuts into at that grain, and a **series** of points over
 * those buckets carrying its bound — and every surface that asks *"what
 * happened over this period?"* asks it in these terms (ADR-116 decision 2).
 *
 * ── Pure, by construction ───────────────────────────────────────────────────
 * Nothing here touches D1 or JSX. Owner-local midnights arrive as a resolver
 * argument, exactly as `buildActivityWindow` takes one, so every rule is
 * testable without a timezone, a browser or a wall clock. The READS live on the
 * repository contracts they belong to — `TaskRepository.countCompletedInBuckets`,
 * `ActivityRepository.countByTypeInBuckets` and `listInWindow`,
 * `ReviewInsightRepository.listSnapshotSeries`,
 * `GoalMeasurementRepository.listMeasurementSeries` — because a history read is
 * a read of a store, and putting it here would give this slice a second
 * identity as a repository.
 *
 * ── Nothing is stored ───────────────────────────────────────────────────────
 * No aggregate table, no cache, no second snapshot. Every figure is
 * exactly reconstructible from the stores the product already writes, and a
 * bounded read that would need new storage is a finding under ADR-110 decision
 * 7 rather than a licence to add one.
 *
 * ── The window is the existing one ──────────────────────────────────────────
 * `Window` is `ActivityWindow` (FOLLOW-01), re-exported and NOT duplicated:
 * inclusive owner wall-calendar days, half-open UTC instants, owner timezone
 * authoritative. Three surfaces already share it; V2.9 adds consumers rather
 * than a fourth idea of "the period".
 */

export {
  buildActivityWindow,
  activityWindowPhase,
  isInActivityWindow,
  type ActivityWindow,
  type ActivityWindow as Window,
  type ActivityWindowPhase,
} from "~/kernel/activity-window";

export {
  bucketPeriods,
  bucketWindow,
  GRAIN_MAXIMUMS,
  HISTORY_GRAINS,
  isGrain,
  requestedBucketCount,
  type Grain,
  type HistoryBoundReason,
  type HistoryBucket,
  type HistoryBuckets,
  type OwnerDayStart,
} from "./history-grain";

export {
  buildSeries,
  mapSeries,
  sumSeries,
  unavailableSeries,
  type Series,
  type SeriesPoint,
} from "./history-series";
