/**
 * THEME-01 — the shared progress meter.
 *
 * One visual for every derived completion percentage in DalyHub (Goals, Projects,
 * Today). See `ProgressMeter.tsx` for what it deliberately does not do.
 */

export { ProgressMeter, type ProgressMeterProps } from "./ProgressMeter";
export {
  ProgressTrack,
  normaliseProgressPercent,
  type ProgressTrackProps,
} from "./ProgressTrack";
/**
 * UNTITLED-17 — the shared proportion LIST, over the same Untitled bar.
 *
 * Reports' `CategoryBars` and Analytics' `dh-analytics__split` were one shape
 * drawn two bespoke ways. Its own header says why it lives here rather than in
 * `~/shared/charts`: it has no axis and no plot area, and is a run of progress
 * indicators with a shared denominator.
 */
export {
  CategorySplit,
  type CategorySplitProps,
  type CategorySplitRow,
} from "./CategorySplit";
export {
  METER_STATUSES,
  meterStatusAttribute,
  meterStatusFromTone,
  type MeterStatus,
} from "./meter-status";
