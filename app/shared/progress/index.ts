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
/**
 * UIX-03 — the card-sized trend, moved here from `~/shared/charts`.
 *
 * It belongs beside `CategorySplit` for the same reason that one does: no axis,
 * no plot area, no charting runtime — an inline SVG a card can afford. It left
 * the charts barrel because everything in that barrel stands on Recharts, so
 * importing this 2.3 KB drawing from there cost `/today` the whole 394.9 KB
 * charting chunk. See that barrel's header for the measurement.
 */
export {
  Sparkline,
  type SparklineProps,
  type SparklinePoint,
} from "./Sparkline";
export {
  METER_STATUSES,
  meterStatusAttribute,
  meterStatusFromTone,
  type MeterStatus,
} from "./meter-status";
