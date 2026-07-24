/**
 * DIARY-01A Diary kernel — pure day/month grouping of a Timeline page.
 *
 * Chronology is the Diary's primary organising principle, and the Timeline
 * renders entries grouped under day (and, later, month) headings. That grouping
 * is a PURE transform over a page of entries — no storage, no UI, no `Intl`
 * (a hydration-safe manual UTC format, mirroring the DS-05 date seam). Keeping
 * it in the kernel means the future Desktop Timeline and Mobile Capture UIs
 * share one correct implementation instead of each re-deriving day boundaries.
 *
 * Grouping is done over the entry's `occurredAt` (its position in time), NEVER
 * its `createdAt`. It preserves the page's existing order and coalesces the
 * CONTIGUOUS run of entries that share a key — which, for an occurred-at-ordered
 * page (the only order the repository returns), is exactly one group per day.
 */

import type { DiaryEntry } from "./diary-entry";

/** A contiguous run of Timeline entries that share a UTC day. */
export type DiaryDayGroup = {
  /** The UTC day key, `YYYY-MM-DD`. */
  readonly day: string;
  /** The entries in this group, in the page's original order. */
  readonly entries: readonly DiaryEntry[];
};

/** A contiguous run of Timeline entries that share a UTC month. */
export type DiaryMonthGroup = {
  /** The UTC month key, `YYYY-MM`. */
  readonly month: string;
  /** The entries in this group, in the page's original order. */
  readonly entries: readonly DiaryEntry[];
};

/** Left-pad an integer to two digits without `Intl`/locale involvement. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The UTC `YYYY-MM-DD` key for an instant. */
export function toUtcDayKey(instant: Date): string {
  return `${instant.getUTCFullYear()}-${pad2(instant.getUTCMonth() + 1)}-${pad2(
    instant.getUTCDate(),
  )}`;
}

/** The UTC `YYYY-MM` key for an instant. */
export function toUtcMonthKey(instant: Date): string {
  return `${instant.getUTCFullYear()}-${pad2(instant.getUTCMonth() + 1)}`;
}

/** Group a Timeline page into contiguous UTC-day groups. */
export function groupEntriesByDay(
  entries: readonly DiaryEntry[],
): readonly DiaryDayGroup[] {
  const groups: DiaryDayGroup[] = [];
  let current: { day: string; entries: DiaryEntry[] } | null = null;
  for (const entry of entries) {
    const day = toUtcDayKey(entry.occurredAt);
    if (current && current.day === day) {
      current.entries.push(entry);
    } else {
      current = { day, entries: [entry] };
      groups.push(current);
    }
  }
  return groups;
}

/** Group a Timeline page into contiguous UTC-month groups. */
export function groupEntriesByMonth(
  entries: readonly DiaryEntry[],
): readonly DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  let current: { month: string; entries: DiaryEntry[] } | null = null;
  for (const entry of entries) {
    const month = toUtcMonthKey(entry.occurredAt);
    if (current && current.month === month) {
      current.entries.push(entry);
    } else {
      current = { month, entries: [entry] };
      groups.push(current);
    }
  }
  return groups;
}
