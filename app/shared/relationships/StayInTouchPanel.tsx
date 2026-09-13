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

import type { ReactNode } from "react";

import type { PersonRelationship } from "~/kernel/relationships";

import {
  cadencePhrase,
  formatRelationshipDate,
  relationshipReasonText,
} from "./relationship-view";

/** One labelled fact in the panel's strip. */
export interface RelationshipFact {
  readonly label: string;
  readonly value: ReactNode;
}

interface StayInTouchPanelProps {
  readonly relationship: PersonRelationship;
  /** Heading id, so the Summary region can label the panel. */
  readonly headingId?: string;
  /**
   * UNTITLED-13 — facts the SURFACE owns, rendered at the head of this panel's
   * own strip rather than in a second `<dl>` beneath it.
   *
   * The Person workspace states "Last spoke" and "Next follow-up", which are
   * about what is happening NOW; this panel states the cadence facts, which are
   * about the rhythm they sit inside. Both belong in one strip and neither
   * belongs to the other component — so they arrive here and share the grid.
   *
   * MEASURED as the alternative's problem: with two separate `<dl>`s the two
   * grids could not align, so at 1440 the cadence row filled three columns, the
   * first interaction sat alone on a row of its own, and "Last spoke" started a
   * third — three half-empty tables where there is one set of facts.
   */
  readonly leadingFacts?: readonly RelationshipFact[];
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function factItems(relationship: PersonRelationship): RelationshipFact[] {
  const { cadence, summary } = relationship;
  const items: RelationshipFact[] = [];

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
      /*
       * "Your cadence", not "Staying in touch".
       *
       * The record already said those three words twice on one screen — once as
       * the header's context label beside the derived badge, once as this
       * panel's own section heading — and this fact made it three times, for
       * three different things. The label says what the value is: the interval
       * the follow-up signal was measured against.
       */
      label: "Your cadence",
      value:
        cadence.expectedIntervalSource === "follow_up_frequency"
          ? `You chose about every ${days(cadence.expectedIntervalDays)}`
          : `Your usual rhythm: about every ${days(cadence.expectedIntervalDays)}`,
    });
  }

  /*
   * The first interaction, unless it IS the last one.
   *
   * A relationship with exactly one recorded moment has the same date for both,
   * and the workspace states the last one directly above this panel — so the
   * panel was printing "First interaction: 25 July 2026" underneath "Last spoke:
   * 25 July 2026", which is one moment stated twice with two different names.
   * Found by `PersonSummary.test.tsx`, which asked for the date once and got
   * three of it before this and the `upcomingItems` duplicate were both removed.
   *
   * A first interaction earns its place the moment there is a SECOND one,
   * because then it says how long this has been going on.
   */
  if (
    summary.firstInteractionDate &&
    summary.firstInteractionDate !== summary.lastInteractionDate
  ) {
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
  leadingFacts = [],
}: StayInTouchPanelProps) {
  const facts = [...leadingFacts, ...factItems(relationship)];

  return (
    <section
      className="dh-stay-in-touch-panel flex min-w-0 flex-col gap-3"
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
      <ul className="dh-stay-in-touch-panel__reasons m-0 flex list-none flex-col gap-1 p-0">
        {relationship.reasons.map((reason) => (
          <li
            key={reason.code}
            className="dh-stay-in-touch-panel__reason relative min-w-0 pl-4 text-sm break-words text-secondary"
            data-tone={reason.tone}
          >
            {relationshipReasonText(reason)}
          </li>
        ))}
      </ul>

      {/*
        UNTITLED-13 — the same quiet labelled fact strip the Person workspace
        uses for its reference facts, and the same one Untitled's own profile
        pages put a person's location and links in: a small quaternary label
        over a primary value, wrapping down to one column on a phone.
      */}
      <dl className="dh-stay-in-touch-panel__facts m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="dh-stay-in-touch-panel__fact flex min-w-0 flex-col gap-0.5"
          >
            <dt className="text-xs font-medium text-quaternary">
              {fact.label}
            </dt>
            <dd className="m-0 text-sm font-medium break-words text-primary">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {relationship.cadence.sampleTruncated ? (
        <p className="dh-stay-in-touch-panel__note m-0 text-xs break-words text-tertiary">
          This relationship has more recorded moments than one read covers, so
          the rhythm above is read from the most recent ones. The totals are
          exact.
        </p>
      ) : null}
    </section>
  );
}
