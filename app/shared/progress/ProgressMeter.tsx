/**
 * THEME-01 — the one shared progress meter.
 *
 * DalyHub already DERIVED completion percentages for Goals, Projects and Today; it
 * only ever stated them as a sentence. This is the shared visual for that same
 * number — one component, so a progress bar looks and behaves identically wherever
 * it appears, and so there is exactly one place to get the accessibility right.
 *
 * Deliberate limits (this is polish, not an analytics platform):
 *   - it renders a number the caller ALREADY has. It computes nothing, stores
 *     nothing and never interpolates a trend;
 *   - `available: false` is a real, designed state ("No tasks yet"), not 0%. A
 *     project with no tasks is not a project that is 0% done, and showing an empty
 *     bar for it would be a lie;
 *   - there is no animation on the fill beyond the shared duration token, and none
 *     at all under reduced motion.
 *
 * Accessibility:
 *   - the bar is a `role="progressbar"` with `aria-valuenow/min/max` and an
 *     accessible name, so assistive tech reads the value, not the pixels;
 *   - the same value is ALWAYS present as visible text, so the meaning never
 *     depends on seeing the bar (AGENTS.md §15);
 *   - the fill uses `--app-color-progress-fill` against `--app-color-progress-track`,
 *     a pair the contrast test holds at 3:1 in every theme, and switches to
 *     `--app-color-progress-complete` at 100% so "done" is not signalled by length
 *     alone.
 */

import { useId } from "react";

import { AbsenceText } from "~/shared/pill";

export interface ProgressMeterProps {
  /**
   * The label naming what is progressing (e.g. "Roll-up progress"). Always
   * rendered as visible text and used as the bar's accessible name.
   */
  readonly label: string;
  /** Completion percentage, 0–100. Ignored when `available` is false. */
  readonly percent: number;
  /**
   * The text equivalent shown beside the bar (e.g. "3 of 8 complete"). This is the
   * authoritative statement of progress; the bar illustrates it.
   */
  readonly summary: string;
  /**
   * False when there is nothing to measure yet. The bar is replaced by the
   * summary text alone — an empty bar would claim 0% of something real.
   */
  readonly available?: boolean;
}

/** Clamp to 0–100 and round, so a bad caller can never overflow the track. */
function normalisePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

export function ProgressMeter({
  label,
  percent,
  summary,
  available = true,
}: ProgressMeterProps) {
  const labelId = useId();
  const value = normalisePercent(percent);
  const complete = available && value >= 100;

  return (
    <div className="dh-progress" data-available={available ? "true" : "false"}>
      <p className="dh-progress__header">
        <span className="dh-progress__label" id={labelId}>
          {label}
        </span>
        {/*
         * DS-14 §8 — when there is nothing to measure, the summary IS the
         * absence state, so it is a designed rendering rather than a sentence
         * that happens to say "no".
         *
         * M3-INT — that rendering is now `AbsenceText`, not a neutral chip. The
         * wording is unchanged and still comes from the caller ("No Projects
         * contributing yet", "No progress metric", "No tasks yet"), because the
         * surface knows what is absent and the design system only knows how
         * absence should look; what changed is that "nothing here yet" stopped
         * arriving in the same 32px container the product spends on a real
         * lifecycle status.
         */}
        {available ? (
          <span className="dh-progress__summary">{summary}</span>
        ) : (
          <AbsenceText>{summary}</AbsenceText>
        )}
      </p>
      {available ? (
        <div
          className="dh-progress__track"
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${value}% — ${summary}`}
          data-complete={complete ? "true" : undefined}
        >
          <div
            className="dh-progress__fill"
            style={{ inlineSize: `${value}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
