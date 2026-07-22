/**
 * PROJ-02 Project Health — the restrained inline health indicator.
 *
 * ONE shared presentation used by the Projects collection Card, Today's "Continue
 * working" card and (compact) the project record header. It renders a calm toned
 * pill (state label) optionally followed by the primary reason as plain text, so
 * meaning is NEVER carried by colour alone (the label and reason are always present)
 * and a screen reader hears the state and why. It does not create a second card — it
 * is a small element dropped into the existing Card metadata / Record summary slots.
 */

import type { ProjectHealth } from "~/kernel/project-health";

import { healthReasonText } from "./health-view";

interface HealthIndicatorProps {
  readonly health: ProjectHealth;
  /** Show the primary reason after the pill (collection cards / summary). */
  readonly showReason?: boolean;
  /** An accessible label override for the whole indicator. */
  readonly ariaLabel?: string;
}

export function HealthIndicator({
  health,
  showReason = false,
  ariaLabel,
}: HealthIndicatorProps) {
  const primary = health.reasons[0];
  const reasonText = primary ? healthReasonText(primary) : null;
  const showReasonText =
    showReason && reasonText !== null && reasonText !== health.label;

  return (
    <span
      className="dh-health"
      aria-label={ariaLabel}
      role={ariaLabel ? "text" : undefined}
    >
      <span className="dh-health__pill" data-tone={health.tone}>
        <span className="dh-health__dot" aria-hidden="true" />
        {health.label}
      </span>
      {showReasonText ? (
        <span className="dh-health__reason">{reasonText}</span>
      ) : null}
    </span>
  );
}
