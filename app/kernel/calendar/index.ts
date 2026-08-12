/**
 * CAL-01 Calendar kernel — read-only external calendar sources, their projected
 * occurrences, and the unified Schedule read model built over them.
 *
 * The boundary this module exists to hold, in one line:
 *
 *     ExternalCalendarEvent  →  may link to  →  DalyHub Meeting
 *
 * External calendars stay the scheduling authority; DalyHub consumes their
 * schedule read-only and combines it with Tasks, Today and Meetings. Nothing
 * here writes to an external calendar, and nothing here creates a Meeting
 * without an explicit owner action.
 *
 * Storage adapters live in `app/platform/storage/d1`; the ICS parser, the
 * SSRF-guarded fetch and the synchroniser live in `app/platform/calendar` —
 * this module is pure domain and stays free of both the network and `ical.js`.
 */

export {
  CALENDAR_PROVIDER_LABELS,
  CALENDAR_SOURCE_NAME_MAX_LENGTH,
  EXTERNAL_LOCATION_MAX_LENGTH,
  EXTERNAL_TITLE_MAX_LENGTH,
  EXTERNAL_URL_MAX_LENGTH,
  FEED_TIMEOUT_MS,
  MAX_CALENDAR_SOURCES,
  MAX_FEED_BYTES,
  MAX_FEED_COMPONENTS,
  MAX_FEED_REDIRECTS,
  MAX_SERIES_OCCURRENCES,
  MAX_SOURCE_OCCURRENCES,
  SYNC_WINDOW_FUTURE_DAYS,
  SYNC_WINDOW_PAST_DAYS,
  type CalendarProviderHint,
  type CalendarSource,
  type CalendarSyncErrorCode,
  type CalendarSyncStatus,
  type ExternalCalendarEvent,
  type ExternalCalendarMeetingLink,
  type ExternalEventStatus,
  type ExternalOccurrenceIdentity,
} from "./calendar";

export {
  CALENDAR_SYNC_ERROR_MESSAGES,
  describeSyncState,
  relativeSyncAge,
  type CalendarSyncSummary,
} from "./calendar-messages";

export {
  CalendarSourceDuplicateError,
  CalendarSourceLimitError,
  CalendarSourceNotFoundError,
  CalendarStorageError,
  type CalendarSourceRepository,
  type CalendarSyncOutcome,
  type ExternalCalendarEventRepository,
  type NewCalendarSource,
  type ScheduleRow,
  type ScheduleWindow,
} from "./calendar-repository";

export {
  CalendarValidationError,
  parseCalendarSourceId,
  parseCalendarSourceName,
} from "./calendar-validation";

export {
  FEED_URL_MESSAGES,
  FeedUrlError,
  feedUrlHost,
  normaliseFeedUrl,
  providerHintForUrl,
  type FeedUrlRejection,
} from "./feed-url";

export {
  boundedExternalText,
  buildDaySchedule,
  compareScheduleFacts,
  emptyDaySchedule,
  scheduleFactDates,
  type DaySchedule,
  type ScheduleEntry,
  type ScheduleEntryFacts,
  type ScheduleEntryKind,
  type ScheduleRelativeState,
} from "./schedule";

export {
  occurrenceChanged,
  occurrenceIdentityKey,
  planHasChanges,
  planSync,
  type ParsedOccurrence,
  type StoredOccurrence,
  type SyncPlan,
} from "./sync-plan";

export { calendarSyncWindow, type CalendarWindowInput } from "./sync-window";
