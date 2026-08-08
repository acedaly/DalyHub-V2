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
