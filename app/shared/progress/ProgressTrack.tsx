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
 * ── UNTITLED-07 — and now that ONE implementation is Untitled's ─────────────
 *
 * It was not, and the claim above was the thing to check. `ProjectCard`, the
 * Areas gallery and `RecordSummaryBar` drew Untitled's `ProgressBarBase`
 * geometry through `LabelledProgressBar`; this drew a `div` painted by
 * `progress.css` at a DIFFERENT height, a different radius token and a
 * different track colour; and `ProgressRow` drew a third. A Goal record and the
 * Project card beneath it were two progress bars from two systems, which is
 * exactly the "looks vaguely like Untitled while remaining bespoke underneath"
 * the Goals migration brief names.
 *
 * This is now a thin DalyHub ADAPTER over the genuine Untitled bar. What it
 * still owns is the part Untitled has no opinion about:
 *
 *   - the caller's MeterStatus → Untitled tone mapping, so DalyHub's five-value
 *     meter ramp (`meter-status.ts`) reaches the bar without a second ramp;
 *   - `complete`, which outranks the status because a finished measure is the
 *     one thing a bar may announce on its own;
 *   - `data-meter-status` / `data-complete`, the machine facts the E2E suite
 *     reads instead of comparing colours.
 *
 * `progress.css`'s track, fill, ramp, reduced-motion and forced-colours rules
 * are deleted by this change: the component draws all five now, so a legacy
 * stylesheet can no longer repaint an Untitled control.
 *
 * Accessibility. The bar carries `role="progressbar"` with its value, and the
 * caller MUST pass `valueText`: the text equivalent that already appears in the
 * row. That is what keeps the rule "the meaning never depends on seeing the bar"
 * true for the bare form as well as the packaged one (AGENTS.md §15).
 */

import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";

import { type MeterStatus } from "./meter-status";

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
  /**
   * POLISH-01 — how the thing being measured is GOING. Defaults to `neutral`,
   * which is the honest answer for a bar that measures volume rather than
   * health ("12 of 40 captured") and the one this primitive will not guess past.
   */
  readonly status?: MeterStatus;
  readonly className?: string;
  /** Set when the value is stated by an element the caller already renders. */
  readonly id?: string;
}

/**
 * DalyHub's meter ramp, onto Untitled's fill tones.
 *
 * `info` reaches `notable` (the brand's SECONDARY foreground) rather than the
 * brand primary `neutral` takes, so "noteworthy" and "no judgement" are still
 * two different bars — which is the whole reason `info` exists in the ramp.
 */
const TONE: Record<
  MeterStatus,
  "neutral" | "notable" | "positive" | "caution" | "critical"
> = {
  neutral: "neutral",
  success: "positive",
  info: "notable",
  warning: "caution",
  danger: "critical",
};

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
  status,
  className,
  id,
}: ProgressTrackProps) {
  const value = normaliseProgressPercent(percent);
  const isComplete = complete ?? value >= 100;

  return (
    <LabelledProgressBar
      id={id}
      label={label}
      value={value}
      valueText={valueText}
      // Completion outranks the derived status: a Goal that has reached its
      // target is not "on track", it is done, and the bar is allowed to say so.
      tone={isComplete ? "positive" : TONE[status ?? "neutral"]}
      className={
        className ? `dh-progress__track ${className}` : "dh-progress__track"
      }
      data-complete={isComplete ? "true" : undefined}
      data-meter-status={status && status !== "neutral" ? status : undefined}
    />
  );
}
