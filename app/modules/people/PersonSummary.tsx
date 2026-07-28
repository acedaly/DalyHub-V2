/**
 * PEOPLE-01 — the Person "Summary" tab.
 *
 * The at-a-glance relationship view: a large avatar, name/pronouns, organisation
 * and role, relationship, quick actions, direct contact buttons, and the key
 * dates (last interaction, next follow-up, birthday) and tags. Quick actions that
 * depend on a not-yet-built module (Diary entry, Meeting, New Note) are honest
 * placeholders — they explain what they will do rather than dead-ending
 * (AGENTS.md §6). Call / Email / Copy work today.
 */

import { useCallback } from "react";

import { useFeedback } from "~/shared/feedback";

import { PersonAvatar } from "./PersonAvatar";
import {
  formatBirthday,
  formatPersonDate,
  type SerializedPerson,
} from "./person-view";

interface PersonSummaryProps {
  readonly person: SerializedPerson;
  readonly onEditContact: () => void;
}

export function PersonSummary({ person, onEditContact }: PersonSummaryProps) {
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
  const lastInteraction = formatPersonDate(person.lastInteraction);
  if (lastInteraction) {
    facts.push({
      id: "last",
      label: "Last interaction",
      value: lastInteraction,
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
