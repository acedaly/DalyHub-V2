/**
 * DS-05 — the central date-formatting seam (React-free).
 *
 * Every day/timestamp string in the Timeline and Activity Feed flows through ONE
 * `ActivityDateFormatter` so date logic is never scattered through components, and
 * so the server and client render byte-identical text (no hydration mismatch).
 *
 * Hydration safety is achieved by formatting **manually against UTC getters** with
 * fixed English month/weekday tables — NOT `Intl.DateTimeFormat`, whose output can
 * differ between the Workers runtime and a browser (ICU/locale-data variance) and
 * whose default timezone is the machine's. Kernel `occurredAt` timestamps are UTC
 * instants; grouping and headings are computed on the UTC calendar day, so an event
 * lands in the same day bucket regardless of the viewer's timezone.
 *
 * Relative headings ("Today"/"Yesterday") are opt-in via `now`: the caller threads
 * a single server-rendered reference instant so both renders agree. With no `now`,
 * headings are absolute and fully deterministic.
 */

import type { ActivityDateFormatter } from "./types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Stable UTC-day key, e.g. `"2026-07-19"`. */
export function utcDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

/** The integer count of whole UTC days since the epoch — for stable day diffs. */
function utcDayIndex(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

/** Options for the shared date formatter. */
export interface ActivityDateFormatterOptions {
  /**
   * A reference "now" instant (server-rendered and threaded to the client) that
   * enables the relative "Today"/"Yesterday" headings. Omit for absolute headings.
   */
  readonly now?: Date;
}

/**
 * Build the shared, deterministic date formatter. All formatting is UTC-based and
 * locale-independent, so it is safe to call identically on server and client.
 */
export function createActivityDateFormatter(
  options: ActivityDateFormatterOptions = {},
): ActivityDateFormatter {
  const nowIndex = options.now !== undefined ? utcDayIndex(options.now) : null;

  const formatDayHeading = (date: Date): string => {
    if (nowIndex !== null) {
      const diff = nowIndex - utcDayIndex(date);
      if (diff === 0) {
        return "Today";
      }
      if (diff === 1) {
        return "Yesterday";
      }
    }
    const weekday = WEEKDAYS[date.getUTCDay()];
    return `${weekday}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  };

  const formatTimeOfDay = (date: Date): string =>
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;

  return {
    dayKey: utcDayKey,
    dayStart: (date) =>
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      ),
    formatDayHeading,
    formatTimeOfDay,
    formatAbsolute: (date) =>
      `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} at ${formatTimeOfDay(date)} UTC`,
    toDateTimeAttr: (date) => date.toISOString(),
  };
}

/** A process-wide default formatter (absolute headings; no relative labels). */
export const defaultActivityDateFormatter = createActivityDateFormatter();
