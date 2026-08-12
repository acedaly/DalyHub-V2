/**
 * CAL-01 — the ICS parser adaptation: `ical.js` in, bounded occurrences out.
 *
 * ── Why a library, and why this one ─────────────────────────────────────────
 * RFC 5545 is not a format you split on `BEGIN:VEVENT`. A conforming feed folds
 * long lines at 75 octets, escapes commas, semicolons and newlines inside TEXT
 * values, carries `VTIMEZONE` components that define their own DST rules,
 * expresses recurrence as `RRULE` plus `RDATE` minus `EXDATE`, and expresses
 * exceptions to a series as SEPARATE `VEVENT`s bound to the master by
 * `RECURRENCE-ID`. A string-splitting or regular-expression parser gets the
 * simple cases right and is silently wrong about a moved meeting, a cancelled
 * occurrence and every event during a DST transition — which is precisely the
 * set of cases a schedule has to be right about.
 *
 * `ical.js` (mozilla-comm, MPL-2.0, v2.2.1) was chosen because:
 *
 *   - it is the reference JavaScript implementation of RFC 5545, maintained by
 *     the Mozilla calendar project and used by Thunderbird's calendar;
 *   - it is **zero-dependency, pure JavaScript, with no Node built-ins** — no
 *     `fs`, no `Buffer`, no `stream` — so it runs unchanged in the Workers
 *     runtime. Verified by the Workers-pool tests in
 *     `test/kernel/calendar-ics-parser.test.ts`, which exercise it inside the
 *     real runtime rather than in Node;
 *   - it implements `VTIMEZONE` registration and `ICAL.Event`'s exception
 *     relation, which are the two pieces a correct expansion cannot do without;
 *   - it is ~78 KB minified and is imported ONLY from this `.server.ts` module,
 *     so it never enters a browser bundle.
 *
 * **Licensing.** MPL-2.0 is file-level weak copyleft, which AGENTS.md §11 places
 * in "requires an explicit, documented decision". The decision, the isolation
 * (an unmodified npm dependency, never vendored and never patched) and the
 * notice are recorded in `THIRD_PARTY_NOTICES.md` and in ADR-091.
 *
 * ── What this module is NOT ─────────────────────────────────────────────────
 * Not a calendar framework, not a re-export of `ical.js`, and not a general ICS
 * toolkit. Exactly one function crosses its boundary — "give me the occurrences
 * in this window" — and `ical.js` types do not appear in its signature. If the
 * parser is ever replaced, this file is the whole of the change.
 *
 * ── The bounds, which are the security control ──────────────────────────────
 * A feed is untrusted input from a server DalyHub does not run. Every loop below
 * is bounded: components read, occurrences per series, occurrences per source,
 * and the window itself. A `RRULE` of `FREQ=SECONDLY` is a legal recurrence rule
 * and would otherwise be an unbounded write loop.
 *
 * One malformed `VEVENT` is SKIPPED rather than failing the refresh: a feed with
 * one bad row still has a useful day in it, and refusing all of it would let a
 * single broken event hide a whole calendar.
 */

import ICAL from "ical.js";

import {
  EXTERNAL_LOCATION_MAX_LENGTH,
  EXTERNAL_TITLE_MAX_LENGTH,
  EXTERNAL_URL_MAX_LENGTH,
  MAX_FEED_COMPONENTS,
  MAX_SERIES_OCCURRENCES,
  MAX_SERIES_STEPS,
  MAX_SOURCE_OCCURRENCES,
  boundedExternalText,
  type ExternalEventStatus,
  type ParsedOccurrence,
} from "~/kernel/calendar";

/** Why a whole feed could not be read. Mapped to a sync error code by the caller. */
export type IcsParseFailure =
  "not_calendar" | "unparseable" | "too_many_events";

export class IcsParseError extends Error {
  constructor(readonly failure: IcsParseFailure) {
    super(`The calendar feed could not be read (${failure}).`);
    this.name = "IcsParseError";
  }
}

export interface IcsParseResult {
  readonly occurrences: readonly ParsedOccurrence[];
  /**
   * How many `VEVENT`s were skipped because they could not be read.
   *
   * Surfaced so a source that is mostly broken is not silently reported as
   * healthy. It is a COUNT: the offending content is never carried out.
   */
  readonly skipped: number;
  /** True when a series or the source hit its bound and was truncated. */
  readonly truncated: boolean;
}

/**
 * The cheapest possible "is this even a calendar?" check, run before parsing.
 *
 * The single most common failure of a published calendar link is that it has
 * been pasted from the browser address bar and returns an HTML sign-in page.
 * Feeding several megabytes of HTML to a strict parser to discover that is
 * wasteful and produces a worse message than saying so directly.
 */
export function looksLikeCalendar(body: string): boolean {
  // `BEGIN:VCALENDAR` must appear near the top; a BOM, blank lines and CRLF are
  // all normal ahead of it.
  return /^[\s\uFEFF]*BEGIN:VCALENDAR/i.test(body.slice(0, 4096));
}

/** Read a property as trimmed, bounded, single-line text, or null. */
function textProperty(
  component: ICAL.Component,
  name: string,
  maxLength: number,
): string | null {
  const raw = component.getFirstPropertyValue(name);
  if (typeof raw !== "string") return null;
  return boundedExternalText(raw, maxLength);
}

/**
 * The one online-meeting URL DalyHub will offer to open, or null.
 *
 * Reliability is the bar, not coverage. Three sources are consulted, in order of
 * how strongly each MEANS "join here":
 *
 *   1. `X-MICROSOFT-SKYPETEAMSMEETINGURL` — Microsoft's explicit join field;
 *   2. `CONFERENCE` (RFC 7986) with `VALUE=URI` — the standard's own field;
 *   3. `URL` — the event's canonical URL, which Outlook and iCloud both use for
 *      the join link when one exists.
 *
 * The event DESCRIPTION is deliberately not scanned. Body text is exactly what
 * CAL-01 refuses to import, and finding a URL in it would mean reading it.
 *
 * Only `https:` survives. A `mailto:`, `data:` or `javascript:` value in a feed
 * DalyHub does not control must never become a link the owner can press.
 */
function meetingUrlFor(component: ICAL.Component): string | null {
  const candidates: unknown[] = [
    component.getFirstPropertyValue("x-microsoft-skypeteamsmeetingurl"),
    component.getFirstPropertyValue("conference"),
    component.getFirstPropertyValue("url"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || trimmed.length > EXTERNAL_URL_MAX_LENGTH) {
      continue;
    }
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Not a URL. Try the next candidate rather than failing the event.
    }
  }
  return null;
}

/** `STATUS`, mapped onto the closed domain vocabulary. */
function statusFor(component: ICAL.Component): ExternalEventStatus {
  const raw = component.getFirstPropertyValue("status");
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (value === "CANCELLED") return "cancelled";
  if (value === "TENTATIVE") return "tentative";
  return "confirmed";
}

/** `LAST-MODIFIED`, else `DTSTAMP`, as an instant. Recorded, never compared. */
function sourceUpdatedAt(component: ICAL.Component): Date | null {
  for (const name of ["last-modified", "dtstamp"]) {
    const value = component.getFirstPropertyValue(name);
    if (value instanceof ICAL.Time) {
      const date = value.toJSDate();
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

/** `YYYY-MM-DD` from an ICAL date-only value, without any timezone conversion. */
function floatingDate(time: ICAL.Time): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

/**
 * The stable occurrence key: the ORIGINAL slot, as a UTC instant.
 *
 * The original slot rather than the current start, so a moved occurrence keeps
 * its identity. Truncated to seconds, because a feed that re-emits the same slot
 * with sub-second noise would otherwise look like a new occurrence.
 */
function occurrenceKeyFor(recurrenceId: ICAL.Time | null): string {
  if (recurrenceId === null) return "";
  const date = recurrenceId.toJSDate();
  if (Number.isNaN(date.getTime())) return "";
  return `${Math.floor(date.getTime() / 1000)}`;
}

/**
 * Build one occurrence from a resolved (start, end, component) triple.
 *
 * `component` is the master for an ordinary occurrence and the EXCEPTION's own
 * component for a modified one, which is what makes a changed title or location
 * on a single instance land on that instance alone.
 */
function toOccurrence(input: {
  readonly uid: string;
  readonly occurrenceKey: string;
  readonly component: ICAL.Component;
  readonly start: ICAL.Time;
  readonly end: ICAL.Time;
}): ParsedOccurrence | null {
  const { start, end } = input;
  const startDate = start.toJSDate();
  const endDate = end.toJSDate();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  const allDay = start.isDate;
  const title =
    textProperty(input.component, "summary", EXTERNAL_TITLE_MAX_LENGTH) ??
    "Untitled event";

  // An all-day DTEND is EXCLUSIVE in ICS, so a one-day event ends on the next
  // date. The inclusive last day is what a human means by "12 to 14 August",
  // and it is what the day-membership query compares against.
  let allDayStartDate: string | null = null;
  let allDayEndDate: string | null = null;
  if (allDay) {
    allDayStartDate = floatingDate(start);
    const exclusiveEnd = end.isDate ? floatingDate(end) : allDayStartDate;
    const inclusive = new Date(
      Math.max(
        Date.parse(`${allDayStartDate}T00:00:00Z`),
        Date.parse(`${exclusiveEnd}T00:00:00Z`) - 86_400_000,
      ),
    );
    allDayEndDate = inclusive.toISOString().slice(0, 10);
  }

  // A zone is recorded only when the feed genuinely stated one. `Z` (UTC) and a
  // floating time both leave it null rather than inventing a zone the source
  // did not claim.
  const zone = start.zone;
  const timezone =
    !allDay && zone && zone.tzid && zone.tzid !== "floating" ? zone.tzid : null;

  return {
    externalUid: input.uid,
    occurrenceKey: input.occurrenceKey,
    title,
    startsAt: startDate,
    // A missing or inverted end is normalised to the start, so an event is never
    // stored as ending before it begins.
    endsAt: endDate.getTime() < startDate.getTime() ? startDate : endDate,
    allDay,
    allDayStartDate,
    allDayEndDate,
    timezone: timezone === null ? null : boundedExternalText(timezone, 64),
    location: textProperty(
      input.component,
      "location",
      EXTERNAL_LOCATION_MAX_LENGTH,
    ),
    meetingUrl: meetingUrlFor(input.component),
    status: statusFor(input.component),
    sourceUpdatedAt: sourceUpdatedAt(input.component),
  };
}

/**
 * Parse a feed and return every occurrence overlapping `[from, to)`.
 *
 * Overlap, not containment: an event that started yesterday and is still running
 * is on today, and a three-day all-day block is on all three days.
 */
export function parseIcsOccurrences(input: {
  readonly body: string;
  readonly from: Date;
  readonly to: Date;
}): IcsParseResult {
  if (!looksLikeCalendar(input.body)) {
    throw new IcsParseError("not_calendar");
  }

  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(input.body));
  } catch {
    throw new IcsParseError("unparseable");
  }

  /*
   * Register the feed's own VTIMEZONE definitions before reading any event.
   *
   * Without this, `DTSTART;TZID=Australia/Sydney:20260803T100000` cannot be
   * resolved to an instant and `ical.js` falls back to floating time — which is
   * wrong by the UTC offset for every event in the feed, and wrong by a
   * different amount either side of a DST transition. Registration is scoped to
   * this parse and unregistered afterwards, so one feed's idea of a zone can
   * never leak into another feed's parse.
   */
  const registered: string[] = [];
  try {
    for (const zoneComponent of calendar.getAllSubcomponents("vtimezone")) {
      try {
        const zone = new ICAL.Timezone(zoneComponent);
        if (zone.tzid && !ICAL.TimezoneService.has(zone.tzid)) {
          ICAL.TimezoneService.register(zone, zone.tzid);
          registered.push(zone.tzid);
        }
      } catch {
        // A malformed VTIMEZONE is skipped; events referencing it fall back to
        // floating time, which is the same outcome as a feed that omitted it.
      }
    }

    const components = calendar.getAllSubcomponents("vevent");
    if (components.length > MAX_FEED_COMPONENTS) {
      throw new IcsParseError("too_many_events");
    }

    /*
     * Two passes, because RFC 5545 puts a series and its exceptions in separate
     * components and the master must know about its exceptions BEFORE it is
     * expanded — otherwise a moved instance is emitted twice (once at its old
     * slot by the rule, once at its new one) and a cancelled instance is emitted
     * as though it were still happening.
     */
    const masters: ICAL.Component[] = [];
    const exceptions: ICAL.Component[] = [];
    for (const component of components) {
      const recurrenceId = component.getFirstPropertyValue("recurrence-id");
      if (recurrenceId instanceof ICAL.Time) exceptions.push(component);
      else masters.push(component);
    }

    const fromMs = input.from.getTime();
    const toMs = input.to.getTime();
    const occurrences: ParsedOccurrence[] = [];
    const emitted = new Set<string>();
    let skipped = 0;
    let truncated = false;

    /** Keep an occurrence if it overlaps the window and is not a duplicate. */
    const accept = (occurrence: ParsedOccurrence | null): boolean => {
      if (occurrence === null) return false;
      const startMs = occurrence.startsAt.getTime();
      // A zero-length event (a reminder) still belongs to its instant, so the
      // end is treated as at least the start for the overlap test.
      const endMs = Math.max(occurrence.endsAt.getTime(), startMs + 1);
      if (endMs <= fromMs || startMs >= toMs) return false;
      const key = `${occurrence.externalUid} ${occurrence.occurrenceKey}`;
      if (emitted.has(key)) return false;
      emitted.add(key);
      occurrences.push(occurrence);
      return true;
    };

    /*
     * Exceptions FIRST.
     *
     * A `RECURRENCE-ID` component is the authoritative statement about that one
     * occurrence, including "it is cancelled". Emitting it first means the
     * expansion below cannot overwrite it, and it also handles the case a
     * publisher gets wrong surprisingly often: an exception whose master is not
     * in the feed at all.
     */
    for (const component of exceptions) {
      if (occurrences.length >= MAX_SOURCE_OCCURRENCES) {
        truncated = true;
        break;
      }
      try {
        const uid = component.getFirstPropertyValue("uid");
        const recurrenceId = component.getFirstPropertyValue("recurrence-id");
        const event = new ICAL.Event(component);
        if (
          typeof uid !== "string" ||
          uid.length === 0 ||
          !(recurrenceId instanceof ICAL.Time)
        ) {
          skipped += 1;
          continue;
        }
        accept(
          toOccurrence({
            uid,
            occurrenceKey: occurrenceKeyFor(recurrenceId),
            component,
            start: event.startDate,
            end: event.endDate,
          }),
        );
      } catch {
        skipped += 1;
      }
    }

    for (const component of masters) {
      if (occurrences.length >= MAX_SOURCE_OCCURRENCES) {
        truncated = true;
        break;
      }
      let event: ICAL.Event;
      let uid: string;
      try {
        event = new ICAL.Event(component);
        const value = component.getFirstPropertyValue("uid");
        if (typeof value !== "string" || value.length === 0) {
          skipped += 1;
          continue;
        }
        uid = value;
      } catch {
        skipped += 1;
        continue;
      }

      if (!event.isRecurring()) {
        try {
          accept(
            toOccurrence({
              uid,
              occurrenceKey: "",
              component,
              start: event.startDate,
              end: event.endDate,
            }),
          );
        } catch {
          skipped += 1;
        }
        continue;
      }

      // Bind this series' exceptions to it, so the iterator applies EXDATE,
      // moved instances and cancellations rather than re-emitting the rule.
      for (const exception of exceptions) {
        try {
          if (exception.getFirstPropertyValue("uid") === uid) {
            event.relateException(new ICAL.Event(exception));
          }
        } catch {
          // A malformed exception is ignored; the series still expands.
        }
      }

      try {
        /*
         * The expansion starts at `DTSTART`, and the BUDGETS are what changed.
         *
         * Seeding the iterator at the window (`event.iterator(time)`) looks like
         * the obvious fix and is wrong: `RecurExpansion` takes that value as the
         * series' `dtstart`, so it re-anchors the rule and emits a different
         * schedule entirely — measured, it produced occurrences on the window's
         * own start date rather than on the series' days.
         *
         * So the iteration is unchanged and the ACCOUNTING is fixed. See the two
         * budgets below.
         */
        const iterator = event.iterator();
        let produced = 0;
        /*
         * Two separate budgets, because they bound two different things — and
         * conflating them was a real defect.
         *
         * `produced` bounds what this series may CONTRIBUTE, and counts only
         * occurrences inside the window. It used to count every STEP from
         * `DTSTART`, so a series that began long before the window spent its
         * whole allowance walking towards it: a daily meeting started more than
         * ~13 months ago contributed ZERO rows and vanished from every schedule
         * while it was still recurring.
         *
         * `steps` bounds the WORK — the walk itself — because a rule that emits
         * nothing acceptable would otherwise loop until the rule ended, which
         * for an unbounded `RRULE` is never.
         */
        let steps = 0;
        for (;;) {
          if (produced >= MAX_SERIES_OCCURRENCES) {
            truncated = true;
            break;
          }
          if (steps >= MAX_SERIES_STEPS) {
            truncated = true;
            break;
          }
          if (occurrences.length >= MAX_SOURCE_OCCURRENCES) {
            truncated = true;
            break;
          }
          const next = iterator.next();
          if (!next) break;
          steps += 1;
          const nextMs = next.toJSDate().getTime();
          // Past the end of the window there is nothing further to find: the
          // expansion is ordered, so the loop stops rather than running the rule
          // to its own end.
          if (nextMs >= toMs) break;
          if (nextMs >= fromMs) produced += 1;

          const details = event.getOccurrenceDetails(next);
          // `getOccurrenceDetails` returns the EXCEPTION's component for a
          // modified instance, which is what makes a per-instance title,
          // location or cancellation land on that instance alone.
          const occurrenceComponent =
            details.item?.component ?? event.component;
          accept(
            toOccurrence({
              uid,
              occurrenceKey: occurrenceKeyFor(details.recurrenceId),
              component: occurrenceComponent,
              start: details.startDate,
              end: details.endDate,
            }),
          );
        }
      } catch {
        // A rule the expander cannot run costs this series, not the feed.
        skipped += 1;
      }
    }

    return { occurrences, skipped, truncated };
  } finally {
    for (const tzid of registered) {
      ICAL.TimezoneService.remove(tzid);
    }
  }
}
