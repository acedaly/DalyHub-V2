/**
 * CAL-01 — the calendar platform: the server-side adapters the kernel domain is
 * deliberately free of.
 *
 * Everything here is `.server.ts` or re-exports it, because all three concerns
 * are server-only and one of them (`ical.js`) is a dependency that must never
 * reach a browser bundle:
 *
 *   - `ics-parser.server.ts`     RFC 5545 parsing and bounded expansion
 *   - `feed-fetch.server.ts`     the SSRF-guarded, bounded fetch
 *   - `calendar-secrets.server.ts` sealing/opening the feed URL
 *   - `calendar-sync.server.ts`  the refresh itself
 */

export {
  calendarEncryptionConfigured,
  openFeedUrl,
  sealFeedUrl,
  type CalendarSecretsEnv,
} from "./calendar-secrets.server";

export {
  refreshCalendarSource,
  refreshCalendarSources,
  validateFeed,
  type CalendarSyncDependencies,
  type SourceRefreshResult,
} from "./calendar-sync.server";

export {
  runScheduledCalendarRefresh,
  type ScheduledCalendarEnv,
  type ScheduledRefreshSummary,
} from "./scheduled-refresh.server";

export {
  FeedFetchError,
  fetchFeedBody,
  type FeedFetcher,
} from "./feed-fetch.server";

export {
  IcsParseError,
  looksLikeCalendar,
  parseIcsOccurrences,
  type IcsParseResult,
} from "./ics-parser.server";
