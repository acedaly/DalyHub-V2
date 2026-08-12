/**
 * CAL-01 — the D1 calendar-source store.
 *
 * Workspace-bound at construction, like every other repository here: every
 * statement carries `workspace_id = ?`, so the workspace a source belongs to is
 * decided by the composition boundary and can never be reached from a request
 * (ADR-010). A source in another workspace is not "forbidden" — it is not found.
 *
 * ── The one column that needs care ──────────────────────────────────────────
 * `feed_url_sealed` is a credential. It is selected by exactly ONE method
 * ({@link D1CalendarSourceRepository.listForRefresh}), which the synchroniser
 * calls and nothing else does. Every other read uses {@link COLUMNS}, which does
 * not include it — so a loader that hands its result to the browser physically
 * cannot leak a feed URL, and that is a property of the SQL rather than of a
 * reviewer noticing.
 */

import {
  CalendarSourceDuplicateError,
  CalendarSourceLimitError,
  CalendarSourceNotFoundError,
  CalendarStorageError,
  MAX_CALENDAR_SOURCES,
  type CalendarProviderHint,
  type CalendarSource,
  type CalendarSourceRepository,
  type CalendarSyncErrorCode,
  type CalendarSyncOutcome,
  type CalendarSyncStatus,
  type NewCalendarSource,
} from "~/kernel/calendar";
import { secureIdGenerator, systemClock } from "~/kernel/entities";
import type { Clock, IdGenerator } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface CalendarSourceRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly provider_hint: string;
  readonly enabled: number;
  readonly last_sync_attempt_at: string | null;
  readonly last_sync_success_at: string | null;
  readonly last_sync_status: string;
  readonly last_sync_error_code: string | null;
  readonly event_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * The columns every ordinary read selects.
 *
 * `feed_url_sealed` and `feed_fingerprint` are deliberately absent: neither has
 * any business leaving this file except on the one refresh path below.
 */
const COLUMNS =
  "id, workspace_id, name, provider_hint, enabled, last_sync_attempt_at, " +
  "last_sync_success_at, last_sync_status, last_sync_error_code, event_count, " +
  "created_at, updated_at";

const PROVIDER_HINTS = new Set<CalendarProviderHint>([
  "outlook",
  "apple",
  "google",
  "fastmail",
  "generic",
]);

function rowToSource(row: CalendarSourceRow): CalendarSource {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    // Re-validated on the way out, so a hand-edited row cannot introduce a hint
    // the application does not recognise.
    providerHint: PROVIDER_HINTS.has(row.provider_hint as CalendarProviderHint)
      ? (row.provider_hint as CalendarProviderHint)
      : "generic",
    enabled: row.enabled === 1,
    lastSyncAttemptAt:
      row.last_sync_attempt_at === null
        ? null
        : fromStorageTimestamp(row.last_sync_attempt_at),
    lastSyncSuccessAt:
      row.last_sync_success_at === null
        ? null
        : fromStorageTimestamp(row.last_sync_success_at),
    lastSyncStatus: (["never", "ok", "failed"] as const).includes(
      row.last_sync_status as CalendarSyncStatus,
    )
      ? (row.last_sync_status as CalendarSyncStatus)
      : "never",
    lastSyncErrorCode:
      row.last_sync_error_code === null
        ? null
        : (row.last_sync_error_code as CalendarSyncErrorCode),
    eventCount: row.event_count,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
  };
}

export type D1CalendarSourceRepositoryOptions = {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
};

export class D1CalendarSourceRepository implements CalendarSourceRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1CalendarSourceRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async list(): Promise<readonly CalendarSource[]> {
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM calendar_sources
             WHERE workspace_id = ?1
             ORDER BY created_at ASC, id ASC`,
        )
        .bind(this.#workspaceId)
        .all<CalendarSourceRow>();
      return (result.results ?? []).map(rowToSource);
    } catch (cause) {
      throw new CalendarStorageError("list", { cause });
    }
  }

  async get(id: string): Promise<CalendarSource | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM calendar_sources
             WHERE workspace_id = ?1 AND id = ?2`,
        )
        .bind(this.#workspaceId, id)
        .first<CalendarSourceRow>();
      return row === null ? null : rowToSource(row);
    } catch (cause) {
      throw new CalendarStorageError("get", { cause });
    }
  }

  async create(input: NewCalendarSource): Promise<CalendarSource> {
    const id = this.#newId();
    const at = this.#clock();
    const timestamp = toStorageTimestamp(at);

    /*
     * The source limit is enforced INSIDE the insert, by a SELECT in its VALUES
     * clause, so two concurrent submissions cannot both read "9 sources" and
     * both write. `changes()` then tells us whether the row landed.
     */
    try {
      const result = await this.#db
        .prepare(
          `INSERT INTO calendar_sources
             (id, workspace_id, name, provider_hint, feed_url_sealed,
              feed_fingerprint, enabled, last_sync_attempt_at,
              last_sync_success_at, last_sync_status, last_sync_error_code,
              event_count, created_at, updated_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, NULL, NULL, 'never', NULL, 0, ?7, ?7
             WHERE (
               SELECT COUNT(*) FROM calendar_sources WHERE workspace_id = ?2
             ) < ?8`,
        )
        .bind(
          id,
          this.#workspaceId,
          input.name,
          input.providerHint,
          input.sealedFeedUrl,
          input.feedFingerprint,
          timestamp,
          MAX_CALENDAR_SOURCES,
        )
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        throw new CalendarSourceLimitError(MAX_CALENDAR_SOURCES);
      }
    } catch (cause) {
      if (cause instanceof CalendarSourceLimitError) throw cause;
      // The unique index on (workspace_id, feed_fingerprint) is what makes "you
      // already added this calendar" a database guarantee. The message is
      // matched rather than the code because D1 surfaces SQLite's text.
      if (
        cause instanceof Error &&
        /UNIQUE constraint failed/i.test(cause.message)
      ) {
        throw new CalendarSourceDuplicateError();
      }
      throw new CalendarStorageError("create", { cause });
    }

    return {
      id,
      workspaceId: this.#workspaceId,
      name: input.name,
      providerHint: input.providerHint,
      enabled: true,
      lastSyncAttemptAt: null,
      lastSyncSuccessAt: null,
      lastSyncStatus: "never",
      lastSyncErrorCode: null,
      eventCount: 0,
      createdAt: at,
      updatedAt: at,
    };
  }

  async update(
    id: string,
    changes: { readonly name?: string; readonly enabled?: boolean },
  ): Promise<CalendarSource> {
    const at = toStorageTimestamp(this.#clock());
    try {
      const result = await this.#db
        .prepare(
          `UPDATE calendar_sources
              SET name = COALESCE(?3, name),
                  enabled = COALESCE(?4, enabled),
                  updated_at = ?5
            WHERE workspace_id = ?1 AND id = ?2`,
        )
        .bind(
          this.#workspaceId,
          id,
          changes.name ?? null,
          changes.enabled === undefined ? null : changes.enabled ? 1 : 0,
          at,
        )
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        throw new CalendarSourceNotFoundError();
      }
    } catch (cause) {
      if (cause instanceof CalendarSourceNotFoundError) throw cause;
      throw new CalendarStorageError("update", { cause });
    }
    const source = await this.get(id);
    if (source === null) throw new CalendarSourceNotFoundError();
    return source;
  }

  async remove(id: string): Promise<void> {
    try {
      /*
       * One batch, three statements, in this order:
       *
       *   1. the Meeting LINKS for this source — the external occurrences they
       *      name are about to stop existing. The MEETINGS themselves are not
       *      touched, and there is deliberately no statement here that could
       *      touch them: a Meeting is a DalyHub record and removing a calendar
       *      is not authority to delete one (CAL-01 §24);
       *   2. the projected events (also covered by ON DELETE CASCADE; stated
       *      explicitly so the intent survives a schema change);
       *   3. the source.
       */
      await this.#db.batch([
        this.#db
          .prepare(
            `DELETE FROM external_calendar_meeting_links
               WHERE workspace_id = ?1 AND source_id = ?2`,
          )
          .bind(this.#workspaceId, id),
        this.#db
          .prepare(
            `DELETE FROM external_calendar_events
               WHERE workspace_id = ?1 AND source_id = ?2`,
          )
          .bind(this.#workspaceId, id),
        this.#db
          .prepare(
            `DELETE FROM calendar_sources WHERE workspace_id = ?1 AND id = ?2`,
          )
          .bind(this.#workspaceId, id),
      ]);
    } catch (cause) {
      throw new CalendarStorageError("remove", { cause });
    }
  }

  async listForRefresh(input: { readonly sourceId?: string } = {}): Promise<
    readonly {
      readonly source: CalendarSource;
      readonly sealedFeedUrl: string;
    }[]
  > {
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS}, feed_url_sealed FROM calendar_sources
             WHERE workspace_id = ?1
               AND enabled = 1
               AND (?2 IS NULL OR id = ?2)
             ORDER BY created_at ASC, id ASC`,
        )
        .bind(this.#workspaceId, input.sourceId ?? null)
        .all<CalendarSourceRow & { readonly feed_url_sealed: string }>();
      return (result.results ?? []).map((row) => ({
        source: rowToSource(row),
        sealedFeedUrl: row.feed_url_sealed,
      }));
    } catch (cause) {
      throw new CalendarStorageError("listForRefresh", { cause });
    }
  }

  async recordSyncOutcome(
    id: string,
    outcome: CalendarSyncOutcome,
  ): Promise<void> {
    const at = toStorageTimestamp(outcome.attemptedAt);
    try {
      await this.#db
        .prepare(
          `UPDATE calendar_sources
              SET last_sync_attempt_at = ?3,
                  -- Releasing the claim is part of recording the outcome, in the
                  -- same statement: a refresh that finished must not keep the
                  -- next one out.
                  refresh_claimed_at = NULL,
                  last_sync_status = ?4,
                  last_sync_error_code = ?5,
                  -- A FAILED refresh leaves the previous success instant and
                  -- the previous count alone: the events on screen are still
                  -- real, and the UI states their age rather than pretending.
                  last_sync_success_at = CASE WHEN ?4 = 'ok' THEN ?3 ELSE last_sync_success_at END,
                  event_count = CASE WHEN ?4 = 'ok' THEN ?6 ELSE event_count END,
                  updated_at = ?3
            WHERE workspace_id = ?1 AND id = ?2`,
        )
        .bind(
          this.#workspaceId,
          id,
          at,
          outcome.status,
          outcome.errorCode,
          outcome.eventCount ?? 0,
        )
        .run();
    } catch (cause) {
      throw new CalendarStorageError("recordSyncOutcome", { cause });
    }
  }

  async claimRefresh(
    id: string,
    at: Date,
    staleAfterMs: number,
  ): Promise<boolean> {
    const boundary = toStorageTimestamp(new Date(at.getTime() - staleAfterMs));
    try {
      const result = await this.#db
        .prepare(
          `UPDATE calendar_sources
              SET refresh_claimed_at = ?3
            WHERE workspace_id = ?1 AND id = ?2
              AND (refresh_claimed_at IS NULL OR refresh_claimed_at < ?4)`,
        )
        .bind(this.#workspaceId, id, toStorageTimestamp(at), boundary)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    } catch (cause) {
      throw new CalendarStorageError("claimRefresh", { cause });
    }
  }
}
