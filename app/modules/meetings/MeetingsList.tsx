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

import {
  formatMeetingDayGroup,
  formatMeetingTime,
  meetingDayKey,
  meetingStatusLabel,
  type SerializedMeeting,
} from "./meeting-view";

export interface MeetingsListProps {
  readonly meetings: readonly SerializedMeeting[];
  readonly ariaLabel: string;
  /** The owner's calendar day, `YYYY-MM-DD`, for the relative group headings. */
  readonly todayKey: string;
  /** Which lifecycle view this is, so the row can suppress its implied status. */
  readonly view: string;
}

type MeetingGroup = {
  readonly key: string;
  readonly heading: string;
  readonly meetings: readonly SerializedMeeting[];
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
  meetings: readonly SerializedMeeting[],
  todayKey: string,
): readonly MeetingGroup[] {
  const groups: MeetingGroup[] = [];
  for (const meeting of meetings) {
    // The meeting's OWN calendar day, never the UTC prefix of `startsAt`: a 9am
    // Sydney meeting is 23:00 UTC the day before, so slicing the ISO string put
    // it in the previous day's group under that day's heading.
    const key = meetingDayKey(meeting.startsAt, meeting.timezone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      (last.meetings as SerializedMeeting[]).push(meeting);
    } else {
      groups.push({
        key,
        heading: formatMeetingDayGroup(
          meeting.startsAt,
          meeting.timezone,
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
  view,
}: MeetingsListProps) {
  const groups = groupByDay(meetings, todayKey);

  return (
    <div className="dh-meetings-list" aria-label={ariaLabel}>
      {groups.map((group) => (
        <section key={`${group.key}-${group.meetings[0].id}`}>
          <h2 className="dh-meetings-list__day">{group.heading}</h2>
          <ul className="dh-meetings-list__rows">
            {group.meetings.map((meeting) => {
              const status = meeting.archivedAt
                ? "Archived"
                : meeting.status === IMPLIED_STATUS[view]
                  ? null
                  : meetingStatusLabel(meeting.status);
              const where = meeting.location ?? meeting.mode;
              const joinable =
                meeting.meetingUrl !== null &&
                meeting.meetingUrl.length > 0 &&
                meeting.archivedAt === null &&
                meeting.heldAt === null &&
                meeting.status === "planned";

              return (
                <li key={meeting.id} className="dh-meetings-list__row">
                  <Link
                    to={`/meeting/${meeting.id}`}
                    className="dh-meetings-list__item"
                    prefetch="intent"
                  >
                    {/* The time is a fixed leading column, so a day's meetings
                     * read down the page as a schedule rather than as a list
                     * that happens to mention times. */}
                    <time
                      className="dh-meetings-list__time"
                      dateTime={meeting.startsAt}
                    >
                      {formatMeetingTime(meeting.startsAt, meeting.timezone)}
                    </time>
                    <span className="dh-meetings-list__main">
                      <span className="dh-meetings-list__title">
                        {meeting.title}
                      </span>
                      {where || status ? (
                        <span className="dh-meetings-list__meta">
                          {where ? (
                            <span className="dh-meetings-list__where">
                              {where}
                            </span>
                          ) : null}
                          {status ? (
                            <span className="dh-meetings-list__status">
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
                    <a
                      className="dh-btn dh-btn--secondary dh-meetings-list__join"
                      href={meeting.meetingUrl as string}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Join ${meeting.title}`}
                    >
                      Join
                    </a>
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
