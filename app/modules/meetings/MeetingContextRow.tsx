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
 * the attendees. It is READ-ONLY on purpose — §28 says people should be
 * "recognisable but secondary", and an editor in a header makes them the
 * loudest thing on the record. Adding and removing attendees stays exactly
 * where it was, in the Details tab, which is also where the rest of the
 * meeting's metadata now lives.
 *
 * ── UNTITLED-13: the people are the SHARED Person mark ──────────────────────
 *
 * This file used to draw its own identity disc — `.dh-meeting-context__mark` in
 * `meetings.css`, with its own size, ground, weight and its own `initialsOf`
 * derivation — because `PersonAvatar` lived inside `~/modules/people` and
 * Meetings could not reach it. The same person was therefore a 44px tinted disc
 * on `/people` and a 20px grey one on their own meeting. Both marks are now the
 * one shared component over Untitled's `base/avatar` (§34), and the arrangement
 * is `informational-02/10`'s event panel: a short run of OVERLAPPING marks with
 * the count beside them, rather than a queue of name-plus-pill pairs.
 *
 * Nothing is lost to assistive tech by dropping the visible names: each mark is
 * an anchor whose accessible name is the person's, inside a list named
 * "Attendees", so a screen reader hears every one of them. A sighted reader
 * gets the faces and a link that says how many there are — which is the fact a
 * header can carry and four truncated names could not.
 *
 * ── The tint, and why most meetings will not show one ───────────────────────
 *
 * A Meeting resolves its attendees through EntityLinks, which carry the
 * counterpart's id and TITLE and nothing else. So the marks here are generated
 * from the title and take the neutral disc: the circle accent is a function of
 * the relationship the owner recorded, this surface does not read it, and a
 * colour that means nothing is worse than no colour. Giving Meetings the tinted
 * mark needs a bounded `people.getByIds` the kernel does not publish — a real
 * follow-up, recorded in the migration guide, and deliberately not a repository
 * change smuggled into a presentation pass.
 */

import { PersonAvatarGroup } from "~/shared/person-identity";

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
  /** Where the count sends the reader — the tab that lists them all. */
  readonly allAttendeesHref: string;
}

/**
 * How many attendees the header draws before it counts instead.
 *
 * Four fits one line beside a date at the narrowest desktop width and still
 * covers the great majority of real meetings. A fifth mark is what pushes the
 * row onto a second line, which is the point at which people stop being
 * secondary.
 */
const VISIBLE_ATTENDEES = 4;

export function MeetingContextRow({
  when,
  where,
  attendees,
  allAttendeesHref,
}: MeetingContextRowProps) {
  return (
    <div className="dh-meeting-context flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="dh-meeting-context__when font-medium text-secondary">
        {when}
      </span>
      {where ? (
        <>
          <Separator />
          <span className="dh-meeting-context__where min-w-0 truncate">
            {where}
          </span>
        </>
      ) : null}

      {attendees.length > 0 ? (
        <>
          <Separator />
          <span className="dh-meeting-context__people flex min-w-0 items-center gap-2">
            {/*
              The marks are DECORATIVE here, and that is a measured decision.

              A first draft made each one an anchor to its Person's record.
              `meetings-people-shot.mjs` measured them at 24×25px on a 393px
              phone, against the product's 44px coarse-pointer floor — and four
              44px targets plus a count do not fit on one line beside a date.
              Growing them would also make the people the loudest thing on the
              record, which is the opposite of §28.

              Nothing is unreachable. The names are still list items (visually
              hidden beside their marks), so a screen reader hears every one;
              the count beside them is a real link at a real size; and the
              Details tab it leads to lists each attendee as a full-height row
              with their name as a link, which is where per-person navigation
              belongs.
            */}
            <PersonAvatarGroup
              label="Attendees"
              size="xs"
              max={VISIBLE_ATTENDEES}
              members={attendees.map((attendee) => ({
                id: attendee.id,
                name: attendee.title,
              }))}
            />
            {/*
              The count is the header's one visible statement about the people,
              and it is a LINK because there is somewhere to go: the tab that
              lists them all. `attendeeCountLabel` states it in words, so it
              reads correctly at one attendee as well as at nine.
            */}
            <a
              /*
               * The header's ONE target for the people, so it takes the
               * product's coarse-pointer floor — the same `(hover: none)`
               * condition `ui.css` applies to every button and field, written
               * as a utility because this is one control rather than a family.
               */
              className="dh-meeting-context__more inline-flex items-center font-medium text-brand-secondary outline-focus-ring [@media(hover:none)]:min-h-[var(--app-touch-target-min)] hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
              href={allAttendeesHref}
            >
              {attendeeCountLabel(attendees.length)}
            </a>
          </span>
        </>
      ) : null}
    </div>
  );
}

function Separator() {
  return (
    <span
      className="dh-meeting-context__sep text-quaternary"
      aria-hidden="true"
    >
      ·
    </span>
  );
}

/** "1 attendee" / "5 attendees". Never a bare number beside a row of faces. */
export function attendeeCountLabel(count: number): string {
  return count === 1 ? "1 attendee" : `${count} attendees`;
}
