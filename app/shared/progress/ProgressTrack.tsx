/**
 * The shared LINEAR PROGRESS track — the bar on its own.
 *
 * `ProgressMeter` packages a bar with its own label/summary header, which is
 * right inside a summary panel and wrong inside a dense row: a Today project row
 * already states "3 open · At risk", and adding a second header above the bar
 * would say the same thing twice in a 44px row.
 *
 * So the bar itself is its own primitive and `ProgressMeter` composes it. There
 * is still exactly ONE implementation of a linear progress indicator in DalyHub —
 * one set of tokens, one set of ARIA attributes, one reduced-motion rule — with
 * two levels of packaging over it.
 *
 * Accessibility. The bar carries `role="progressbar"` with its value, and the
 * caller MUST pass `valueText`: the text equivalent that already appears in the
 * row. That is what keeps the rule "the meaning never depends on seeing the bar"
 * true for the bare form as well as the packaged one (AGENTS.md §15).
 */

export interface ProgressTrackProps {
  /** The bar's accessible name (e.g. "Kitchen renovation progress"). */
  readonly label: string;
  /** Completion percentage, 0–100. */
  readonly percent: number;
  /**
   * The authoritative statement of the same value in words, as it appears
   * elsewhere in the surrounding row ("3 of 6 tasks"). Announced, not drawn.
   */
  readonly valueText: string;
  /** Marks the "finished" paint; complete is signalled by text as well. */
  readonly complete?: boolean;
  readonly className?: string;
  /** Set when the value is stated by an element the caller already renders. */
  readonly id?: string;
}

/** Clamp to 0–100 and round, so a bad caller can never overflow the track. */
export function normaliseProgressPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

export function ProgressTrack({
  label,
  percent,
  valueText,
  complete,
  className,
  id,
}: ProgressTrackProps) {
  const value = normaliseProgressPercent(percent);
  const isComplete = complete ?? value >= 100;
  return (
    <div
      id={id}
      className={
        className ? `dh-progress__track ${className}` : "dh-progress__track"
      }
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${value}% — ${valueText}`}
      data-complete={isComplete ? "true" : undefined}
    >
      <div className="dh-progress__fill" style={{ inlineSize: `${value}%` }} />
    </div>
  );
}
