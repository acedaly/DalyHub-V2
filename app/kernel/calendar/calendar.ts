/**
 * CAL-01 Calendar kernel — the domain vocabulary and the bounds.
 *
 * ── The architectural boundary this file exists to hold ─────────────────────
 * An **external calendar event** answers *what is happening at this time?* and
 * is owned by the external calendar. A **DalyHub Meeting** answers *what do I
 * need to prepare, capture, decide and follow up?* and is owned by DalyHub. They
 * are different concepts, so:
 *
 *     ExternalCalendarEvent  →  may link to  →  Meeting
 *
 * and never `ExternalCalendarEvent = Meeting`. Lunch, leave, focus time, travel,
 * the school concert and a recurring commute block are all calendar events; none
 * of them is a Meeting, and nothing in this module can turn one into a Meeting
 * without an explicit owner action (CAL-03).
 *
 * Everything here is a PROJECTION of an external source. It is disposable: it
 * can be pruned, re-imported and rebuilt from the feed at any time, which is
 * exactly why it appends no Activity (a projection is not history) and why the
 * durable Meeting link is keyed on external IDENTITY rather than on a row id.
 */

/**
 * A presentational guess at which product publishes a feed, derived from the
 * feed host alone.
 *
 * Presentation ONLY. Nothing in the domain, the synchroniser or the read model
 * branches on it: a source is an RFC 5545 feed, and the day the guess is wrong
 * the product still works. It exists so Settings can say "Outlook calendar"
 * under a source the owner named "Work", which is the difference between a list
 * the owner recognises and a list of URLs they have to remember.
 */
export type CalendarProviderHint =
  "outlook" | "apple" | "google" | "fastmail" | "generic";

/** Owner-facing words for a provider hint. The only place these are written. */
export const CALENDAR_PROVIDER_LABELS: Readonly<
  Record<CalendarProviderHint, string>
> = {
  outlook: "Outlook calendar",
  apple: "Apple calendar",
  google: "Google calendar",
  fastmail: "Fastmail calendar",
  generic: "Calendar feed",
};

/**
 * How the last refresh of a source went.
 *
 * `never` is a first-class value rather than "null means never", because the UI
 * has to distinguish "we have not tried" from "we tried and it worked" and from
 * "we tried and it failed". Saying "Connected" for a feed that has never loaded
 * is precisely the untruth CAL-01 forbids.
 */
export type CalendarSyncStatus = "never" | "ok" | "failed";

/**
 * The closed set of refresh failures.
 *
 * A CODE, never a message and never the remote body: a feed can return anything
 * at all, including an HTML sign-in page or a stack trace, and none of it may
 * reach a log line, an error string or the owner's screen. The owner-facing
 * sentence for each code is written once, in `calendar-messages.ts`.
 */
export type CalendarSyncErrorCode =
  | "unreachable"
  | "timeout"
  | "unauthorised"
  | "not_found"
  | "server_error"
  | "not_calendar"
  | "too_large"
  | "unparseable"
  | "too_many_events"
  | "blocked_target"
  | "too_many_redirects"
  | "not_configured"
  | "storage";

/** A configured external calendar source, as the domain sees it. Never the URL. */
export interface CalendarSource {
  readonly id: string;
  readonly workspaceId: string;
  /** The owner's name for it — "Work", "Personal", "Kids". Display text. */
  readonly name: string;
  readonly providerHint: CalendarProviderHint;
  readonly enabled: boolean;
  readonly lastSyncAttemptAt: Date | null;
  readonly lastSyncSuccessAt: Date | null;
  readonly lastSyncStatus: CalendarSyncStatus;
  readonly lastSyncErrorCode: CalendarSyncErrorCode | null;
  /** How many occurrences the last SUCCESSFUL refresh left in the window. */
  readonly eventCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * An external event's cancellation state, from `STATUS` and from
 * `METHOD:CANCEL` handling.
 *
 * A cancelled occurrence is KEPT rather than deleted, because "the 10:00 is
 * cancelled" is information the owner needs on the day — and because a linked
 * DalyHub Meeting must never be cancelled or deleted by a refresh (CAL-01 §24).
 */
export type ExternalEventStatus = "confirmed" | "tentative" | "cancelled";

/**
 * One occurrence of an external calendar event, as stored and as read.
 *
 * ── Identity ────────────────────────────────────────────────────────────────
 * `(sourceId, externalUid, occurrenceKey)` is the durable identity, and it is
 * what every refresh matches on — never the title and never the time. "Meeting
 * with Bob" moving from 10:00 to 11:00 is the SAME event; two different events
 * both called "Standup" are not the same event.
 *
 * `occurrenceKey` is the empty string for a non-recurring event and the ORIGINAL
 * slot of the occurrence (as a UTC instant) for a recurring one — the value RFC
 * 5545 calls `RECURRENCE-ID`. Using the original slot rather than the current
 * start is what makes a MOVED occurrence keep its identity: Outlook shifting the
 * 10 August instance to 11:30 updates a row, it does not create one.
 *
 * ── Privacy minimisation (CAL-01 §14) ───────────────────────────────────────
 * There is no `description`, no `attendees`, no `organiser`, no attachment and
 * no provider-specific property here, and there is deliberately nowhere to put
 * one. DalyHub imports what a schedule needs to be legible and nothing else, so
 * the amount of external (often work) information copied into a personal system
 * stays as small as the feature allows.
 */
export interface ExternalCalendarEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly sourceId: string;
  readonly externalUid: string;
  readonly occurrenceKey: string;
  readonly title: string;
  /** The occurrence start, as a UTC instant. */
  readonly startsAt: Date;
  /** The occurrence end, as a UTC instant. Exclusive, as ICS defines it. */
  readonly endsAt: Date;
  readonly allDay: boolean;
  /**
   * The FIRST calendar date an all-day item covers (`YYYY-MM-DD`), or null for a
   * timed event.
   *
   * All-day items are floating calendar dates, not instants: "Annual leave, 12
   * August" is 12 August wherever the owner is standing. Storing the dates as
   * dates is what stops a timezone conversion moving a public holiday to the day
   * before, and it is why the read model never renders an all-day item at 00:00.
   */
  readonly allDayStartDate: string | null;
  /** The LAST calendar date an all-day item covers, inclusive. */
  readonly allDayEndDate: string | null;
  /** The IANA zone the source stated for a timed event, when it stated one. */
  readonly timezone: string | null;
  readonly location: string | null;
  /** An online meeting URL, only when one was reliably extractable. */
  readonly meetingUrl: string | null;
  readonly status: ExternalEventStatus;
  /** The feed's own `LAST-MODIFIED`/`DTSTAMP`, when it supplied one. */
  readonly sourceUpdatedAt: Date | null;
  /** When this occurrence was last present in a successful refresh. */
  readonly lastSeenAt: Date;
}

/**
 * The durable external identity a DalyHub Meeting is linked to.
 *
 * Deliberately NOT the event row's id. A projection row can be pruned by the
 * retention window and re-imported later with a new id; the Meeting the owner
 * wrote notes in must survive that, so the link is keyed on the identity the
 * external calendar itself guarantees.
 */
export interface ExternalOccurrenceIdentity {
  readonly sourceId: string;
  readonly externalUid: string;
  readonly occurrenceKey: string;
}

/** One durable external-occurrence → Meeting mapping. */
export interface ExternalCalendarMeetingLink extends ExternalOccurrenceIdentity {
  readonly meetingId: string;
  readonly createdAt: Date;
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The synchronisation window, in days either side of the owner's today.
 *
 * DalyHub needs today, tomorrow, the next seven days, a little upcoming meeting
 * preparation and modest recent context — not a mirror of a decade of Outlook.
 * 30/90 is the smallest window that serves all five with room for a monthly
 * series to be visible before it happens, and it bounds every downstream cost:
 * the rows stored, the occurrences expanded, and the work a hostile feed can
 * cause.
 */
export const SYNC_WINDOW_PAST_DAYS = 30;
export const SYNC_WINDOW_FUTURE_DAYS = 90;

/**
 * How many sources one workspace may hold.
 *
 * Not a licensing limit — a bound on scheduled work. Each source is a network
 * fetch and a parse on every cron tick, and a personal deployment with more than
 * ten calendars has a different problem than this feature solves.
 */
export const MAX_CALENDAR_SOURCES = 10;

/** The largest feed body that will be read, in bytes. Beyond it, `too_large`. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

/** How long a single feed fetch may take before it is abandoned. */
export const FEED_TIMEOUT_MS = 10_000;

/** How many redirects are followed, each revalidated against the URL policy. */
export const MAX_FEED_REDIRECTS = 3;

/** How many `VEVENT` components are read from one feed before it is refused. */
export const MAX_FEED_COMPONENTS = 5_000;

/**
 * How many occurrences ONE recurring series may contribute to the window.
 *
 * A daily series over 120 days is 120; a rule that produces more than this in a
 * four-month window is either a mistake or an attempt to make the synchroniser
 * do unbounded work, and neither deserves to run to completion. The expansion
 * stops and the series is truncated rather than the refresh failing, so one
 * pathological rule cannot cost the owner every other event in the feed.
 */
export const MAX_SERIES_OCCURRENCES = 400;

/**
 * How many occurrences one recurring series may be STEPPED through, in total,
 * while its window is being filled.
 *
 * A second, larger budget than {@link MAX_SERIES_OCCURRENCES}, and it bounds a
 * different thing: that one bounds what a series may CONTRIBUTE, this one bounds
 * the WORK done to find it. The two are not the same, because an expansion can
 * legitimately emit occurrences the window rejects — a series whose seek lands
 * just before the window, or one with a long run of `EXDATE`s.
 *
 * Without it, a rule that emits nothing acceptable would loop until the rule
 * itself ended, which for an unbounded `RRULE` is never. With only it, a
 * pathological rule could still fill the window with tens of thousands of rows.
 *
 * 5,000 steps is chosen against the frequencies CAL-01 must support, measured
 * from how far before the window a series may have started:
 *
 *   | Frequency | 5,000 steps reaches back |
 *   |---|---|
 *   | monthly | 416 years |
 *   | weekly | 95 years |
 *   | daily | 13.7 years |
 *   | hourly | 208 days |
 *   | minutely | 3.5 days |
 *
 * So every realistic long-running meeting is covered with room to spare, and a
 * series finer than hourly that began long ago is TRUNCATED — which the caller
 * then refuses to reconcile, so the owner is told the feed is too large rather
 * than silently given a partial day.
 */
export const MAX_SERIES_STEPS = 5_000;

/**
 * How many occurrences one SOURCE may contribute to the window.
 *
 * The overall ceiling on a single refresh's write volume. A feed past it is
 * refused with `too_many_events` rather than half-imported, because a partial
 * schedule that looks complete is worse than a source that says it failed.
 */
export const MAX_SOURCE_OCCURRENCES = 2_000;

/** The longest owner-supplied source name. */
export const CALENDAR_SOURCE_NAME_MAX_LENGTH = 60;

/** The longest external field values kept. Longer values are truncated, not refused. */
export const EXTERNAL_TITLE_MAX_LENGTH = 240;
export const EXTERNAL_LOCATION_MAX_LENGTH = 240;
export const EXTERNAL_URL_MAX_LENGTH = 1024;
