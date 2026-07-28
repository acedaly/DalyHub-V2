/**
 * PEOPLE-03 — the restrained inline stay-in-touch indicator.
 *
 * ONE shared presentation of a Person's DERIVED relationship state, dropped into an
 * existing slot (a Card's `metadata`, a Record header, a Summary heading row) — it
 * is never a second card and never a badge that competes for attention.
 *
 * It renders a calm toned pill carrying the STATE LABEL, optionally followed by the
 * primary reason as plain text. Meaning is never carried by colour alone: the label
 * and the reason are always present, so a screen-reader user hears the state and
 * why, and a forced-colours or monochrome reader loses nothing.
 *
 * Structurally identical to `HealthIndicator` (PROJ-02) on purpose — the two derived
 * signals in DalyHub should look and behave like siblings.
 */

import type {
  PersonRelationship,
  RelationshipReason,
  RelationshipState,
  RelationshipTone,
} from "~/kernel/relationships";

import { relationshipReasonText } from "./relationship-view";

/**
 * The minimum a surface must carry to render the indicator. A full
 * `PersonRelationship` satisfies it, and so does the compact projection a
 * collection card ships (state + label + tone + the primary reason), so the
 * collection and the record can never grow two different pills.
 */
export interface StayInTouchSignal {
  readonly state: RelationshipState;
  readonly label: string;
  readonly tone: RelationshipTone;
  readonly reasons?: readonly RelationshipReason[];
}

interface StayInTouchIndicatorProps {
  readonly relationship: StayInTouchSignal | PersonRelationship;
  /** Show the primary reason after the pill (record Summary, collection cards). */
  readonly showReason?: boolean;
  /** An accessible label override for the whole indicator. */
  readonly ariaLabel?: string;
}

export function StayInTouchIndicator({
  relationship,
  showReason = false,
  ariaLabel,
}: StayInTouchIndicatorProps) {
  const primary = relationship.reasons?.[0];
  const reasonText = primary ? relationshipReasonText(primary) : null;
  const showReasonText =
    showReason && reasonText !== null && reasonText !== relationship.label;

  return (
    <span
      className="dh-stay-in-touch"
      aria-label={ariaLabel}
      role={ariaLabel ? "text" : undefined}
    >
      <span className="dh-stay-in-touch__pill" data-tone={relationship.tone}>
        <span className="dh-stay-in-touch__dot" aria-hidden="true" />
        {relationship.label}
      </span>
      {showReasonText ? (
        <span className="dh-stay-in-touch__reason">{reasonText}</span>
      ) : null}
    </span>
  );
}
