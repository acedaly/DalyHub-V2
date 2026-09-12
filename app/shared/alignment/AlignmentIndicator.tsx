/**
 * AREA-03 Alignment — the restrained inline alignment indicator (ADR-040).
 *
 * A calm toned badge (the state label) optionally followed by the primary
 * reason as plain text, so meaning is NEVER carried by colour alone. It does
 * not create a second Card — it is a small element dropped into the existing
 * Card metadata / Record summary slots.
 *
 * ── UNTITLED-07 — it is the product's badge now, not a Goals-only pill ──────
 *
 * `alignment.css` drew a bespoke chip here: its own radius, its own border, its
 * own 20px min-height, its own dot and its own two tone rules mapping
 * `success`/`info` onto DalyHub's `*-subtle` container pair. That is a second
 * badge system on a surface where a Goal's measurement status, its Area's state
 * and every collection's status column already draw Untitled's, so the same
 * screen carried two chip shapes describing two states of one record.
 *
 * `UntitledStatusBadge` is the one place DalyHub's tone vocabulary meets
 * Untitled's colours, and `AlignmentTone` is a strict subset of `BadgeTone`
 * (`neutral`, `success`, `info` — alignment deliberately never reaches for
 * warning or danger, ADR-040 §40.5), so the mapping needs no table of its own.
 * The dot survives as Untitled's `BadgeWithDot`, which is what it was
 * approximating.
 */

import type { GoalAlignment } from "~/kernel/alignment";
import { UntitledStatusBadge } from "~/shared/pill";

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
      className="dh-alignment inline-flex min-w-0 flex-wrap items-center gap-2"
      aria-label={ariaLabel}
      role={ariaLabel ? "text" : undefined}
    >
      {/*
       * The tone is carried on the wrapper `UntitledStatusBadge` already emits
       * (`data-dh-badge` + `data-tone`), so the machine fact a test reads is
       * unchanged — the class name it used to hang on is gone, the attribute is
       * not.
       */}
      <UntitledStatusBadge
        className="dh-alignment__pill"
        tone={alignment.tone}
        dot
      >
        {alignment.label}
      </UntitledStatusBadge>
      {showReasonText ? (
        <span className="dh-alignment__reason min-w-0 [overflow-wrap:anywhere] text-sm text-tertiary">
          {reasonText}
        </span>
      ) : null}
    </span>
  );
}
