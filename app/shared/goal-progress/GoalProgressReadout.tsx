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
 *
 * ── UNTITLED-07 — the paint, and the badge ─────────────────────────────────
 *
 * `goals.css`'s `.dh-goalprogress*` block drew every rung of this readout's
 * type and every tone of its state word. It is drawn here now, in Untitled's
 * token roles, and the classes survive as hooks with no rules attached. The
 * status chip is the genuine `base/badges` source through the shared
 * `UntitledStatusBadge`, which is the same badge the Goals workspace, the Area
 * record and every migrated collection already draw — `StatusPill` was the
 * legacy chip and drawing it here kept Today's Goal rows on a different badge
 * from the Goal record they open.
 */

import type { GoalProgressEvaluation } from "~/kernel/goals";
import { UntitledStatusBadge } from "~/shared/pill";
import { ProgressTrack } from "~/shared/progress";

import {
  formatMeasurementValue,
  goalProgressStatusLabel,
  goalProgressMeterStatus,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalTargetLabel,
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

/**
 * The glance surface's state word, in tone.
 *
 * `accent` and `info` both take the brand's secondary text role: one is the
 * product's own accent state and the other is "noteworthy", and neither is a
 * judgement the way success, warning and danger are.
 */
const GLANCE_TONE: Record<string, string> = {
  neutral: "text-tertiary",
  accent: "text-brand-secondary",
  info: "text-brand-secondary",
  success: "text-success-primary",
  warning: "text-warning-primary",
  danger: "text-error-primary",
};

export function GoalProgressReadout({
  progress,
  label,
  size = "compact",
  trailing = null,
  className,
}: GoalProgressReadoutProps) {
  const summary = goalProgressSummaryText(progress);
  const targetLabel = goalTargetLabel(progress);
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
      className={["dh-goalprogress flex min-w-0 flex-col gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
      data-size={size}
    >
      <p className="dh-goalprogress__value m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* The current value is the headline. A Goal with nothing recorded says
            so instead of printing a zero it never measured. */}
        <span
          className={[
            "dh-goalprogress__current font-semibold text-primary tabular-nums",
            // The density ladder in type: a glance surface states the reading
            // at the size of the row it sits in; the record makes it the
            // section's figure.
            size === "hero" ? "text-display-xs" : "text-md",
          ].join(" ")}
        >
          {progress.current === null
            ? "No measurement yet"
            : progress.type === "milestone"
              ? `${progress.current} of ${progress.target ?? 0}`
              : formatMeasurementValue(progress.current, progress.unit)}
        </span>
        {/*
          UIX-03 — the TARGET label comes from the shared vocabulary, which
          returns `null` for a manual Goal.
          
          This used to be gated on `goalCurrentAgainstTarget` being non-null and
          then printed the raw target, so a manual Goal — whose reading IS a
          percentage and whose stored target is the number 100 — rendered
          "35% / Target 100%". Nobody set a target of 100%; it is the scale.
        */}
        {targetLabel && progress.current !== null ? (
          <span className="dh-goalprogress__target text-sm text-tertiary tabular-nums">
            {targetLabel}
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
          // POLISH-01 — the bar and the state word beneath it read one ramp.
          status={goalProgressMeterStatus(progress.status)}
        />
      ) : null}
      <p className="dh-goalprogress__facts m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {facts.length > 0 ? (
          <span className="dh-goalprogress__fact-list text-sm text-tertiary">
            {facts.join(" · ")}
          </span>
        ) : null}
        {/* At a glance the state is a WORD in its own tone, not a filled chip:
            a green pill beside a violet bar on four cards at once is most of a
            screen's colour spent on metadata. The tone is never the only
            signal — the word is the signal, and the tone agrees with it. */}
        {glance ? (
          /*
           * At a glance the state is a WORD in its own tone, not a filled chip:
           * a green pill beside a violet bar on four cards at once is most of a
           * screen's colour spent on metadata. The tone is never the only
           * signal — the word is the signal, and the tone agrees with it.
           *
           * The four tone classes are written out rather than composed, because
           * Tailwind scans source text for class names and a template literal
           * would leave all four unbuilt.
           */
          <span
            className={[
              "dh-goalprogress__state text-sm font-medium",
              GLANCE_TONE[goalProgressStatusTone(progress.status)],
            ].join(" ")}
            data-tone={goalProgressStatusTone(progress.status)}
          >
            {statusLabel}
          </span>
        ) : (
          <UntitledStatusBadge tone={goalProgressStatusTone(progress.status)}>
            {statusLabel}
          </UntitledStatusBadge>
        )}
      </p>
    </div>
  );
}
