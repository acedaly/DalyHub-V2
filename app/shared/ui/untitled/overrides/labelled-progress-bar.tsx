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
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

export interface LabelledProgressBarProps {
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
  readonly tone?: "neutral" | "positive" | "caution" | "critical";
  readonly className?: string;
}

const TONE_FILL: Record<
  NonNullable<LabelledProgressBarProps["tone"]>,
  string
> = {
  neutral: "bg-fg-brand-primary",
  positive: "bg-fg-success-secondary",
  caution: "bg-fg-warning-secondary",
  critical: "bg-fg-error-secondary",
};

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function LabelledProgressBar({
  label,
  value,
  valueText,
  showValue = false,
  valueLabel,
  tone = "neutral",
  className,
}: LabelledProgressBarProps) {
  const percentage = clampProgress(value);

  const bar = (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percentage}% — ${valueText}`}
      className={cx(
        "h-2 w-full overflow-hidden rounded-md bg-quaternary",
        !showValue && className,
      )}
    >
      <div
        // Upstream uses a transform rather than a width to avoid layout
        // thrashing and to animate smoothly.
        style={{ transform: `translateX(-${100 - percentage}%)` }}
        className={cx(
          "size-full rounded-md transition duration-75 ease-linear",
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
