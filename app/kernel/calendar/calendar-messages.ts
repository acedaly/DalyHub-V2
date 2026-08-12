/**
 * CAL-01 — the words the product uses about calendar synchronisation.
 *
 * Written once, here, for two reasons. The obvious one is that Settings, the
 * schedule surfaces and the tests must not each invent their own phrasing. The
 * load-bearing one is TRUTHFULNESS: every sentence below is checked against what
 * the stored state actually proves, so the product cannot say "Connected" about
 * a feed that has never successfully loaded, and cannot report a failed refresh
 * as a success. A remote response body never reaches any of these strings.
 */

import type { CalendarSource, CalendarSyncErrorCode } from "./calendar";

/**
 * The owner-facing sentence for each failure code.
 *
 * Each says what happened and, where there is one, what to do. None of them
 * quotes the remote server, names an internal component, or includes the feed
 * address — a failure message is exactly where a leaked credential would end up
 * in a screenshot or a support thread.
 */
export const CALENDAR_SYNC_ERROR_MESSAGES: Readonly<
  Record<CalendarSyncErrorCode, string>
> = {
  unreachable:
    "DalyHub could not reach this calendar. It may be offline, or the link may have been withdrawn.",
  timeout: "This calendar took too long to respond. DalyHub will try again.",
  unauthorised:
    "This calendar refused the request. The published link may have been reset — republish it and update the address here.",
  not_found:
    "This calendar address no longer exists. Republish the calendar and update the address here.",
  server_error:
    "The calendar service reported a problem. DalyHub will try again.",
  not_calendar:
    "That address did not return a calendar. Check that you copied the ICS or webcal link, not the page you view it on.",
  too_large: "This calendar is too large for DalyHub to read.",
  unparseable:
    "DalyHub could not read this calendar's contents. It may not be a standard calendar feed.",
  too_many_events:
    "This calendar has more events in the next few months than DalyHub imports.",
  blocked_target:
    "That address points at a private or local network, which DalyHub will not fetch.",
  too_many_redirects: "This calendar address redirects too many times.",
  not_configured:
    "Encrypted storage is not configured for this deployment, so calendar addresses cannot be stored or read.",
  storage: "DalyHub could not save this calendar's events. It will try again.",
};

/** "4 minutes ago" — the AGE, because that is what "is this fresh?" asks. */
export function relativeSyncAge(from: Date, now: Date): string {
  const seconds = Math.max(
    0,
    Math.round((now.getTime() - from.getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return "over a month ago";
}

/** How a source's freshness is described, and how loudly. */
export interface CalendarSyncSummary {
  /** The one line under the source's name. */
  readonly text: string;
  /** `danger` only when the LAST attempt failed — never for merely stale data. */
  readonly tone: "neutral" | "danger";
  /**
   * True when DalyHub is currently showing events from a refresh that is no
   * longer the latest attempt — a failure over a previously-good projection.
   * The surface says so rather than pretending the failed refresh succeeded.
   */
  readonly stale: boolean;
}

/**
 * Describe a source's sync state truthfully.
 *
 * The four states are genuinely different and are never collapsed:
 *
 *   - never synced — say so; do NOT say "Connected";
 *   - last refresh succeeded — say when;
 *   - last refresh failed, nothing ever succeeded — say the failure alone;
 *   - last refresh failed over an earlier success — say BOTH, because the events
 *     on screen are real but old, and the owner is entitled to know which.
 */
export function describeSyncState(
  source: Pick<
    CalendarSource,
    "enabled" | "lastSyncStatus" | "lastSyncSuccessAt" | "lastSyncErrorCode"
  >,
  now: Date,
): CalendarSyncSummary {
  if (!source.enabled) {
    return {
      text: "Paused — its events are hidden and it is not refreshed.",
      tone: "neutral",
      stale: false,
    };
  }
  const failure =
    source.lastSyncErrorCode === null
      ? "The last refresh did not work."
      : CALENDAR_SYNC_ERROR_MESSAGES[source.lastSyncErrorCode];

  if (source.lastSyncStatus === "failed") {
    if (source.lastSyncSuccessAt === null) {
      return { text: failure, tone: "danger", stale: false };
    }
    return {
      text: `Last refresh failed. Showing events from ${relativeSyncAge(source.lastSyncSuccessAt, now)}. ${failure}`,
      tone: "danger",
      stale: true,
    };
  }
  if (source.lastSyncStatus === "ok" && source.lastSyncSuccessAt !== null) {
    return {
      text: `Synced ${relativeSyncAge(source.lastSyncSuccessAt, now)}`,
      tone: "neutral",
      stale: false,
    };
  }
  return { text: "Never synced", tone: "neutral", stale: false };
}
