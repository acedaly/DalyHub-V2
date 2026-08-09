/**
 * GOAL-02 — the compact Goal progress readout.
 *
 * One small block that states where a measurable Goal stands: the current value
 * against its target, a bar, the percentage and what remains, and the status in
 * words. It is what Today's Goal Progress rows are built from and what the Goal
 * record's hero reuses at a larger size, so the two surfaces cannot drift into
 * describing the same Goal differently.
 *
 * It renders a number the caller ALREADY has. It computes nothing — the same
 * deliberate limit `ProgressMeter` sets — so there is exactly one implementation
 * of Goal progress arithmetic and it is in the kernel.
 *
 * Accessibility: the bar is the shared `ProgressTrack`, so it carries
 * `role="progressbar"` with the SAME sentence that is printed beside it; nothing
 * here is conveyed by colour alone, and a Goal with no readings renders a
 * designed absence rather than an empty 0% bar claiming a denominator it has not
 * got.
 */

import type { GoalProgressEvaluation } from "~/kernel/goals";
import { StatusPill } from "~/shared/pill";
import { ProgressTrack } from "~/shared/progress";

import {
  formatMeasurementValue,
  goalCurrentAgainstTarget,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
} from "./goal-progress-view";

export interface GoalProgressReadoutProps {
  readonly progress: GoalProgressEvaluation;
  /** Names the bar for assistive tech, e.g. "Reach 70 kg progress". */
  readonly label: string;
  /**
   * The density ladder, and it is a ladder of WHAT IS SAID as well as of size:
   *
   * - `glance` — Today. Value, target, one visualisation, one state word. It
   *   deliberately drops the remaining-to-target figure and the status PILL,
   *   because a glance surface answers "how is this going?" and a chip announcing
   *   a state the word beside it already states is the metadata the convergence
   *   brief asks Today's Goal cards to stop carrying.
   * - `compact` — a gallery card, where the extra fact helps choose between
   *   Goals.
   * - `hero` — the Goal record, where the current value is the page's biggest
   *   number and every fact belongs.
   */
  readonly size?: "glance" | "compact" | "hero";
  /** A trailing fact the surface wants on the fact line ("↓ 0.3 kg this week"). */
  readonly trailing?: string | null;
  readonly className?: string;
}

export function GoalProgressReadout({
  progress,
  label,
  size = "compact",
  trailing = null,
  className,
}: GoalProgressReadoutProps) {
  const summary = goalProgressSummaryText(progress);
  const against = goalCurrentAgainstTarget(progress);
  const statusLabel = goalProgressStatusLabel(progress.status);
  const glance = size === "glance";
  const facts: string[] = [];
  if (progress.progressPercent !== null) {
    facts.push(`${progress.progressPercent}%`);
  }
  if (progress.achieved) {
    facts.push("Target reached");
  } else if (!glance && progress.remaining !== null && progress.remaining > 0) {
    facts.push(
      `${formatMeasurementValue(progress.remaining, progress.unit)} remaining`,
    );
  }
  if (trailing) facts.push(trailing);

  return (
    <div
      className={className ? `dh-goalprogress ${className}` : "dh-goalprogress"}
      data-size={size}
    >
      <p className="dh-goalprogress__value">
        {/* The current value is the headline. A Goal with nothing recorded says
            so instead of printing a zero it never measured. */}
        <span className="dh-goalprogress__current">
          {progress.current === null
            ? "No measurement yet"
            : progress.type === "milestone"
              ? `${progress.current} of ${progress.target ?? 0}`
              : formatMeasurementValue(progress.current, progress.unit)}
        </span>
        {against &&
        progress.type !== "milestone" &&
        progress.current !== null ? (
          <span className="dh-goalprogress__target">
            Target {formatMeasurementValue(progress.target, progress.unit)}
          </span>
        ) : null}
      </p>
      {progress.progressPercent !== null ? (
        <ProgressTrack
          className="dh-goalprogress__track"
          label={label}
          percent={progress.progressPercent}
          valueText={summary}
          complete={progress.achieved}
        />
      ) : null}
      <p className="dh-goalprogress__facts">
        {facts.length > 0 ? (
          <span className="dh-goalprogress__fact-list">
            {facts.join(" · ")}
          </span>
        ) : null}
        {/* At a glance the state is a WORD in its own tone, not a filled chip:
            a green pill beside a violet bar on four cards at once is most of a
            screen's colour spent on metadata. The tone is never the only
            signal — the word is the signal, and the tone agrees with it. */}
        {glance ? (
          <span
            className="dh-goalprogress__state"
            data-tone={goalProgressStatusTone(progress.status)}
          >
            {statusLabel}
          </span>
        ) : (
          <StatusPill tone={goalProgressStatusTone(progress.status)}>
            {statusLabel}
          </StatusPill>
        )}
      </p>
    </div>
  );
}
