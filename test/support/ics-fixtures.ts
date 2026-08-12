/**
 * CAL-01 — SYNTHETIC iCalendar fixtures.
 *
 * Every byte here is invented. There is no real published calendar URL, no real
 * meeting title, no attendee, no organiser and no work calendar content anywhere
 * in this repository, and there never will be: a test fixture is a file that
 * gets committed, screenshotted and pasted into pull requests, and a real feed
 * URL is a credential (CAL-01 §5, §38).
 *
 * The dates are pinned around a fixed reference week so every assertion is
 * deterministic — including the two that matter most and cannot be written
 * against "now": the Australia/Sydney DST transitions.
 */

/** The reference "today" every fixture is written around (a Wednesday). */
export const ICS_TODAY = "2026-08-12";
export const ICS_NOW = new Date("2026-08-12T00:30:00.000Z"); // 10:30 in Sydney
export const ICS_TIMEZONE = "Australia/Sydney";

/** The synthetic feed address used everywhere a URL is needed. Never resolved. */
export const TEST_FEED_URL = "https://calendar.example.com/feeds/synthetic.ics";
export const TEST_FEED_URL_SECOND =
  "https://calendar.example.com/feeds/synthetic-personal.ics";

/**
 * A complete `VTIMEZONE` for Australia/Sydney, with both transitions.
 *
 * Included in the fixtures rather than relying on the runtime's zone database,
 * because that is what a real Outlook or iCloud feed does — and because it is
 * the piece a naive parser silently ignores, producing events an hour out for
 * half the year.
 */
export const SYDNEY_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Australia/Sydney
BEGIN:STANDARD
DTSTART:19700405T030000
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
TZNAME:AEST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19701004T020000
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
TZNAME:AEDT
END:DAYLIGHT
END:VTIMEZONE`;

/**
 * A `VTIMEZONE` whose `TZID` is a WINDOWS zone name, not an IANA one.
 *
 * This is what an Outlook / Microsoft 365 published feed actually emits, and it
 * is the shape behind the "Choose a valid timezone." production defect:
 *
 *   - `ical.js` resolves events against the definition BELOW, so the instants it
 *     produces are exactly right — the offsets and the DST rules are stated here
 *     and no IANA lookup happens;
 *   - `new Intl.DateTimeFormat("en", { timeZone: "AUS Eastern Standard Time" })`
 *     throws `RangeError`, so the identifier is NOT something DalyHub can store
 *     as a Meeting timezone.
 *
 * The offsets are Sydney's, so an event written against this zone must land on
 * the same instant as the identical event written against `Australia/Sydney` —
 * which is the assertion that proves the parser fix did not disturb resolution.
 */
export const WINDOWS_TZID = "AUS Eastern Standard Time";
export const WINDOWS_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:AUS Eastern Standard Time
BEGIN:STANDARD
DTSTART:19700405T030000
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
TZNAME:AUS Eastern Standard Time
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19701004T020000
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
TZNAME:AUS Eastern Daylight Time
END:DAYLIGHT
END:VTIMEZONE`;

/**
 * A `VTIMEZONE` with a wholly CUSTOM `TZID`, of the kind smaller publishers emit.
 *
 * Same point as the Windows fixture, from the other direction: the identifier is
 * not a Windows name either, so nothing can be special-cased. The offsets are
 * again Sydney's.
 */
export const CUSTOM_TZID = "Customized Time Zone 42";
export const CUSTOM_VTIMEZONE = WINDOWS_VTIMEZONE.replace(
  /AUS Eastern Standard Time/g,
  CUSTOM_TZID,
);

/** Wrap `VEVENT`s (and any `VTIMEZONE`) in a well-formed `VCALENDAR`. */
export function icsCalendar(...body: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DalyHub Test//Synthetic//EN",
    "CALSCALE:GREGORIAN",
    ...body,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** A single timed event in an explicit zone. */
export const TIMED_EVENT = `BEGIN:VEVENT
UID:synthetic-timed-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T083000
DTEND;TZID=Australia/Sydney:20260812T090000
SUMMARY:Operational Officer Program
LOCATION:Training Room 2
END:VEVENT`;

/** A UTC event — the `Z` form, with no `TZID` at all. */
export const UTC_EVENT = `BEGIN:VEVENT
UID:synthetic-utc-1
DTSTAMP:20260801T000000Z
DTSTART:20260812T030000Z
DTEND:20260812T040000Z
SUMMARY:Regional sync
END:VEVENT`;

/** An all-day event: DATE values, and an EXCLUSIVE end. */
export const ALL_DAY_EVENT = `BEGIN:VEVENT
UID:synthetic-allday-1
DTSTAMP:20260801T000000Z
DTSTART;VALUE=DATE:20260812
DTEND;VALUE=DATE:20260813
SUMMARY:Training Academy
END:VEVENT`;

/** A three-day all-day block, to prove multi-day membership. */
export const MULTI_DAY_ALL_DAY_EVENT = `BEGIN:VEVENT
UID:synthetic-allday-multi
DTSTAMP:20260801T000000Z
DTSTART;VALUE=DATE:20260814
DTEND;VALUE=DATE:20260817
SUMMARY:Camping
END:VEVENT`;

/** A folded line and escaped TEXT — the two things a naive parser mangles. */
export const FOLDED_AND_ESCAPED_EVENT = `BEGIN:VEVENT
UID:synthetic-folded-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T130000
DTEND;TZID=Australia/Sydney:20260812T143000
SUMMARY:SAF19 Workshop\\, planning and re
 view session
LOCATION:Level 3\\; Room A
END:VEVENT`;

/** A daily series with a count. */
export const DAILY_SERIES = `BEGIN:VEVENT
UID:synthetic-daily-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T070000
DTEND;TZID=Australia/Sydney:20260812T073000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Morning stand-up
END:VEVENT`;

/** A monthly series, to prove the third recurrence frequency. */
export const MONTHLY_SERIES = `BEGIN:VEVENT
UID:synthetic-monthly-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260805T150000
DTEND;TZID=Australia/Sydney:20260805T160000
RRULE:FREQ=MONTHLY;COUNT=4
SUMMARY:Monthly review
END:VEVENT`;

/**
 * A weekly series with everything a real recurring meeting has: an excluded
 * date, a moved instance and a cancelled instance.
 *
 *   03 Aug  ordinary
 *   10 Aug  MOVED to 11:30 and retitled
 *   17 Aug  EXCLUDED by EXDATE
 *   24 Aug  CANCELLED by a RECURRENCE-ID override with STATUS:CANCELLED
 *   31 Aug  ordinary
 */
export const WEEKLY_SERIES_WITH_EXCEPTIONS = `BEGIN:VEVENT
UID:synthetic-weekly-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260803T100000
DTEND;TZID=Australia/Sydney:20260803T110000
RRULE:FREQ=WEEKLY;COUNT=5
EXDATE;TZID=Australia/Sydney:20260817T100000
SUMMARY:Weekly Catch-up
LOCATION:Room 1
END:VEVENT
BEGIN:VEVENT
UID:synthetic-weekly-1
RECURRENCE-ID;TZID=Australia/Sydney:20260810T100000
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260810T113000
DTEND;TZID=Australia/Sydney:20260810T123000
SUMMARY:L&D Weekly Catch-up
LOCATION:Room 4
END:VEVENT
BEGIN:VEVENT
UID:synthetic-weekly-1
RECURRENCE-ID;TZID=Australia/Sydney:20260824T100000
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260824T100000
DTEND;TZID=Australia/Sydney:20260824T110000
STATUS:CANCELLED
SUMMARY:Weekly Catch-up
END:VEVENT`;

/**
 * A weekly series crossing the Australia/Sydney DST boundary.
 *
 * 2026's spring-forward is Sunday 4 October. A 09:00 Sydney meeting is 22:00Z
 * the previous day before it and 22:00Z the previous day after it too — because
 * the ZONE moved, not the meeting. What must NOT happen is the instant staying
 * fixed and the local time drifting to 10:00.
 */
export const DST_WEEKLY_SERIES = `BEGIN:VEVENT
UID:synthetic-dst-1
DTSTAMP:20260901T000000Z
DTSTART;TZID=Australia/Sydney:20260929T090000
DTEND;TZID=Australia/Sydney:20260929T100000
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Spring series
END:VEVENT`;

/**
 * The production shape, synthesised: a Windows-TZID event that RUNS OVERNIGHT.
 *
 * 14:00 on Wednesday 12 August to 12:00 on Thursday the 13th, in the Windows
 * zone above. It reproduces both reported defects at once — the unusable TZID
 * that stopped "Create meeting notes", and the "2:00 pm to 12:00 pm" range that
 * read as an end before its own start.
 *
 * Written against the Windows zone, 14:00 AEST is 04:00Z and 12:00 the next day
 * is 02:00Z on the 13th.
 */
export const WINDOWS_TZ_OVERNIGHT_EVENT = `BEGIN:VEVENT
UID:synthetic-windows-overnight
DTSTAMP:20260801T000000Z
DTSTART;TZID=AUS Eastern Standard Time:20260812T140000
DTEND;TZID=AUS Eastern Standard Time:20260813T120000
SUMMARY:Field Officer Training/Assessment
LOCATION:North Region
END:VEVENT`;

/**
 * The SAME publisher, the same zone, but genuinely finishing on the start day.
 *
 * The control for the overnight fixture. If anything in the parse ever pushed an
 * end into the following day — a mis-registered zone, an off-by-one on the DTEND
 * date, a floating fallback — this event's end would move too, and the assertion
 * on its instant would catch it. Without it, "ends the next day" would look
 * correct whether or not the feed said so.
 */
export const WINDOWS_TZ_SAME_DAY_EVENT = `BEGIN:VEVENT
UID:synthetic-windows-same-day
DTSTAMP:20260801T000000Z
DTSTART;TZID=AUS Eastern Standard Time:20260812T140000
DTEND;TZID=AUS Eastern Standard Time:20260812T163000
SUMMARY:Field Officer Briefing
LOCATION:North Region
END:VEVENT`;

/** The same event against a wholly custom TZID, so nothing can be special-cased. */
export const CUSTOM_TZ_EVENT = `BEGIN:VEVENT
UID:synthetic-custom-tz
DTSTAMP:20260801T000000Z
DTSTART;TZID=Customized Time Zone 42:20260812T140000
DTEND;TZID=Customized Time Zone 42:20260812T150000
SUMMARY:Custom zone session
END:VEVENT`;

/** The same wall-clock, against a REAL IANA zone — the "nothing else changed" control. */
export const IANA_TZ_OVERNIGHT_EVENT = `BEGIN:VEVENT
UID:synthetic-iana-overnight
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T140000
DTEND;TZID=Australia/Sydney:20260813T120000
SUMMARY:Overnight IANA session
END:VEVENT`;

/**
 * `DTEND` BEFORE `DTSTART` — a real publisher error, and the other reading of
 * "2:00 pm to 12:00 pm".
 *
 * The reported production event could have meant either "finishes at noon
 * TOMORROW" or "this feed states an impossible end". The parser must never
 * resolve the second into the first: rolling an inverted end forward by a day to
 * make it look sensible would invent a twenty-two hour commitment the calendar
 * never claimed. It is normalised to the start instead, and the schedule shows a
 * single instant.
 */
export const INVERTED_END_EVENT = `BEGIN:VEVENT
UID:synthetic-inverted-end
DTSTAMP:20260801T000000Z
DTSTART;TZID=AUS Eastern Standard Time:20260812T140000
DTEND;TZID=AUS Eastern Standard Time:20260812T120000
SUMMARY:Impossible end
END:VEVENT`;

/** An event straddling midnight in the owner's zone. */
export const MIDNIGHT_STRADDLING_EVENT = `BEGIN:VEVENT
UID:synthetic-midnight-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T233000
DTEND;TZID=Australia/Sydney:20260813T003000
SUMMARY:Late call
END:VEVENT`;

/** An event carrying a Teams-style join URL, plus a hostile one that must lose. */
export const MEETING_URL_EVENT = `BEGIN:VEVENT
UID:synthetic-url-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T100000
DTEND;TZID=Australia/Sydney:20260812T110000
SUMMARY:L&D Team Meeting
X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.example.com/l/meetup-join/synthetic
END:VEVENT`;

export const UNSAFE_URL_EVENT = `BEGIN:VEVENT
UID:synthetic-url-2
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T160000
DTEND;TZID=Australia/Sydney:20260812T163000
SUMMARY:Reminder
URL:javascript:alert(1)
END:VEVENT`;

/** A `VEVENT` with no `UID` — unidentifiable, and therefore skipped. */
export const MALFORMED_EVENT_NO_UID = `BEGIN:VEVENT
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T120000
DTEND;TZID=Australia/Sydney:20260812T123000
SUMMARY:Anonymous event
END:VEVENT`;

/**
 * A daily series that started two years BEFORE the reference window.
 *
 * The regression fixture for the bound that counted steps from `DTSTART` rather
 * than in-window occurrences: a series older than about thirteen months spent
 * its whole per-series allowance walking towards the window and contributed
 * nothing, so a long-running stand-up silently vanished from every schedule
 * while it was still recurring.
 */
export const LONG_RUNNING_DAILY_SERIES = `BEGIN:VEVENT
UID:synthetic-long-daily
DTSTAMP:20240801T000000Z
DTSTART;TZID=Australia/Sydney:20240812T070000
DTEND;TZID=Australia/Sydney:20240812T073000
RRULE:FREQ=DAILY
SUMMARY:Long-running stand-up
END:VEVENT`;

/** A recurrence rule that would expand without bound if nothing stopped it. */
export const RECURRENCE_BOMB = `BEGIN:VEVENT
UID:synthetic-bomb-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T000000
DTEND;TZID=Australia/Sydney:20260812T000100
RRULE:FREQ=MINUTELY
SUMMARY:Recurrence bomb
END:VEVENT`;

/** What a published-calendar link returns when it has become a sign-in page. */
export const HTML_NOT_CALENDAR =
  "<!doctype html><html><head><title>Sign in</title></head><body>Sign in</body></html>";

/** The ordinary "one work calendar" feed used by the sync and route tests. */
export function workCalendarFeed(): string {
  return icsCalendar(
    SYDNEY_VTIMEZONE,
    TIMED_EVENT,
    ALL_DAY_EVENT,
    MEETING_URL_EVENT,
    FOLDED_AND_ESCAPED_EVENT,
    WEEKLY_SERIES_WITH_EXCEPTIONS,
  );
}

/** A second, smaller feed, so "multiple sources merge" is a real assertion. */
export function personalCalendarFeed(): string {
  return icsCalendar(
    SYDNEY_VTIMEZONE,
    `BEGIN:VEVENT
UID:synthetic-personal-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20260812T163000
DTEND;TZID=Australia/Sydney:20260812T170000
SUMMARY:Dentist
LOCATION:High Street
END:VEVENT`,
    MULTI_DAY_ALL_DAY_EVENT,
  );
}

/**
 * A `fetch` stand-in for the tests, so the whole fetch/redirect/limit path runs
 * without a network. Keyed by URL; anything unknown 404s, which is itself a case
 * worth exercising.
 */
export function stubFetcher(
  routes: Readonly<
    Record<
      string,
      | {
          readonly status?: number;
          readonly body: string;
          readonly headers?: Record<string, string>;
        }
      | { readonly status: number; readonly location: string }
    >
  >,
): (url: string, init: RequestInit) => Promise<Response> {
  return async (url) => {
    const route = routes[url];
    if (route === undefined) {
      return new Response("not found", { status: 404 });
    }
    if ("location" in route) {
      return new Response(null, {
        status: route.status,
        headers: { location: route.location },
      });
    }
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { "content-type": "text/calendar", ...(route.headers ?? {}) },
    });
  };
}
