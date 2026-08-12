/**
 * CAL-01 — the D1 external-calendar-event store.
 *
 * Two things this file is written to guarantee, both of which are the difference
 * between a schedule that works and one that is quietly wrong:
 *
 * **No N+1.** The schedule read is ONE statement that already carries the two
 * facts a row needs beyond itself — which source it came from, and whether it
 * has a DalyHub Meeting. Today does not ask per event; Next 7 Days does not ask
 * per day. Both call {@link D1ExternalCalendarEventRepository.listWindow} once
 * (CAL-01 §34).
 *
 * **Atomic refresh.** A reconciliation lands as ONE batch. A half-applied
 * refresh would show the owner a day that never existed — some events updated,
 * some not, some deleted — and the failure would be invisible because every row
 * on screen would look plausible.
 */

import {
  CalendarStorageError,
  type CalendarProviderHint,
  type ExternalCalendarEvent,
  type ExternalCalendarEventRepository,
  type ExternalCalendarMeetingLink,
  type ExternalEventStatus,
  type ExternalOccurrenceIdentity,
  type ParsedOccurrence,
  type ScheduleRow,
  type ScheduleWindow,
  type StoredOccurrence,
} from "~/kernel/calendar";
import { secureIdGenerator } from "~/kernel/entities";
import type { Clock, IdGenerator } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface EventRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_id: string;
  readonly external_uid: string;
  readonly occurrence_key: string;
  readonly title: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly all_day: number;
  readonly all_day_start_date: string | null;
  readonly all_day_end_date: string | null;
  readonly timezone: string | null;
  readonly location: string | null;
  readonly meeting_url: string | null;
  readonly status: string;
  readonly source_updated_at: string | null;
  readonly last_seen_at: string;
}

interface JoinedEventRow extends EventRow {
  readonly source_name: string;
  readonly provider_hint: string;
  readonly source_rank: number;
  readonly meeting_id: string | null;
}

const EVENT_COLUMNS =
  "e.id, e.workspace_id, e.source_id, e.external_uid, e.occurrence_key, e.title, " +
  "e.starts_at, e.ends_at, e.all_day, e.all_day_start_date, e.all_day_end_date, " +
  "e.timezone, e.location, e.meeting_url, e.status, e.source_updated_at, e.last_seen_at";

/**
 * Sources ranked by creation order, INCLUDING disabled ones.
 *
 * The rank is what allocates a source's design-system accent, so it must not
 * shift when another source is paused — an owner who disables "Family" must not
 * find "Work" has changed colour.
 */
const RANKED_SOURCES = `WITH ranked_sources AS (
    SELECT id, name, provider_hint, enabled,
           ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1 AS source_rank
      FROM calendar_sources
     WHERE workspace_id = ?1
  )`;

/**
 * The link join, spelled once. It matches on the DURABLE external identity
 * rather than on the event row id — see the migration for why.
 */
const LINK_JOIN = `LEFT JOIN external_calendar_meeting_links l
    ON l.workspace_id = e.workspace_id
   AND l.source_id = e.source_id
   AND l.external_uid = e.external_uid
   AND l.occurrence_key = e.occurrence_key`;

/**
 * The window predicate: overlap, in the two different ways the two kinds of item
 * require.
 *
 * A timed event is an INSTANT range and overlaps when it starts before the
 * window ends and ends after it begins. An all-day item is a floating DATE range
 * and is compared as dates, because converting it through a timezone is what
 * moves a public holiday to the day before.
 */
const WINDOW_PREDICATE = `(
    (e.all_day = 0 AND e.starts_at < ?3 AND e.ends_at > ?2)
    OR (e.all_day = 1 AND e.all_day_start_date <= ?5 AND e.all_day_end_date >= ?4)
  )`;

const STATUSES = new Set<ExternalEventStatus>([
  "confirmed",
  "tentative",
  "cancelled",
]);

function rowToEvent(row: EventRow): ExternalCalendarEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    externalUid: row.external_uid,
    occurrenceKey: row.occurrence_key,
    title: row.title,
    startsAt: fromStorageTimestamp(row.starts_at),
    endsAt: fromStorageTimestamp(row.ends_at),
    allDay: row.all_day === 1,
    allDayStartDate: row.all_day_start_date,
    allDayEndDate: row.all_day_end_date,
    timezone: row.timezone,
    location: row.location,
    meetingUrl: row.meeting_url,
    status: STATUSES.has(row.status as ExternalEventStatus)
      ? (row.status as ExternalEventStatus)
      : "confirmed",
    sourceUpdatedAt:
      row.source_updated_at === null
        ? null
        : fromStorageTimestamp(row.source_updated_at),
    lastSeenAt: fromStorageTimestamp(row.last_seen_at),
  };
}

function rowToScheduleRow(row: JoinedEventRow): ScheduleRow {
  return {
    event: rowToEvent(row),
    sourceName: row.source_name,
    providerHint: row.provider_hint as CalendarProviderHint,
    sourceRank: row.source_rank,
    meetingId: row.meeting_id,
  };
}

/** The bind values for an insert/update of one occurrence, in a fixed order. */
function occurrenceBindings(
  occurrence: ParsedOccurrence,
): readonly (string | number | null)[] {
  return [
    occurrence.title,
    toStorageTimestamp(occurrence.startsAt),
    toStorageTimestamp(occurrence.endsAt),
    occurrence.allDay ? 1 : 0,
    occurrence.allDayStartDate,
    occurrence.allDayEndDate,
    occurrence.timezone,
    occurrence.location,
    occurrence.meetingUrl,
    occurrence.status,
    occurrence.sourceUpdatedAt === null
      ? null
      : toStorageTimestamp(occurrence.sourceUpdatedAt),
  ];
}

export type D1ExternalCalendarEventRepositoryOptions = {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
};

export class D1ExternalCalendarEventRepository implements ExternalCalendarEventRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1ExternalCalendarEventRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    // No clock: every timestamp this repository writes is an instant the CALLER
    // supplies (`seenAt`, the link's `at`), because a refresh's several
    // statements must all record the same moment.
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async listWindow(window: ScheduleWindow): Promise<readonly ScheduleRow[]> {
    try {
      const result = await this.#db
        .prepare(
          `${RANKED_SOURCES}
           SELECT ${EVENT_COLUMNS},
                  s.name AS source_name,
                  s.provider_hint AS provider_hint,
                  s.source_rank AS source_rank,
                  l.meeting_id AS meeting_id
             FROM external_calendar_events e
             JOIN ranked_sources s ON s.id = e.source_id
             ${LINK_JOIN}
            WHERE e.workspace_id = ?1
              AND s.enabled = 1
              AND ${WINDOW_PREDICATE}
            ORDER BY e.all_day DESC, e.starts_at ASC, e.title ASC, e.id ASC`,
        )
        .bind(
          this.#workspaceId,
          toStorageTimestamp(window.fromInstant),
          toStorageTimestamp(window.toInstant),
          window.fromDate,
          window.toDate,
        )
        .all<JoinedEventRow>();
      return (result.results ?? []).map(rowToScheduleRow);
    } catch (cause) {
      throw new CalendarStorageError("listWindow", { cause });
    }
  }

  async getScheduleRow(id: string): Promise<ScheduleRow | null> {
    try {
      const row = await this.#db
        .prepare(
          `${RANKED_SOURCES}
           SELECT ${EVENT_COLUMNS},
                  s.name AS source_name,
                  s.provider_hint AS provider_hint,
                  s.source_rank AS source_rank,
                  l.meeting_id AS meeting_id
             FROM external_calendar_events e
             JOIN ranked_sources s ON s.id = e.source_id
             ${LINK_JOIN}
            WHERE e.workspace_id = ?1 AND e.id = ?2`,
        )
        .bind(this.#workspaceId, id)
        .first<JoinedEventRow>();
      return row === null ? null : rowToScheduleRow(row);
    } catch (cause) {
      throw new CalendarStorageError("getScheduleRow", { cause });
    }
  }

  async listForSync(
    sourceId: string,
    window: ScheduleWindow,
  ): Promise<readonly StoredOccurrence[]> {
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${EVENT_COLUMNS}
             FROM external_calendar_events e
            WHERE e.workspace_id = ?1
              AND e.source_id = ?6
              AND ${WINDOW_PREDICATE}`,
        )
        .bind(
          this.#workspaceId,
          toStorageTimestamp(window.fromInstant),
          toStorageTimestamp(window.toInstant),
          window.fromDate,
          window.toDate,
          sourceId,
        )
        .all<EventRow>();
      return (result.results ?? []).map(rowToEvent);
    } catch (cause) {
      throw new CalendarStorageError("listForSync", { cause });
    }
  }

  async applySync(input: {
    readonly sourceId: string;
    readonly seenAt: Date;
    readonly created: readonly ParsedOccurrence[];
    readonly updated: readonly {
      readonly id: string;
      readonly occurrence: ParsedOccurrence;
    }[];
    readonly touched: readonly string[];
    readonly vanished: readonly string[];
  }): Promise<void> {
    const seenAt = toStorageTimestamp(input.seenAt);
    const statements: D1PreparedStatement[] = [];

    for (const occurrence of input.created) {
      /*
       * `INSERT ... ON CONFLICT DO UPDATE` rather than a bare INSERT.
       *
       * The plan said this identity was absent, and it was when the plan was
       * made — but a concurrent refresh (a manual one racing the cron, past the
       * claim window) could have written it since. Upserting makes the write
       * converge rather than fail, which is what "idempotent" has to mean under
       * concurrency as well as under repetition.
       */
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO external_calendar_events
               (id, workspace_id, source_id, external_uid, occurrence_key, title,
                starts_at, ends_at, all_day, all_day_start_date, all_day_end_date,
                timezone, location, meeting_url, status, source_updated_at,
                last_seen_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                     ?15, ?16, ?17, ?17, ?17)
             ON CONFLICT (workspace_id, source_id, external_uid, occurrence_key)
             DO UPDATE SET
               title = excluded.title,
               starts_at = excluded.starts_at,
               ends_at = excluded.ends_at,
               all_day = excluded.all_day,
               all_day_start_date = excluded.all_day_start_date,
               all_day_end_date = excluded.all_day_end_date,
               timezone = excluded.timezone,
               location = excluded.location,
               meeting_url = excluded.meeting_url,
               status = excluded.status,
               source_updated_at = excluded.source_updated_at,
               last_seen_at = excluded.last_seen_at,
               updated_at = excluded.updated_at`,
          )
          .bind(
            this.#newId(),
            this.#workspaceId,
            input.sourceId,
            occurrence.externalUid,
            occurrence.occurrenceKey,
            ...occurrenceBindings(occurrence),
            seenAt,
          ),
      );
    }

    for (const { id, occurrence } of input.updated) {
      statements.push(
        this.#db
          .prepare(
            `UPDATE external_calendar_events
                SET title = ?3, starts_at = ?4, ends_at = ?5, all_day = ?6,
                    all_day_start_date = ?7, all_day_end_date = ?8, timezone = ?9,
                    location = ?10, meeting_url = ?11, status = ?12,
                    source_updated_at = ?13, last_seen_at = ?14, updated_at = ?14
              WHERE workspace_id = ?1 AND id = ?2`,
          )
          .bind(
            this.#workspaceId,
            id,
            ...occurrenceBindings(occurrence),
            seenAt,
          ),
      );
    }

    // `last_seen_at` in bounded chunks, so an unchanged 500-event feed is a
    // handful of statements rather than 500. Placeholders are NUMBERED rather
    // than anonymous: mixing `?1` with a bare `?` relies on SQLite's
    // next-index-after-the-highest rule, which is a correct but fragile thing
    // for a future edit to depend on.
    for (const chunk of chunkIds(input.touched, 100)) {
      statements.push(
        this.#db
          .prepare(
            `UPDATE external_calendar_events
                SET last_seen_at = ?2
              WHERE workspace_id = ?1
                AND id IN (${chunk.map((_, index) => `?${index + 3}`).join(", ")})`,
          )
          .bind(this.#workspaceId, seenAt, ...chunk),
      );
    }

    for (const chunk of chunkIds(input.vanished, 100)) {
      statements.push(
        this.#db
          .prepare(
            `DELETE FROM external_calendar_events
              WHERE workspace_id = ?1
                AND id IN (${chunk.map((_, index) => `?${index + 2}`).join(", ")})`,
          )
          .bind(this.#workspaceId, ...chunk),
      );
    }

    if (statements.length === 0) return;
    try {
      await this.#db.batch(statements);
    } catch (cause) {
      throw new CalendarStorageError("applySync", { cause });
    }
  }

  async pruneOutsideWindow(window: ScheduleWindow): Promise<number> {
    try {
      const result = await this.#db
        .prepare(
          `DELETE FROM external_calendar_events
             WHERE workspace_id = ?1
               AND id IN (
                 SELECT e.id FROM external_calendar_events e
                  WHERE e.workspace_id = ?1 AND NOT ${WINDOW_PREDICATE}
                  LIMIT 5000
               )`,
        )
        .bind(
          this.#workspaceId,
          toStorageTimestamp(window.fromInstant),
          toStorageTimestamp(window.toInstant),
          window.fromDate,
          window.toDate,
        )
        .run();
      return result.meta?.changes ?? 0;
    } catch (cause) {
      throw new CalendarStorageError("pruneOutsideWindow", { cause });
    }
  }

  async countForSource(
    sourceId: string,
    window: ScheduleWindow,
  ): Promise<number> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM external_calendar_events e
            WHERE e.workspace_id = ?1 AND e.source_id = ?6 AND ${WINDOW_PREDICATE}`,
        )
        .bind(
          this.#workspaceId,
          toStorageTimestamp(window.fromInstant),
          toStorageTimestamp(window.toInstant),
          window.fromDate,
          window.toDate,
          sourceId,
        )
        .first<{ readonly total: number }>();
      return row?.total ?? 0;
    } catch (cause) {
      throw new CalendarStorageError("countForSource", { cause });
    }
  }

  async linkMeeting(
    identity: ExternalOccurrenceIdentity,
    meetingId: string,
    at: Date,
  ): Promise<{
    readonly link: ExternalCalendarMeetingLink;
    readonly created: boolean;
  }> {
    try {
      /*
       * `DO NOTHING`, then read back.
       *
       * The primary key is what makes "one Meeting per occurrence" true; this
       * statement is what makes a double submission REPORT the winner rather
       * than fail. The caller uses `created` to decide whether the Meeting it
       * just made is the one that won — and to clean up if it did not.
       */
      const result = await this.#db
        .prepare(
          `INSERT INTO external_calendar_meeting_links
             (workspace_id, source_id, external_uid, occurrence_key, meeting_id, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (workspace_id, source_id, external_uid, occurrence_key)
           DO NOTHING`,
        )
        .bind(
          this.#workspaceId,
          identity.sourceId,
          identity.externalUid,
          identity.occurrenceKey,
          meetingId,
          toStorageTimestamp(at),
        )
        .run();
      const created = (result.meta?.changes ?? 0) > 0;
      const link = await this.findLink(identity);
      if (link === null) {
        throw new CalendarStorageError("linkMeeting");
      }
      return { link, created };
    } catch (cause) {
      if (cause instanceof CalendarStorageError) throw cause;
      throw new CalendarStorageError("linkMeeting", { cause });
    }
  }

  async findLink(
    identity: ExternalOccurrenceIdentity,
  ): Promise<ExternalCalendarMeetingLink | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT source_id, external_uid, occurrence_key, meeting_id, created_at
             FROM external_calendar_meeting_links
            WHERE workspace_id = ?1 AND source_id = ?2
              AND external_uid = ?3 AND occurrence_key = ?4`,
        )
        .bind(
          this.#workspaceId,
          identity.sourceId,
          identity.externalUid,
          identity.occurrenceKey,
        )
        .first<{
          readonly source_id: string;
          readonly external_uid: string;
          readonly occurrence_key: string;
          readonly meeting_id: string;
          readonly created_at: string;
        }>();
      if (row === null) return null;
      return {
        sourceId: row.source_id,
        externalUid: row.external_uid,
        occurrenceKey: row.occurrence_key,
        meetingId: row.meeting_id,
        createdAt: fromStorageTimestamp(row.created_at),
      };
    } catch (cause) {
      throw new CalendarStorageError("findLink", { cause });
    }
  }
}

/** Split ids into bounded chunks, so no statement carries an unbounded IN list. */
function chunkIds(
  ids: readonly string[],
  size: number,
): readonly (readonly string[])[] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push([...ids.slice(index, index + size)]);
  }
  return chunks;
}
