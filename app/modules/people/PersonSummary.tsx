/**
 * PEOPLE-01 / PEOPLE-03 — the Person "Summary" tab.
 *
 * The at-a-glance relationship view, and the surface that answers the questions the
 * Person record exists to answer: who is this, when did we last interact, how often
 * do we interact, and what have we shared. It renders, in order:
 *
 *   1. identity — the person's face, their preferred name and the relationship
 *      word. RECORD-01 removed the name, pronouns, organisation and role from
 *      here: the record header states each of them once, directly above;
 *   2. contact actions — Call / Email (and Message where a mobile exists) act on
 *      real contact data through standard `tel:`/`mailto:`/`sms:` URIs, never a
 *      fake integration. UIQ-011 reduced this from eight equally-weighted pills
 *      to these: a control is rendered only where the data behind it exists, and
 *      creating a Task, Meeting, Note or Diary entry moved to the record
 *      header's overflow, which passes this Person's context to the ONE shared
 *      capture sheet;
 *   3. the PEOPLE-03 **relationship summary** — DS-13 shared summary cards over the
 *      derived aggregate, every card leading to the surface that opens the records
 *      behind it;
 *   4. the PEOPLE-03 **stay-in-touch** panel — the derived rhythm, explained;
 *   5. the Person's own key dates and tags.
 *
 * Nothing in 3 or 4 is computed here: the loader evaluates the kernel model
 * server-side and this component only lays it out.
 */

import type { ReactNode } from "react";

import type { PersonRelationship } from "~/kernel/relationships";
import { StayInTouchPanel } from "~/shared/relationships";
import { SummaryCards } from "~/shared/summary-cards";

import { PersonAvatar } from "./PersonAvatar";
import { personRelationshipCards } from "./person-relationship-view";
import {
  formatBirthday,
  formatPersonDate,
  type SerializedPerson,
} from "./person-view";

interface PersonSummaryProps {
  readonly person: SerializedPerson;
  /** The PEOPLE-03 derived relationship, evaluated server-side on every load. */
  readonly relationship: PersonRelationship;
  readonly onEditContact: () => void;
}

const RELATIONSHIP_HEADING_ID = "dh-person-relationship-heading";
const STAY_IN_TOUCH_HEADING_ID = "dh-person-stay-in-touch-heading";

export function PersonSummary({
  person,
  relationship,
  onEditContact,
}: PersonSummaryProps) {
  const phone = person.mobile ?? person.workPhone;

  const facts: { id: string; label: string; value: string }[] = [];
  // PEOPLE-03 — the hand-entered `lastInteraction` field is now a FALLBACK, shown
  // only while nothing has actually been recorded. Once the relationship has real
  // history the derived "Last interaction" card above is the honest answer, and two
  // fields of the same name that can disagree would be worse than one.
  const noteworthyLastInteraction =
    relationship.summary.lastInteractionDate === null
      ? formatPersonDate(person.lastInteraction)
      : null;
  if (noteworthyLastInteraction) {
    facts.push({
      id: "last",
      label: "Last interaction (noted)",
      value: noteworthyLastInteraction,
    });
  }
  const nextFollowUp = formatPersonDate(person.nextFollowUp);
  if (nextFollowUp) {
    facts.push({ id: "next", label: "Next follow-up", value: nextFollowUp });
  }
  const birthday = formatBirthday(person.birthday);
  if (birthday) {
    facts.push({ id: "birthday", label: "Birthday", value: birthday });
  }
  if (person.favouriteContactMethodLabel) {
    facts.push({
      id: "prefers",
      label: "Prefers",
      value: person.favouriteContactMethodLabel,
    });
  }

  /*
   * UIQ-011 — the Person's PRIMARY actions are Call and Email, and only when
   * the contact data supports them.
   *
   * The record used to carry eight tonal pills at one weight: Call, Email, New
   * Task, Diary entry, New Meeting, New Note, Copy email and Copy phone. Two of
   * those act on this person; four create some OTHER record and are the global
   * capture sheet's job; two were clipboard conveniences that sat greyed out on
   * every person with no email or phone. A greyed-out Call on someone with no
   * number is a control that can never do anything, so it is not rendered at
   * all rather than rendered disabled — the Contact tab is where a missing
   * number gets added.
   *
   * A message action appears only where the data supports it: `sms:` needs a
   * MOBILE, not any phone, so a person with only a work number gets Call and
   * Email and no third button that would dial a landline by SMS.
   *
   * Everything demoted is reachable: the four capture actions are in the record
   * header's overflow (with this Person's context attached), and copying is
   * there too. Nothing was removed from the product — see `PersonRecord`.
   */
  const preferredName =
    person.preferredName && person.preferredName !== person.title
      ? person.preferredName
      : null;

  const primaryActions: ReactNode[] = [];
  if (phone) {
    primaryActions.push(
      <a key="call" className="dh-btn dh-btn--secondary" href={`tel:${phone}`}>
        Call
      </a>,
    );
  }
  if (person.email) {
    primaryActions.push(
      <a
        key="email"
        className="dh-btn dh-btn--secondary"
        href={`mailto:${person.email}`}
      >
        Email
      </a>,
    );
  }
  if (person.mobile) {
    primaryActions.push(
      <a
        key="message"
        className="dh-btn dh-btn--secondary"
        href={`sms:${person.mobile}`}
      >
        Message
      </a>,
    );
  }

  return (
    <div className="dh-person-summary">
      <h2 className="dh-visually-hidden">Summary</h2>
      {/*
        RECORD-01 / UIQ-011 — the identity block, and the two actions that are
        genuinely primary.

        This block used to restate the record's own header: the name (which is
        the h1 directly above it), the pronouns, and "Site foreman · Whitfield
        Building Co." — all of which the header's context line now carries once.
        What is left is what the header genuinely cannot show: the person's
        face, their preferred name, and the relationship word that makes this a
        relationship record rather than a contact row.
      */}
      <div className="dh-person-summary__head">
        <PersonAvatar
          name={person.title}
          initials={person.initials}
          photoUrl={person.photoUrl}
          size={72}
        />
        <div className="dh-person-summary__identity">
          {preferredName ? (
            <p className="dh-person-summary__name">{preferredName}</p>
          ) : null}
          {person.relationshipLabel ? (
            <p className="dh-person-summary__relationship">
              <span className="dh-person-summary__relationship-chip">
                {person.relationshipLabel}
              </span>
            </p>
          ) : null}
        </div>
        {primaryActions.length > 0 ? (
          <div
            className="dh-person-summary__actions"
            role="group"
            aria-label="Contact actions"
          >
            {primaryActions}
          </div>
        ) : null}
      </div>

      {/* Each region is labelled EXACTLY once: the heading labels the shared
       * component itself (the DS-13 list, the stay-in-touch section), never a
       * wrapper as well — two nested landmarks with the same name is a screen-reader
       * dead end, not extra structure. */}
      <div className="dh-person-summary__section">
        <h3
          className="dh-person-summary__section-heading"
          id={RELATIONSHIP_HEADING_ID}
        >
          Relationship
        </h3>
        <SummaryCards
          items={personRelationshipCards(relationship)}
          label="Relationship"
          labelledBy={RELATIONSHIP_HEADING_ID}
        />
      </div>

      <div className="dh-person-summary__section">
        <h3
          className="dh-person-summary__section-heading"
          id={STAY_IN_TOUCH_HEADING_ID}
        >
          Staying in touch
        </h3>
        <StayInTouchPanel
          relationship={relationship}
          headingId={STAY_IN_TOUCH_HEADING_ID}
        />
      </div>

      {facts.length > 0 ? (
        <dl className="dh-person-summary__facts">
          {facts.map((fact) => (
            <div key={fact.id} className="dh-person-summary__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {person.tags.length > 0 ? (
        <ul className="dh-person-summary__tags" aria-label="Tags">
          {person.tags.map((tag) => (
            <li key={tag} className="dh-person-summary__tag">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="dh-person-summary__edit">
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onEditContact}
        >
          Edit contact details
        </button>
      </p>
    </div>
  );
}
