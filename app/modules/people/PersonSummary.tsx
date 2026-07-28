/**
 * PEOPLE-01 / PEOPLE-03 — the Person "Summary" tab.
 *
 * The at-a-glance relationship view, and the surface that answers the questions the
 * Person record exists to answer: who is this, when did we last interact, how often
 * do we interact, and what have we shared. It renders, in order:
 *
 *   1. identity — avatar, name/pronouns, organisation and role, relationship;
 *   2. quick actions (Call / Email / Copy work today; the rest are honest
 *      placeholders that explain what they will do rather than dead-ending);
 *   3. the PEOPLE-03 **relationship summary** — DS-13 shared summary cards over the
 *      derived aggregate, every card leading to the surface that opens the records
 *      behind it;
 *   4. the PEOPLE-03 **stay-in-touch** panel — the derived rhythm, explained;
 *   5. the Person's own key dates and tags.
 *
 * Nothing in 3 or 4 is computed here: the loader evaluates the kernel model
 * server-side and this component only lays it out.
 */

import { useCallback } from "react";

import type { PersonRelationship } from "~/kernel/relationships";
import { useFeedback } from "~/shared/feedback";
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
  const feedback = useFeedback();
  const phone = person.mobile ?? person.workPhone;

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        feedback.notifySuccess(`${label} copied`);
      } catch {
        feedback.notifyError(`Couldn’t copy the ${label.toLowerCase()}.`);
      }
    },
    [feedback],
  );

  const placeholder = useCallback(
    (what: string) => {
      feedback.notifyInfo(`${what} will be available in an upcoming release.`);
    },
    [feedback],
  );

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

  const contextLine = [person.role, person.organisation]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="dh-person-summary">
      <h2 className="dh-visually-hidden">Summary</h2>
      <div className="dh-person-summary__head">
        <PersonAvatar
          name={person.title}
          initials={person.initials}
          photoUrl={person.photoUrl}
          size={96}
        />
        <div className="dh-person-summary__identity">
          <p className="dh-person-summary__name">
            {person.preferredName && person.preferredName !== person.title
              ? `${person.title} (${person.preferredName})`
              : person.title}
            {person.pronouns ? (
              <span className="dh-person-summary__pronouns">
                {" "}
                · {person.pronouns}
              </span>
            ) : null}
          </p>
          {contextLine ? (
            <p className="dh-person-summary__context">{contextLine}</p>
          ) : null}
          {person.relationshipLabel ? (
            <p className="dh-person-summary__relationship">
              <span className="dh-person-summary__relationship-chip">
                {person.relationshipLabel}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="dh-person-summary__actions"
        role="group"
        aria-label="Quick actions"
      >
        <a
          className="dh-btn dh-btn--secondary"
          href={phone ? `tel:${phone}` : undefined}
          aria-disabled={phone ? undefined : "true"}
          onClick={(e) => {
            if (!phone) {
              e.preventDefault();
              placeholder("Calling from here");
            }
          }}
        >
          Call
        </a>
        <a
          className="dh-btn dh-btn--secondary"
          href={person.email ? `mailto:${person.email}` : undefined}
          aria-disabled={person.email ? undefined : "true"}
          onClick={(e) => {
            if (!person.email) {
              e.preventDefault();
              placeholder("Emailing from here");
            }
          }}
        >
          Email
        </a>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => placeholder("Logging a diary entry for this person")}
        >
          Diary entry
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => placeholder("Scheduling a meeting with this person")}
        >
          Meeting
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => placeholder("Writing a linked note")}
        >
          New Note
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => person.email && copy(person.email, "Email")}
          disabled={!person.email}
        >
          Copy email
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => phone && copy(phone, "Phone")}
          disabled={!phone}
        >
          Copy phone
        </button>
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
