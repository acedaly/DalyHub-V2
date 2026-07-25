/**
 * DIARY-01A Diary kernel — pure day/month grouping of a Timeline page.
 *
 * Chronology is the Diary's primary organising principle, and the Timeline
 * renders entries grouped under day (and, later, month) headings. That grouping
 * is a PURE transform over a page of entries — no storage, no UI.
 *
 * Grouping is done over each entry's `occurredAt` (its position in time, NEVER
 * its `createdAt`) resolved into a DISPLAY TIME ZONE — normally the active
 * user/workspace time zone. A Diary Entry stores a UTC instant plus the IANA
 * time zone captured at occurrence PRECISELY so the Timeline can be grouped and
 * labelled by LOCAL wall-clock days, not UTC days: an entry at 23:30 in Sydney
 * belongs under that Sydney calendar day, not the previous UTC day. Grouping by
 * UTC would silently misfile such an entry, so the display time zone is an
 * EXPLICIT, required argument here — there is no hidden UTC (or machine-local)
 * default.
 *
 * Using `Intl.DateTimeFormat` with an EXPLICIT `timeZone` is deterministic and
 * hydration-safe: the same instant + zone yields the same key on the server and
 * the client, independent of the machine's local zone (the hazard DS-05 avoids
 * is machine-local formatting, not an explicitly-zoned format). It preserves the
 * page's order and coalesces the CONTIGUOUS run of entries that share a key —
 * which, for an occurred-at-ordered page (the only order the repository
 * returns), is exactly one group per local day.
 */

import type { DiaryEntry } from "./diary-entry";
import { DiaryValidationError } from "./diary-errors";

/** A contiguous run of Timeline entries that share a local day. */
export type DiaryDayGroup = {
  /** The local day key, `YYYY-MM-DD`, in the display time zone. */
  readonly day: string;
  /** The entries in this group, in the page's original order. */
  readonly entries: readonly DiaryEntry[];
};

/** A contiguous run of Timeline entries that share a local month. */
export type DiaryMonthGroup = {
  /** The local month key, `YYYY-MM`, in the display time zone. */
  readonly month: string;
  /** The entries in this group, in the page's original order. */
  readonly entries: readonly DiaryEntry[];
};

/** The local calendar parts of an instant in a given time zone. */
type LocalParts = { year: string; month: string; day: string };

/**
 * Build a resolver from an instant to its `{year, month, day}` in `timeZone`.
 * The formatter is created once per grouping call and reused for every entry
 * (never one per entry). An invalid IANA zone is rejected as a typed validation
 * error rather than throwing a raw `RangeError`.
 */
function localPartsResolver(timeZone: string): (instant: Date) => LocalParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new DiaryValidationError(
      "timezone",
      "must be a valid IANA time zone",
    );
  }
  return (instant: Date): LocalParts => {
    const parts = formatter.formatToParts(instant);
    const get = (type: string): string =>
      parts.find((part) => part.type === type)?.value ?? "";
    return { year: get("year"), month: get("month"), day: get("day") };
  };
}

/** The local `YYYY-MM-DD` day key for an instant in `timeZone`. */
export function toLocalDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = localPartsResolver(timeZone)(instant);
  return `${year}-${month}-${day}`;
}

/** The local `YYYY-MM` month key for an instant in `timeZone`. */
export function toLocalMonthKey(instant: Date, timeZone: string): string {
  const { year, month } = localPartsResolver(timeZone)(instant);
  return `${year}-${month}`;
}

/**
 * Group a Timeline page into contiguous local-day groups, resolving each entry's
 * `occurredAt` in the given DISPLAY time zone (normally the active
 * user/workspace zone). The zone is required and validated.
 */
export function groupEntriesByDay(
  entries: readonly DiaryEntry[],
  timeZone: string,
): readonly DiaryDayGroup[] {
  const partsOf = localPartsResolver(timeZone);
  const groups: DiaryDayGroup[] = [];
  let current: { day: string; entries: DiaryEntry[] } | null = null;
  for (const entry of entries) {
    const { year, month, day } = partsOf(entry.occurredAt);
    const key = `${year}-${month}-${day}`;
    if (current && current.day === key) {
      current.entries.push(entry);
    } else {
      current = { day: key, entries: [entry] };
      groups.push(current);
    }
  }
  return groups;
}

/**
 * Group a Timeline page into contiguous local-month groups, resolving each
 * entry's `occurredAt` in the given DISPLAY time zone. The zone is required and
 * validated.
 */
export function groupEntriesByMonth(
  entries: readonly DiaryEntry[],
  timeZone: string,
): readonly DiaryMonthGroup[] {
  const partsOf = localPartsResolver(timeZone);
  const groups: DiaryMonthGroup[] = [];
  let current: { month: string; entries: DiaryEntry[] } | null = null;
  for (const entry of entries) {
    const { year, month } = partsOf(entry.occurredAt);
    const key = `${year}-${month}`;
    if (current && current.month === key) {
      current.entries.push(entry);
    } else {
      current = { month: key, entries: [entry] };
      groups.push(current);
    }
  }
  return groups;
}
