/**
 * UIX-04 §27/§28 — the Meeting's context, as ONE line under its title.
 *
 * The record header used to state "When" and "Where" as two labelled context
 * items and say nothing at all about WHO — the people were an editor, four tab
 * inches down, behind the "Overview" tab, each on its own row beside a "Remove"
 * button. So the screen that is supposed to answer "what meeting is this, when,
 * and with whom" (§24) answered two of the three, and buried the third under the
 * controls for changing it.
 *
 * This is the answer to all three, compactly: the date and time, the place, and
 * the attendees as small initial marks with their names. It is READ-ONLY on
 * purpose — §28 says people should be "recognisable but secondary", and an
 * editor in a header makes them the loudest thing on the record. Adding and
 * removing attendees stays exactly where it was, in the Details tab, which is
 * also where the rest of the meeting's metadata now lives.
 *
 * §28's collapse rule: beyond `VISIBLE_ATTENDEES` the row shows a count instead
 * of a queue of pills. The overflow is not hidden information — the full list is
 * one tab away, and the count says how many are not shown.
 */

import { EntityLink } from "~/shared/entity";

export interface MeetingAttendeeSummary {
  readonly id: string;
  readonly title: string;
}

export interface MeetingContextRowProps {
  /** Formatted date and time, already resolved in the meeting's timezone. */
  readonly when: string;
  /** Location or mode, or null when the meeting records neither. */
  readonly where: string | null;
  readonly attendees: readonly MeetingAttendeeSummary[];
  /** Where "+N more" sends the reader — the tab that lists them all. */
  readonly allAttendeesHref: string;
}

/**
 * How many attendees the header names before it starts counting instead.
 *
 * Four fits one line beside a date at the narrowest desktop width and still
 * covers the great majority of real meetings. A fifth name is what pushes the
 * row onto a second line, which is the point at which people stop being
 * secondary.
 */
const VISIBLE_ATTENDEES = 4;

/**
 * A person's initials, for the identity mark.
 *
 * Deliberately derived from the DISPLAY TITLE rather than from first/last name
 * fields: the header is given whatever the People module considers this person's
 * name, and re-deriving it from parts here would be a second answer to "what is
 * this person called". Two initials at most; a mononym gets one.
 */
function initialsOf(title: string): string {
  const words = title
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
    .slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((word) => Array.from(word)[0].toUpperCase()).join("");
}

export function MeetingContextRow({
  when,
  where,
  attendees,
  allAttendeesHref,
}: MeetingContextRowProps) {
  const shown = attendees.slice(0, VISIBLE_ATTENDEES);
  const hidden = attendees.length - shown.length;

  return (
    <div className="dh-meeting-context">
      <span className="dh-meeting-context__when">{when}</span>
      {where ? (
        <>
          <span className="dh-meeting-context__sep" aria-hidden="true">
            ·
          </span>
          <span className="dh-meeting-context__where">{where}</span>
        </>
      ) : null}

      {attendees.length > 0 ? (
        <>
          <span className="dh-meeting-context__sep" aria-hidden="true">
            ·
          </span>
          {/*
            A real list with a real name, so a screen-reader user hears "People,
            list, 5 items" rather than a run of link text with no structure.
          */}
          <ul className="dh-meeting-context__people" aria-label="Attendees">
            {shown.map((attendee) => (
              <li key={attendee.id} className="dh-meeting-context__person">
                {/* The mark is decorative — the name beside it is the link text
                 * and the accessible name, so nothing depends on the initials
                 * being legible or on colour. */}
                <span
                  className="dh-meeting-context__mark"
                  aria-hidden="true"
                  data-initials={initialsOf(attendee.title)}
                >
                  {initialsOf(attendee.title)}
                </span>
                <EntityLink
                  type="person"
                  id={attendee.id}
                  title={attendee.title}
                />
              </li>
            ))}
            {hidden > 0 ? (
              <li className="dh-meeting-context__person">
                <a
                  className="dh-meeting-context__more"
                  href={allAttendeesHref}
                >{`+${hidden} more`}</a>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}
