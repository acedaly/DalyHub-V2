/**
 * CAL-01 — the calendar storage contracts.
 *
 * Storage-independent and WORKSPACE-BOUND at construction, exactly like every
 * other repository in the kernel (ADR-010): the workspace is decided by the
 * composition boundary from trusted configuration, so no method here takes one
 * and no request can name one. A source or an event in another workspace is not
 * "forbidden" — it is simply not found.
 *
 * Note what is NOT here. No method returns a feed URL in plaintext, and the only
 * method that returns the SEALED form is the one the synchroniser uses. The
 * Settings surface reads sources through `list`, whose shape has no URL field at
 * all, so a loader physically cannot leak one into the browser.
 */

import type {
  CalendarProviderHint,
  CalendarSource,
  CalendarSyncErrorCode,
  CalendarSyncStatus,
  ExternalCalendarEvent,
  ExternalCalendarMeetingLink,
  ExternalOccurrenceIdentity,
} from "./calendar";
import type { ParsedOccurrence, StoredOccurrence } from "./sync-plan";

/** A calendar storage failure. Never carries the underlying detail out. */
export class CalendarStorageError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`A calendar storage error occurred (${operation}).`, options);
    this.name = "CalendarStorageError";
  }
}

/** The named source is not in the bound workspace. Discloses nothing further. */
export class CalendarSourceNotFoundError extends Error {
  constructor() {
    super("That calendar is unknown.");
    this.name = "CalendarSourceNotFoundError";
  }
}

/** The same feed is already configured in this workspace. */
export class CalendarSourceDuplicateError extends Error {
  constructor() {
    super("That calendar has already been added.");
    this.name = "CalendarSourceDuplicateError";
  }
}

/** The workspace already holds the maximum number of sources. */
export class CalendarSourceLimitError extends Error {
  constructor(limit: number) {
    super(`DalyHub holds up to ${limit} calendars.`);
    this.name = "CalendarSourceLimitError";
  }
}

export interface NewCalendarSource {
  readonly name: string;
  readonly providerHint: CalendarProviderHint;
  /** The SEALED feed URL. The repository never sees, stores or logs plaintext. */
  readonly sealedFeedUrl: string;
  /** The keyed fingerprint, for duplicate detection. Derived, not reversible. */
  readonly feedFingerprint: string;
}

export interface CalendarSyncOutcome {
  readonly attemptedAt: Date;
  readonly status: CalendarSyncStatus;
  readonly errorCode: CalendarSyncErrorCode | null;
  /** Present only on success — the occurrence count left in the window. */
  readonly eventCount?: number;
}

export interface CalendarSourceRepository {
  /**
   * Every source in the workspace, oldest first, WITHOUT its feed URL.
   *
   * Ordered by creation so the owner's list does not reshuffle when a refresh
   * lands, and so the per-source accent allocation is stable.
   */
  list(): Promise<readonly CalendarSource[]>;

  get(id: string): Promise<CalendarSource | null>;

  /**
   * Add a source. Throws `CalendarSourceDuplicateError` when the fingerprint is
   * already present and `CalendarSourceLimitError` past the configured bound —
   * both decided by the DATABASE (a unique index, a counted insert), never by a
   * read-then-write that two concurrent submissions could both pass.
   */
  create(input: NewCalendarSource): Promise<CalendarSource>;

  /** Rename a source, or enable/disable it. Returns the stored state. */
  update(
    id: string,
    changes: { readonly name?: string; readonly enabled?: boolean },
  ): Promise<CalendarSource>;

  /**
   * Remove a source and every event projected from it, in one batch.
   *
   * Its Meeting LINKS are removed with it — the external occurrences they name
   * no longer exist — but no Meeting is touched. A Meeting is a DalyHub record
   * and removing a calendar is not authority to delete one (CAL-01 §24).
   */
  remove(id: string): Promise<void>;

  /**
   * The SEALED feed URLs for the sources a refresh should visit.
   *
   * The one read that returns feed material, used only by the synchroniser. It
   * returns the sealed form; opening it requires the deployment key, which lives
   * only in the Worker environment.
   */
  listForRefresh(input?: { readonly sourceId?: string }): Promise<
    readonly {
      readonly source: CalendarSource;
      readonly sealedFeedUrl: string;
    }[]
  >;

  /** Record the result of a refresh attempt. Never appends Activity (§7). */
  recordSyncOutcome(id: string, outcome: CalendarSyncOutcome): Promise<void>;

  /**
   * Claim the right to refresh a source, so two refreshes cannot run at once.
   *
   * Returns false when another refresh claimed it within `staleAfterMs` — which
   * is what makes a double-tap on "Refresh now", or a manual refresh racing the
   * cron, do the work once. The claim is a conditional UPDATE, so the DATABASE
   * arbitrates rather than application code.
   */
  claimRefresh(id: string, at: Date, staleAfterMs: number): Promise<boolean>;
}

/** The window a schedule read or a prune applies to. */
export interface ScheduleWindow {
  /** Inclusive start instant. */
  readonly fromInstant: Date;
  /** Exclusive end instant. */
  readonly toInstant: Date;
  /** Inclusive owner-calendar date bounds, for all-day (floating) items. */
  readonly fromDate: string;
  readonly toDate: string;
}

export interface ExternalCalendarEventRepository {
  /**
   * Every occurrence overlapping the window, from ENABLED sources only, in ONE
   * bounded, workspace-scoped statement — with its source's name and its linked
   * Meeting id already joined.
   *
   * The join is the point (CAL-01 §34): Today must not issue one query per event
   * to discover whether it has notes, and Next 7 Days must not issue seven.
   */
  listWindow(window: ScheduleWindow): Promise<readonly ScheduleRow[]>;

  /** One occurrence by id, for the event detail surface. Null when unknown. */
  getScheduleRow(id: string): Promise<ScheduleRow | null>;

  /** Every stored occurrence for a source inside the window, for reconciliation. */
  listForSync(
    sourceId: string,
    window: ScheduleWindow,
  ): Promise<readonly StoredOccurrence[]>;

  /**
   * Apply a reconciliation plan for one source, atomically.
   *
   * All four outcomes in ONE batch: a refresh either lands completely or leaves
   * the previous projection exactly as it was. A half-applied refresh would show
   * the owner a day that never existed.
   */
  applySync(input: {
    readonly sourceId: string;
    readonly seenAt: Date;
    readonly created: readonly ParsedOccurrence[];
    readonly updated: readonly {
      readonly id: string;
      readonly occurrence: ParsedOccurrence;
    }[];
    readonly touched: readonly string[];
    readonly vanished: readonly string[];
  }): Promise<void>;

  /**
   * Delete occurrences outside the retention window.
   *
   * Safe precisely because they are projections: anything still in the feed
   * comes back on the next refresh. Meeting links are keyed on external identity
   * rather than on these rows, so pruning cannot orphan a Meeting.
   */
  pruneOutsideWindow(window: ScheduleWindow): Promise<number>;

  /** How many occurrences a source currently holds inside the window. */
  countForSource(sourceId: string, window: ScheduleWindow): Promise<number>;

  /**
   * Link an occurrence to a Meeting, once.
   *
   * Returns the EXISTING link when one is already present, rather than creating
   * a second — the primary key makes "one Meeting per occurrence" a database
   * guarantee, and this method reports the winner rather than failing, because a
   * double submission is not an error.
   */
  linkMeeting(
    identity: ExternalOccurrenceIdentity,
    meetingId: string,
    at: Date,
  ): Promise<{
    readonly link: ExternalCalendarMeetingLink;
    readonly created: boolean;
  }>;

  /** The link for one occurrence, or null. */
  findLink(
    identity: ExternalOccurrenceIdentity,
  ): Promise<ExternalCalendarMeetingLink | null>;
}

/**
 * One occurrence joined to the two facts the schedule needs about it: which
 * source it came from, and whether it already has a DalyHub Meeting.
 */
export interface ScheduleRow {
  readonly event: ExternalCalendarEvent;
  readonly sourceName: string;
  readonly providerHint: CalendarProviderHint;
  /** The source's position in the workspace's creation order, for the accent. */
  readonly sourceRank: number;
  readonly meetingId: string | null;
}
