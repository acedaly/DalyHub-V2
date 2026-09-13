/**
 * UIX-04 §25 — the Meetings collection as a grouped schedule.
 *
 * The collection once rendered shared Cards in `presentation="list"`, which gave
 * every meeting an entity glyph, a "Meeting" type label, a status pill, and its
 * date and place behind "When:" and "Where:" prefixes. Four of those six things
 * are identical on every row of a page called Meetings, and the two that vary —
 * the title and the time — were the smallest text on the row.
 *
 * §25 asks for the title and the date to dominate, and for grouping. Both come
 * from real data: the GROUPS are derived from `startsAt` against the owner's
 * calendar day ("Today", "Tomorrow", "Thursday, 13 August 2026"), the same
 * derivation the Diary timeline makes, and nothing is stored or seeded.
 *
 * ── UNTITLED-13: the day card is the genuine component, and the two views
 *    finally read differently ─────────────────────────────────────────────────
 *
 * **The card.** Each day was a hand-copied class string that happened to spell
 * `TableCard.Root` and `TableCard.Header`'s output. It IS those components now,
 * imported from the vendored `application/table`, so the day heading carries the
 * count as Untitled's own badge and the bounded surface, the in-card header and
 * the divided body are upstream's rather than a transcription of them.
 *
 * **The reading.** §7 of the brief: "do not treat future and historical Meetings
 * identically simply because they are the same entity". They were. Both views
 * drew time, duration, place, attendees and an implied-status suppression, so a
 * meeting from three weeks ago advertised how long it was scheduled to run and
 * offered a Join link for a call that had finished. The two questions are not
 * the same question:
 *
 *   - an UPCOMING row is asked *is this ready, and can I get into it?* — so it
 *     keeps the duration, the place, the people and Join, and gains the one fact
 *     that decides whether you need to do something before it starts: whether
 *     there is an agenda;
 *   - a PAST row is asked *what came out of it?* — so the duration and the place
 *     give way to the decisions, the outcomes, the actions and whether notes
 *     were taken.
 *
 * Both readings are counts of real `meeting_items` rows and a real notes body
 * (see `serializeMeetingRow`); neither invents a workflow state, and a meeting
 * with nothing recorded says nothing rather than printing zeros.
 *
 * Attendees stay as TEXT rather than as the shared avatar group, and that is a
 * deliberate rejection rather than an omission: the batched relationship read
 * that resolves them (`listForEntities`) returns a counterpart's TITLE and
 * nothing else, so a row of marks here would be initials-only discs carrying
 * less than the names they replaced. See `MeetingContextRow`, where the meeting
 * itself does have somewhere to put faces.
 */

import { Link } from "react-router";

import { ButtonLink } from "~/shared/ui";
import { TableCard } from "~/shared/ui/untitled/application/table/table";
import { cx } from "~/shared/ui/untitled/utils/cx";

import {
  formatMeetingDayGroup,
  formatMeetingDuration,
  formatMeetingTime,
  meetingDayKey,
  meetingModeLabel,
  meetingStatusLabel,
  meetingZoneLabel,
  type SerializedMeetingRow,
} from "./meeting-view";

/**
 * DEBT-124 — a meeting row's People context.
 *
 * Resolved by the loader through the kernel's batched relationship read, never
 * by the row: a row that fetched its own attendees would be exactly the N+1
 * that kept this off the collection in the first place. `null` means the page
 * did not resolve it (or the meeting has none), and the row simply says
 * nothing — an honest absence rather than an empty "with:".
 */
export interface MeetingRowAttendeeContext {
  readonly names: readonly string[];
  readonly hasMore: boolean;
}

export type MeetingsListMeeting = SerializedMeetingRow & {
  readonly attendees?: MeetingRowAttendeeContext | null;
};

export interface MeetingsListProps {
  readonly meetings: readonly MeetingsListMeeting[];
  readonly ariaLabel: string;
  /** The owner's calendar day, `YYYY-MM-DD`, for the relative group headings. */
  readonly todayKey: string;
  /**
   * The owner's IANA timezone — the frame the whole schedule is read in.
   *
   * Both the day boundaries and the relative headings are resolved in it, so a
   * meeting scheduled in another zone lands on the owner's day rather than on
   * its own (which is what makes "Today"/"Tomorrow" mean anything). The TIME on
   * the row is still the meeting's own; the row names that zone when the two
   * differ.
   */
  readonly ownerTimezone: string;
  /** Which lifecycle view this is, so the row can suppress its implied status. */
  readonly view: string;
}

type MeetingGroup = {
  readonly key: string;
  readonly heading: string;
  readonly meetings: readonly MeetingsListMeeting[];
};

/**
 * Group consecutive meetings by their calendar day.
 *
 * Consecutive rather than sorted-into-buckets: the server has already ordered
 * the page (by start date, updated date or title, whichever the owner chose), and
 * re-grouping would silently override that choice. Under a non-chronological
 * sort the days simply come out interleaved, which is the honest rendering of
 * "sorted by title".
 */
function groupByDay(
  meetings: readonly MeetingsListMeeting[],
  todayKey: string,
  ownerTimezone: string,
): readonly MeetingGroup[] {
  const groups: MeetingGroup[] = [];
  for (const meeting of meetings) {
    // A real calendar day, never the UTC prefix of `startsAt`: a 9am Sydney
    // meeting is 23:00 UTC the day before, so slicing the ISO string put it in
    // the previous day's group under that day's heading.
    //
    // And the OWNER's day, not the meeting's. `todayKey` is the owner's, so a
    // meeting resolved in its own zone was being compared against a day
    // resolved in a different one — which is how a meeting still dated the 10th
    // in New York could read "Yesterday" to an owner whose day was the 11th in
    // Sydney, in a list of UPCOMING meetings.
    const key = meetingDayKey(meeting.startsAt, ownerTimezone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      (last.meetings as MeetingsListMeeting[]).push(meeting);
    } else {
      groups.push({
        key,
        heading: formatMeetingDayGroup(
          meeting.startsAt,
          ownerTimezone,
          todayKey,
        ),
        meetings: [meeting],
      });
    }
  }
  return groups;
}

/** The status a view already implies, and therefore does not need to restate. */
const IMPLIED_STATUS: Record<string, string> = {
  upcoming: "planned",
  recent: "completed",
};

/**
 * Which reading a view gets.
 *
 * `upcoming` is the only view about meetings that have not happened. `recent`
 * and `archived` are both histories, so both get the outcome reading — an
 * archived meeting is filed, not scheduled.
 */
function isRetrospective(view: string): boolean {
  return view !== "upcoming";
}

export function MeetingsList({
  meetings,
  ariaLabel,
  todayKey,
  ownerTimezone,
  view,
}: MeetingsListProps) {
  const groups = groupByDay(meetings, todayKey, ownerTimezone);
  const retrospective = isRetrospective(view);

  return (
    /*
     * A day is a bounded Untitled surface, and the schedule is a stack of them.
     *
     * The reading is the point of the composition: a fixed leading TIME column,
     * so a day's meetings read down the page as a schedule rather than as a list
     * that happens to mention times.
     */
    <div
      className="dh-meetings-list flex flex-col gap-4"
      aria-label={ariaLabel}
    >
      {groups.map((group) => (
        <TableCard.Root key={`${group.key}-${group.meetings[0].id}`} size="sm">
          {/*
            REFINE §16/§40 — the day heading takes the Tasks group-heading
            language, and it is Untitled's own card header doing it: the title,
            its count as the component's `Badge`, and the divided edge beneath.
            The `h2` rank is the document's, not the look's — a collection's `h1`
            is its title.
          */}
          <TableCard.Header
            className="dh-meetings-list__day"
            title={group.heading}
            /*
             * The badge names its NOUN, which is how Untitled's own table cards
             * use it ("Team members · 100 users") and not how this heading used
             * to: the count was INSIDE the `h2`, so its accessible name was
             * "Tomorrow 1" — a bare digit welded onto a date. Outside the
             * heading it has to say what it counts, or a screen-reader user
             * hears "Tomorrow, heading" then "1" and has to guess.
             */
            badge={
              group.meetings.length === 1
                ? "1 meeting"
                : `${group.meetings.length} meetings`
            }
          />
          <ul className="dh-meetings-list__rows m-0 list-none p-0">
            {group.meetings.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                view={view}
                ownerTimezone={ownerTimezone}
                retrospective={retrospective}
              />
            ))}
          </ul>
        </TableCard.Root>
      ))}
    </div>
  );
}

function MeetingRow({
  meeting,
  view,
  ownerTimezone,
  retrospective,
}: {
  readonly meeting: MeetingsListMeeting;
  readonly view: string;
  readonly ownerTimezone: string;
  readonly retrospective: boolean;
}) {
  const status = meeting.archivedAt
    ? "Archived"
    : meeting.status === IMPLIED_STATUS[view]
      ? null
      : meetingStatusLabel(meeting.status);

  // Only when it is not the owner's own zone: naming the zone on every row of a
  // schedule that is entirely in one zone is noise.
  const zone =
    meeting.timezone === ownerTimezone
      ? null
      : meetingZoneLabel(meeting.timezone);

  /*
   * DEBT-124 — "with whom", on the row. TEXT rather than avatars: a name is
   * what a schedule is scanned by, and the batched read that resolves them
   * carries a title and nothing else.
   */
  const attendees = meeting.attendees ?? null;
  const who =
    attendees === null || attendees.names.length === 0
      ? null
      : attendees.hasMore
        ? `${attendees.names.join(", ")} and others`
        : attendees.names.join(", ");

  const facts = retrospective
    ? retrospectiveFacts(meeting)
    : prospectiveFacts(meeting);

  const unprepared =
    !retrospective && !meeting.hasAgendaBody && meeting.agendaItems === 0;

  /*
   * The meta line, as ONE ordered list of parts.
   *
   * The row's facts, the people, the state and — on an upcoming meeting — the
   * one thing a schedule can usefully say before the day arrives. "No agenda
   * yet" belongs with the FACTS rather than in the trailing slot: a first draft
   * put it at the row's trailing edge beside Join, which at 1440 left it
   * floating 700px from the words it is about and made a fact look like an
   * action. The trailing slot is for things you press. It is deliberately quiet
   * and deliberately not a warning — a one-to-one or a phone call needs no
   * agenda, so the row states what is true rather than what to do.
   */
  const metaParts: RowFact[] = [
    ...facts,
    ...(who
      ? [
          {
            id: "who",
            text: who,
            truncates: true,
            className: "dh-meetings-list__who",
            testId: "meeting-row-attendees",
          } satisfies RowFact,
        ]
      : []),
    ...(status
      ? [
          {
            id: "status",
            text: status,
            className: "dh-meetings-list__status",
          } satisfies RowFact,
        ]
      : []),
    ...(unprepared
      ? [
          {
            id: "unprepared",
            text: "No agenda yet",
            className: "dh-meetings-list__unprepared text-quaternary",
            testId: "meeting-row-unprepared",
          } satisfies RowFact,
        ]
      : []),
  ];

  const joinable =
    !retrospective &&
    meeting.meetingUrl !== null &&
    meeting.meetingUrl.length > 0 &&
    meeting.archivedAt === null &&
    meeting.heldAt === null &&
    meeting.status === "planned";

  return (
    <li className="dh-meetings-list__row relative flex items-center gap-3 border-b border-secondary px-5 last:border-b-0 hover:bg-secondary max-md:px-4">
      <Link
        to={`/meeting/${meeting.id}`}
        /*
         * On a PHONE the time moves ABOVE the title rather than stealing 80px
         * from it — a title truncated to make room for "10:00 am" is the wrong
         * trade.
         */
        className="dh-meetings-list__item flex min-w-0 flex-1 items-start gap-4 py-3 outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 max-md:flex-col max-md:gap-0.5"
        prefetch="intent"
      >
        {/* The time is a fixed leading column, so a day's meetings read down the
         * page as a schedule rather than as a list that happens to mention
         * times. */}
        <time
          className="dh-meetings-list__time flex w-20 shrink-0 flex-col text-sm font-semibold text-secondary tabular-nums max-md:w-auto max-md:flex-row max-md:items-baseline max-md:gap-1.5 max-md:text-xs"
          dateTime={meeting.startsAt}
        >
          {formatMeetingTime(meeting.startsAt, meeting.timezone)}
          {zone ? (
            <span className="dh-meetings-list__zone text-xs font-normal text-tertiary max-md:before:pr-1.5 max-md:before:content-['·']">
              {zone}
            </span>
          ) : null}
        </time>
        <span className="dh-meetings-list__main flex min-w-0 flex-col gap-0.5">
          <span className="dh-meetings-list__title text-sm font-semibold text-primary">
            {meeting.title}
          </span>
          {metaParts.length > 0 ? (
            /*
             * MEASURED at 393px: the separator belongs to the part BEFORE it.
             *
             * Each part used to carry a leading `::before` "·", which travels
             * with its own flex item — so the moment the line wrapped, the new
             * line began "· Marcus Oyelaran, Yarra Council — Planning". A
             * dangling separator at the START of a line reads as a bullet
             * point. Hung off the preceding part instead, a wrapped line ends
             * "Whitfield site ·", which is the conventional continuation mark.
             */
            <span className="dh-meetings-list__meta flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-tertiary">
              {metaParts.map((part, index) => (
                <span
                  key={part.id}
                  className={cx(
                    index < metaParts.length - 1 &&
                      "after:pl-1.5 after:text-quaternary after:content-['·']",
                    part.truncates ? "min-w-0 truncate" : "whitespace-nowrap",
                    part.className,
                  )}
                  data-testid={part.testId}
                >
                  {part.text}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </Link>

      {/*
        MOBILE-01's one-tap Join, kept exactly: a labelled 44px control OUTSIDE
        the row link (never nested inside it), for meetings that actually have a
        link and have not happened yet. It opens the conferencing site in a new
        tab, so the owner's place in DalyHub survives the call.
      */}
      {joinable ? (
        <ButtonLink
          variant="secondary"
          size="sm"
          className="dh-meetings-list__join relative z-10 shrink-0"
          href={meeting.meetingUrl as string}
          target="_blank"
          rel="noreferrer"
          aria-label={`Join ${meeting.title}`}
        >
          Join
        </ButtonLink>
      ) : null}
    </li>
  );
}

type RowFact = {
  readonly id: string;
  readonly text: string;
  readonly truncates?: boolean;
  readonly className?: string;
  readonly testId?: string;
};

/**
 * An UPCOMING row: how long, and where.
 *
 * REFINE §40 — duration leads, because it is the fact a schedule is read for
 * after the time itself. It is derived from the meeting's own `endsAt` and is
 * absent when the record has none. The place is the location if there is one,
 * otherwise the mode put through the same formatter the record header uses —
 * the collection used to print the raw enum `in_person` to a person.
 */
function prospectiveFacts(meeting: MeetingsListMeeting): RowFact[] {
  const facts: RowFact[] = [];
  const duration = formatMeetingDuration(meeting.startsAt, meeting.endsAt);
  if (duration) {
    facts.push({
      id: "duration",
      text: duration,
      className: "dh-meetings-list__duration",
    });
  }
  const where =
    meeting.location && meeting.location.length > 0
      ? meeting.location
      : meetingModeLabel(meeting.mode);
  if (where) {
    facts.push({
      id: "where",
      text: where,
      truncates: true,
      className: "dh-meetings-list__where",
    });
  }
  return facts;
}

/**
 * A PAST row: what came out of it.
 *
 * §7 — a history is read for its outcomes, so the row spends its metadata line
 * on them instead of on how long the meeting was scheduled to run. Every figure
 * is a stored `meeting_items` row; "Notes" is whether the notes body has any
 * non-whitespace in it. A meeting with none of the four says nothing at all —
 * an absence is an absence, and "0 decisions" would be the scoreboard reading
 * the product does not do.
 *
 * The place survives at the end, quietly, because it is still how a person
 * recognises WHICH weekly sync this was.
 */
function retrospectiveFacts(meeting: MeetingsListMeeting): RowFact[] {
  const facts: RowFact[] = [];
  const { decisions, outcomes, actions, hasNotes } = meeting.outcomes;

  if (decisions > 0) {
    facts.push({
      id: "decisions",
      text: decisions === 1 ? "1 decision" : `${decisions} decisions`,
      className: "dh-meetings-list__outcome",
      testId: "meeting-row-decisions",
    });
  }
  if (actions > 0) {
    facts.push({
      id: "actions",
      text: actions === 1 ? "1 action" : `${actions} actions`,
      className: "dh-meetings-list__outcome",
      testId: "meeting-row-actions",
    });
  }
  if (outcomes > 0) {
    facts.push({
      id: "outcomes",
      text: outcomes === 1 ? "1 outcome" : `${outcomes} outcomes`,
      className: "dh-meetings-list__outcome",
    });
  }
  if (hasNotes) {
    facts.push({
      id: "notes",
      text: "Notes",
      className: "dh-meetings-list__outcome",
      testId: "meeting-row-notes",
    });
  }

  const where =
    meeting.location && meeting.location.length > 0
      ? meeting.location
      : meetingModeLabel(meeting.mode);
  if (where) {
    facts.push({
      id: "where",
      text: where,
      truncates: true,
      className: "dh-meetings-list__where",
    });
  }
  return facts;
}
