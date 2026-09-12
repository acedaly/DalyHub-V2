/**
 * UNTITLED-04 — Untitled's `ProgressBar`, with the accessible name DalyHub
 * requires.
 *
 * This is a DalyHub OVERRIDE, not vendored source: `scripts/vendor-untitled.mjs`
 * never writes into this directory. It exists because the upstream
 * `base/progress-indicators` pair is so nearly right, and wrong in exactly one
 * respect for this product.
 *
 * Upstream `ProgressBarBase` renders the `role="progressbar"` element itself and
 * accepts only `value`, `min`, `max`, `className` and `progressClassName`. It
 * therefore has no accessible NAME and no `aria-valuetext`, which is fine for a
 * bar captioned by adjacent prose in a marketing page and is not fine here:
 * AGENTS.md §15 requires that the meaning of a measure never depends on seeing
 * it, and DalyHub's own rule is that a progress bar always announces the same
 * sentence the surface states in words ("63% — 5 of 8 tasks complete"). Wrapping
 * the upstream component in a labelled container would nest a named group around
 * an unnamed progressbar; passing the name down is not possible without either
 * this file or an edit to the regenerated vendored file.
 *
 * So: the GEOMETRY, the token classes and the transform-not-width technique are
 * upstream's, copied from `base/progress-indicators/progress-indicators.tsx`
 * (`ProgressBarBase` and `ProgressBar`'s `labelPosition="right"` arm). The
 * additions are `aria-label`, `aria-valuetext` and an optional status attribute
 * so a bar can say how the thing it measures is going.
 *
 * ── UNTITLED-07 — what the Goals pass added, and why ────────────────────────
 * This became the product's ONE linear progress indicator in that pass: the
 * shared `ProgressTrack` (Today, Habits, the Goal record, `ProgressMeter`) and
 * the shared `ProgressRow` (the Goals workspace, the Area record's Goals tab,
 * the Projects page's Goals section) were a second and a third hand-written
 * track painted from `progress.css` and `card-family.css`, in a different
 * geometry from the bar `ProjectCard` and `RecordSummaryBar` already drew.
 * Three additions carry those callers, and each is a capability the legacy
 * tracks genuinely had rather than a new idea:
 *
 *   - `info`, so the five-value DalyHub meter ramp (`~/shared/progress/meter-status`)
 *     maps onto a tone without a sixth colour system;
 *   - `id`, because `RecordSummaryBar` names its bar with an element it already
 *     renders;
 *   - `data-*` pass-through, so `data-meter-status` and `data-complete` survive
 *     as the machine facts the E2E suite asserts on.
 *
 * Forced colours are handled HERE rather than in a stylesheet, because a
 * migrated component must not borrow a legacy class that still has rules
 * attached to it: `bg-quaternary` and the tone fills are both dropped in forced
 * colours, so the track takes a `CanvasText` outline and the fill takes
 * `Highlight` through Tailwind's own `forced-colors:` variant.
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

export interface LabelledProgressBarProps {
  /** Names the bar from an element the surface already renders. */
  readonly id?: string;
  /** The bar's accessible name — "Kitchen renovation progress". */
  readonly label: string;
  /** Completion percentage, 0–100. */
  readonly value: number;
  /**
   * The same value in words, as the surrounding surface already states it
   * ("5 of 8 tasks complete"). Announced with the percentage, never drawn twice.
   */
  readonly valueText: string;
  /** Draw the figure at the bar's trailing edge (upstream `labelPosition="right"`). */
  readonly showValue?: boolean;
  /** Replaces the default `NN%` figure when the surface words it differently. */
  readonly valueLabel?: ReactNode;
  /** Tints the fill for a measure that is going badly. Text always says so too. */
  readonly tone?: "neutral" | "positive" | "notable" | "caution" | "critical";
  readonly className?: string;
  /**
   * The machine facts the surrounding surface and the E2E suite read.
   *
   * Named one by one rather than spread from an index signature: an index
   * signature over `data-*` would have to admit every other prop on this
   * interface too, and a wide `...rest` would let a caller re-declare the ARIA
   * the whole override exists to add.
   */
  readonly "data-meter-status"?: string;
  readonly "data-complete"?: string;
  readonly "data-testid"?: string;
}

const TONE_FILL: Record<
  NonNullable<LabelledProgressBarProps["tone"]>,
  string
> = {
  neutral: "bg-fg-brand-primary",
  positive: "bg-fg-success-secondary",
  notable: "bg-fg-brand-secondary",
  caution: "bg-fg-warning-secondary",
  critical: "bg-fg-error-secondary",
};

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function LabelledProgressBar({
  id,
  label,
  value,
  valueText,
  showValue = false,
  valueLabel,
  tone = "neutral",
  className,
  "data-meter-status": meterStatus,
  "data-complete": complete,
  "data-testid": testId,
}: LabelledProgressBarProps) {
  const percentage = clampProgress(value);

  const bar = (
    <div
      data-meter-status={meterStatus}
      data-complete={complete}
      data-testid={testId}
      id={id}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percentage}% — ${valueText}`}
      className={cx(
        "h-2 w-full overflow-hidden rounded-md bg-quaternary",
        "forced-colors:outline forced-colors:outline-[CanvasText]",
        !showValue && className,
      )}
    >
      <div
        // Upstream uses a transform rather than a width to avoid layout
        // thrashing and to animate smoothly.
        style={{ transform: `translateX(-${100 - percentage}%)` }}
        className={cx(
          "size-full rounded-md transition duration-75 ease-linear",
          "motion-reduce:transition-none forced-colors:bg-[Highlight]",
          TONE_FILL[tone],
        )}
      />
    </div>
  );

  if (!showValue) return bar;

  return (
    <div className={cx("flex items-center gap-3", className)}>
      {bar}
      <span className="shrink-0 text-sm font-medium text-secondary tabular-nums">
        {valueLabel ?? `${percentage}%`}
      </span>
    </div>
  );
}
