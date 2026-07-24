/**
 * AREA-03 Alignment — the restrained inline alignment indicator (ADR-040).
 *
 * Mirrors `HealthIndicator` exactly: a calm toned pill (state label)
 * optionally followed by the primary reason as plain text, so meaning is
 * NEVER carried by colour alone. It does not create a second Card — it is a
 * small element dropped into the existing Card metadata / Record summary
 * slots.
 */

import type { GoalAlignment } from "~/kernel/alignment";

import { alignmentReasonText } from "./alignment-view";

interface AlignmentIndicatorProps {
  readonly alignment: GoalAlignment;
  /** Show the primary reason after the pill (collection cards / summary). */
  readonly showReason?: boolean;
  /** An accessible label override for the whole indicator. */
  readonly ariaLabel?: string;
}

export function AlignmentIndicator({
  alignment,
  showReason = false,
  ariaLabel,
}: AlignmentIndicatorProps) {
  const primary = alignment.reasons[0];
  const reasonText = primary ? alignmentReasonText(primary) : null;
  const showReasonText =
    showReason && reasonText !== null && reasonText !== alignment.label;

  return (
    <span
      className="dh-alignment"
      aria-label={ariaLabel}
      role={ariaLabel ? "text" : undefined}
    >
      <span className="dh-alignment__pill" data-tone={alignment.tone}>
        <span className="dh-alignment__dot" aria-hidden="true" />
        {alignment.label}
      </span>
      {showReasonText ? (
        <span className="dh-alignment__reason">{reasonText}</span>
      ) : null}
    </span>
  );
}
