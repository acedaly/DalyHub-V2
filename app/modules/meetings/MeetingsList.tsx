/**
 * UIX-04 §25 — the Meetings collection as a grouped LIST.
 *
 * The collection rendered shared Cards in `presentation="list"`, which gave every
 * meeting an entity glyph, a "Meeting" type label, a status pill, and its date
 * and place behind "When:" and "Where:" prefixes. Four of those six things are
 * identical on every row of a page called Meetings, and the two that vary — the
 * title and the time — were the smallest text on the row.
 *
 * §25 asks for the title and the date to dominate, and for grouping. Both come
 * from real data:
 *
 *   - the GROUPS are derived from `startsAt` against the owner's calendar day
 *     ("Today", "Tomorrow", "Thursday, 13 August 2026"), which is the same
 *     derivation the Diary timeline already makes. Nothing is stored or seeded;
 *   - the STATUS pill renders only when the status is not what the view already
 *     implies. "Planned" on every row of Upcoming is the view's own name repeated
 *     once per meeting; "Cancelled" in that same list is worth a person's
 *     attention, and shows.
 *
 * Attendees are deliberately NOT on the row. §25 lists them as optional ("may
 * show"), and the only way to resolve them for a page of meetings today is one
 * `listForEntity` call per row — an N+1 across the whole collection, to show a
 * name the record itself shows properly. "With whom" is answered on the meeting
 * (see `MeetingContextRow`); adding a batched link read to answer it twice is a
 * kernel change this redesign is not the right vehicle for.
 */

import { Link } from "react-router";

import { ButtonLink } from "~/shared/ui";

import {
  formatMeetingDayGroup,
  formatMeetingDuration,
  formatMeetingTime,
  meetingDayKey,
  meetingModeLabel,
  meetingStatusLabel,
  meetingZoneLabel,
  type SerializedMeeting,
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

export type MeetingsListMeeting = SerializedMeeting & {
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
      (last.meetings as SerializedMeeting[]).push(meeting);
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

export function MeetingsList({
  meetings,
  ariaLabel,
  todayKey,
  ownerTimezone,
  view,
}: MeetingsListProps) {
  const groups = groupByDay(meetings, todayKey, ownerTimezone);

  return (
    /*
     * UNTITLED-04 — a day is a bounded Untitled surface, and the schedule is a
     * stack of them.
     *
     * The reading is unchanged and is the point of the composition: a fixed
     * leading TIME column, so a day's meetings read down the page as a schedule
     * rather than as a list that happens to mention times. What changed is that
     * each day now sits in the same bounded card the migrated collection tables
     * and entity lists use, with the day heading as its section header — so the
     * groups are visibly groups instead of headings floating on the canvas.
     */
    <div
      className="dh-meetings-list flex flex-col gap-4"
      aria-label={ariaLabel}
    >
      {groups.map((group) => (
        <section
          key={`${group.key}-${group.meetings[0].id}`}
          className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary"
        >
          {/* REFINE §16/§40 — the day heading takes the Tasks group-heading
           * language: sentence case, the row's own size, weight 600, near-black,
           * with the day's count beside it. One vocabulary for "a bucket of
           * records", on every screen that has buckets. */}
          <h2 className="dh-meetings-list__day m-0 flex items-baseline gap-2 border-b border-secondary bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary max-md:px-4">
            {group.heading}
            <span
              className="dh-meetings-list__day-sep text-quaternary"
              aria-hidden="true"
            >
              ·
            </span>
            <span className="dh-meetings-list__day-count font-medium text-tertiary tabular-nums">
              {group.meetings.length}
            </span>
          </h2>
          <ul className="dh-meetings-list__rows m-0 list-none p-0">
            {group.meetings.map((meeting) => {
              const status = meeting.archivedAt
                ? "Archived"
                : meeting.status === IMPLIED_STATUS[view]
                  ? null
                  : meetingStatusLabel(meeting.status);
              // The stored mode is an enum (`in_person` / `phone` / `online`),
              // so it is put through the same formatter the record header uses
              // rather than printed raw — the collection said "in_person" to a
              // person for every meeting without a location.
              const where =
                meeting.location && meeting.location.length > 0
                  ? meeting.location
                  : meetingModeLabel(meeting.mode);
              // Only when it is not the owner's own zone: naming the zone on
              // every row of a schedule that is entirely in one zone is noise.
              const zone =
                meeting.timezone === ownerTimezone
                  ? null
                  : meetingZoneLabel(meeting.timezone);
              const duration = formatMeetingDuration(
                meeting.startsAt,
                meeting.endsAt,
              );
              /*
               * DEBT-124 — "with whom", on the row.
               *
               * The one fact UIX-04 §25 asked a meeting row to carry and it
               * could not, because the kernel had no batched relationship read.
               * It is TEXT rather than avatars: a name is what a schedule is
               * scanned by, and a row of discs would need a second read to name
               * them for a screen reader anyway.
               */
              const attendees = meeting.attendees ?? null;
              const who =
                attendees === null || attendees.names.length === 0
                  ? null
                  : attendees.hasMore
                    ? `${attendees.names.join(", ")} and others`
                    : attendees.names.join(", ");

              const joinable =
                meeting.meetingUrl !== null &&
                meeting.meetingUrl.length > 0 &&
                meeting.archivedAt === null &&
                meeting.heldAt === null &&
                meeting.status === "planned";

              return (
                <li
                  key={meeting.id}
                  className="dh-meetings-list__row relative flex items-center gap-3 border-b border-secondary px-5 last:border-b-0 hover:bg-secondary max-md:px-4"
                >
                  <Link
                    to={`/meeting/${meeting.id}`}
                    /*
                     * On a PHONE the time moves ABOVE the title rather than
                     * stealing 80px from it — a title truncated to make room for
                     * "10:00 am" is the wrong trade.
                     */
                    className="dh-meetings-list__item flex min-w-0 flex-1 items-start gap-4 py-3 outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 max-md:flex-col max-md:gap-0.5"
                    prefetch="intent"
                  >
                    {/* The time is a fixed leading column, so a day's meetings
                     * read down the page as a schedule rather than as a list
                     * that happens to mention times. */}
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
                      {where || status || duration || who ? (
                        <span className="dh-meetings-list__meta flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-tertiary">
                          {/* REFINE §40 — duration leads the meta line, because
                           * it is the fact a schedule is read for after the time
                           * itself. It is derived from the meeting's own
                           * `endsAt` and is absent when the record has none. */}
                          {duration ? (
                            <span className="dh-meetings-list__duration whitespace-nowrap before:pr-1.5 before:text-quaternary before:content-['·'] first:before:hidden">
                              {duration}
                            </span>
                          ) : null}
                          {where ? (
                            <span className="dh-meetings-list__where min-w-0 truncate before:pr-1.5 before:text-quaternary before:content-['·'] first:before:hidden">
                              {where}
                            </span>
                          ) : null}
                          {who ? (
                            <span
                              className="dh-meetings-list__who min-w-0 truncate before:pr-1.5 before:text-quaternary before:content-['·'] first:before:hidden"
                              data-testid="meeting-row-attendees"
                            >
                              {who}
                            </span>
                          ) : null}
                          {status ? (
                            <span className="dh-meetings-list__status whitespace-nowrap before:pr-1.5 before:text-quaternary before:content-['·'] first:before:hidden">
                              {status}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  {/*
                    MOBILE-01's one-tap Join, kept exactly: a labelled 44px
                    control OUTSIDE the row link (never nested inside it), for
                    meetings that actually have a link and have not happened yet.
                    It opens the conferencing site in a new tab, so the owner's
                    place in DalyHub survives the call.
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
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
