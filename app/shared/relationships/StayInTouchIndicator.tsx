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

import { Badge, type BadgeTone } from "~/shared/ui";

import { relationshipReasonText } from "./relationship-view";

/**
 * UNTITLED-13 — the relationship tone, as the shared Badge's.
 *
 * `RelationshipTone` is deliberately narrower than the badge's vocabulary:
 * there is no `warning` and no `danger`, because a relationship is never either
 * (AGENTS.md §5 — care, not a CRM). This mapping is total and the two
 * unreachable tones are simply never produced, which is why the badge on this
 * record can only ever be calm.
 */
const BADGE_TONES: Readonly<Record<RelationshipTone, BadgeTone>> = {
  neutral: "neutral",
  success: "success",
  info: "info",
};

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
      className="dh-stay-in-touch inline-flex min-w-0 flex-wrap items-center gap-2"
      aria-label={ariaLabel}
      role={ariaLabel ? "text" : undefined}
    >
      {/*
        UNTITLED-13 — the product's ONE badge, over Untitled's `base/badges`,
        in its OUTLINE variant.

        MEASURED in both appearances, which is why it is outline and not soft:
        the soft `info` container is `rgb(231, 222, 255)` in light — a quiet
        lavender — and `rgb(75, 27, 195)` in dark, a saturated violet that was
        the loudest thing on a Person record. That token pair is the product's
        and is correct for a status a reader is meant to notice; a relationship
        state is not one. The Badge's own note describes `outline` as the
        variant "for a run of several badges where the tints would read as a
        stripe", and a calm hairline with a toned dot is what a relationship
        rates in both appearances.

        This was a hand-painted pill with its own stadium radius, its own
        minimum height, its own hairline and its own three-tone container map in
        `relationships.css` — on a record that draws Untitled badges two lines
        above it, for the status. The tone, the dot and the contrast pairs are
        the shared component's now; what stays DalyHub's is the rule the pill
        always followed and the badge enforces: the LABEL carries the state, so
        meaning is never colour alone.
      */}
      <Badge tone={BADGE_TONES[relationship.tone]} variant="outline" dot>
        {relationship.label}
      </Badge>
      {showReasonText ? (
        <span className="dh-stay-in-touch__reason min-w-0 text-xs break-words text-tertiary">
          {reasonText}
        </span>
      ) : null}
    </span>
  );
}
