/**
 * PEOPLE-03 — the relationship-health region for the Person record's Summary.
 *
 * It EXPLAINS a relationship's rhythm rather than repeating a coloured badge:
 * every current reason (primary first), and the cadence facts those reasons
 * stand on — days since the last shared moment, how often you usually connect,
 * the longest gap so far, and the interval the follow-up signal was measured
 * against.
 *
 * Nothing here re-derives anything: every value comes from the kernel's pure
 * evaluator. Nothing here notifies, nags or scores. PEOPLE-03 deliberately exposes
 * the calculated state ONLY — reminders are a later item, and this surface would be
 * the wrong place for them either way.
 *
 * Structurally the sibling of `ProjectHealthPanel` (PROJ-02).
 */

import type { PersonRelationship } from "~/kernel/relationships";

import {
  cadencePhrase,
  formatRelationshipDate,
  relationshipReasonText,
} from "./relationship-view";

interface StayInTouchPanelProps {
  readonly relationship: PersonRelationship;
  /** Heading id, so the Summary region can label the panel. */
  readonly headingId?: string;
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function factItems(
  relationship: PersonRelationship,
): { label: string; value: string }[] {
  const { cadence, summary } = relationship;
  const items: { label: string; value: string }[] = [];

  /*
   * RECORD-01 — "Last interaction" is NOT repeated here.
   *
   * The DS-13 relationship summary card directly above this panel states it
   * prominently, which is the right tier for it; restating it as a quiet fact
   * a few pixels below was the same value twice in one view, and the two are
   * derived from the same `summary.lastInteractionDate` so they can only ever
   * agree. The cadence facts below are what the card cannot say.
   */

  const rhythm = cadencePhrase(cadence);
  items.push({
    label: "How often",
    value:
      rhythm === null
        ? "Not enough history yet"
        : cadence.averageIntervalDays === null
          ? rhythm
          : `${rhythm} · about every ${days(Math.round(cadence.averageIntervalDays))}`,
  });

  if (cadence.longestGapDays !== null) {
    items.push({
      label: "Longest gap",
      value: days(cadence.longestGapDays),
    });
  }

  if (cadence.expectedIntervalDays !== null) {
    items.push({
      label: "Staying in touch",
      value:
        cadence.expectedIntervalSource === "follow_up_frequency"
          ? `You chose about every ${days(cadence.expectedIntervalDays)}`
          : `Your usual rhythm: about every ${days(cadence.expectedIntervalDays)}`,
    });
  }

  if (summary.firstInteractionDate) {
    items.push({
      label: "First interaction",
      value:
        formatRelationshipDate(summary.firstInteractionDate) ??
        summary.firstInteractionDate,
    });
  }

  return items;
}

export function StayInTouchPanel({
  relationship,
  headingId,
}: StayInTouchPanelProps) {
  const facts = factItems(relationship);

  return (
    <section
      className="dh-stay-in-touch-panel"
      aria-labelledby={headingId}
      data-state={relationship.state}
    >
      {/*
        RECORD-01 — no pill here.

        The Person record's header context line already carries the derived
        state as a `StayInTouchIndicator`, on every tab. Repeating it as this
        panel's own header stated one fact twice within a single view. The
        panel's job is the half the chip cannot do — WHY the state is what it
        is, and the cadence facts it stands on — so that is all it renders.
        `data-state` stays, so the section's own styling is unaffected.
      */}
      <ul className="dh-stay-in-touch-panel__reasons">
        {relationship.reasons.map((reason) => (
          <li
            key={reason.code}
            className="dh-stay-in-touch-panel__reason"
            data-tone={reason.tone}
          >
            {relationshipReasonText(reason)}
          </li>
        ))}
      </ul>

      <dl className="dh-stay-in-touch-panel__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="dh-stay-in-touch-panel__fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {relationship.cadence.sampleTruncated ? (
        <p className="dh-stay-in-touch-panel__note">
          This relationship has more recorded moments than one read covers, so
          the rhythm above is read from the most recent ones. The totals are
          exact.
        </p>
      ) : null}
    </section>
  );
}
