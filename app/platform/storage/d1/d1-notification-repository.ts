/**
 * NOTIFY-01 — the D1 notification ledger.
 *
 * Workspace-bound at construction, like every other repository here: every
 * statement carries `workspace_id = ?`, so the workspace an event belongs to is
 * decided by the composition boundary and can never be reached from a request
 * (ADR-010).
 *
 * ── The one method that matters ─────────────────────────────────────────────
 * {@link D1NotificationRepository.record} is an `INSERT … ON CONFLICT DO
 * NOTHING … RETURNING`. That single statement is the whole concurrency design:
 *
 *   - it commits BEFORE any external channel is called, so a notification can
 *     never be sent without a row saying it happened;
 *   - a conflict on `(workspace_id, dedupe_key)` returns no row, which the
 *     caller reads as "another tick owns this event" and stops, silently;
 *   - the DATABASE arbitrates, so two Workers running the same fifteen-minute
 *     tick cannot both win a read-then-write.
 *
 * Nothing here records Activity (ADR-012): the owner did nothing.
 */

import {
  NotificationStorageError,
  type DeliveryChannel,
  type DeliveryFailureReason,
  type DeliveryStatus,
  type NewNotification,
  type NotificationDelivery,
  type NotificationKind,
  type NotificationRecord,
  type NotificationRepository,
  type NotificationWithDeliveries,
} from "~/kernel/notifications";
import { secureIdGenerator, systemClock } from "~/kernel/entities";
import type { Clock, IdGenerator } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface NotificationRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly kind: string;
  readonly subject_entity_id: string | null;
  readonly dedupe_key: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly created_at: string;
  readonly read_at: string | null;
}

interface DeliveryRow {
  readonly notification_id: string;
  readonly channel: string;
  readonly status: string;
  readonly attempted_at: string;
  readonly detail: string | null;
}

const COLUMNS =
  "id, workspace_id, kind, subject_entity_id, dedupe_key, title, body, href, " +
  "created_at, read_at";

function rowToNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    // Re-validated on the way out, so a hand-edited row cannot introduce a kind
    // the application does not recognise.
    kind: (row.kind === "digest" || row.kind === "asset_obligation"
      ? row.kind
      : "digest") as NotificationKind,
    subjectEntityId: row.subject_entity_id,
    dedupeKey: row.dedupe_key,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: fromStorageTimestamp(row.created_at),
    readAt: row.read_at === null ? null : fromStorageTimestamp(row.read_at),
  };
}

function rowToDelivery(row: DeliveryRow): NotificationDelivery {
  return {
    notificationId: row.notification_id,
    channel: row.channel as DeliveryChannel,
    status: (row.status === "delivered"
      ? "delivered"
      : "failed") as DeliveryStatus,
    attemptedAt: fromStorageTimestamp(row.attempted_at),
    detail: row.detail === null ? null : (row.detail as DeliveryFailureReason),
  };
}

export type D1NotificationRepositoryOptions = {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
};

export class D1NotificationRepository implements NotificationRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1NotificationRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async record(input: NewNotification): Promise<NotificationRecord | null> {
    const now = this.#clock();
    try {
      const row = await this.#db
        .prepare(
          `INSERT INTO notifications
             (id, workspace_id, kind, subject_entity_id, dedupe_key, title,
              body, href, created_at, read_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)
           ON CONFLICT (workspace_id, dedupe_key) DO NOTHING
           RETURNING ${COLUMNS}`,
        )
        .bind(
          this.#newId(),
          this.#workspaceId,
          input.kind,
          input.subjectEntityId ?? null,
          input.dedupeKey,
          input.title,
          input.body,
          input.href,
          toStorageTimestamp(now),
        )
        .first<NotificationRow>();
      // No row means the conflict clause fired: this event already happened.
      // That is not an error, and the caller must treat it as "stop".
      return row === null ? null : rowToNotification(row);
    } catch (cause) {
      throw new NotificationStorageError("record", { cause });
    }
  }

  async recordDelivery(delivery: NotificationDelivery): Promise<void> {
    try {
      await this.#db
        .prepare(
          `INSERT INTO notification_deliveries
             (workspace_id, notification_id, channel, status, attempted_at, detail)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (workspace_id, notification_id, channel) DO UPDATE SET
             status = excluded.status,
             attempted_at = excluded.attempted_at,
             detail = excluded.detail`,
        )
        .bind(
          this.#workspaceId,
          delivery.notificationId,
          delivery.channel,
          delivery.status,
          toStorageTimestamp(delivery.attemptedAt),
          delivery.detail,
        )
        .run();
    } catch (cause) {
      throw new NotificationStorageError("recordDelivery", { cause });
    }
  }

  async existingDedupeKeys(
    keys: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (keys.length === 0) return new Set();
    // One statement whatever the key count. The placeholder list is built from
    // the ARITY of the input only — every value is still bound, never inlined.
    const placeholders = keys.map((_, index) => `?${index + 2}`).join(", ");
    try {
      const result = await this.#db
        .prepare(
          `SELECT dedupe_key FROM notifications
             WHERE workspace_id = ?1 AND dedupe_key IN (${placeholders})`,
        )
        .bind(this.#workspaceId, ...keys)
        .all<{ readonly dedupe_key: string }>();
      return new Set((result.results ?? []).map((row) => row.dedupe_key));
    } catch (cause) {
      throw new NotificationStorageError("existingDedupeKeys", { cause });
    }
  }

  async listRecent(
    limit: number,
  ): Promise<readonly NotificationWithDeliveries[]> {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
    try {
      const notifications = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM notifications
             WHERE workspace_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2`,
        )
        .bind(this.#workspaceId, bounded)
        .all<NotificationRow>();
      const rows = notifications.results ?? [];
      if (rows.length === 0) return [];

      // The deliveries for the whole page in ONE statement — never one query per
      // row. The inbox is a list, and a list that issues a query per item is how
      // a fifty-row log becomes fifty-one round trips.
      const placeholders = rows.map((_, index) => `?${index + 2}`).join(", ");
      const deliveries = await this.#db
        .prepare(
          `SELECT notification_id, channel, status, attempted_at, detail
             FROM notification_deliveries
             WHERE workspace_id = ?1 AND notification_id IN (${placeholders})
             ORDER BY channel ASC`,
        )
        .bind(this.#workspaceId, ...rows.map((row) => row.id))
        .all<DeliveryRow>();

      const byNotification = new Map<string, NotificationDelivery[]>();
      for (const row of deliveries.results ?? []) {
        const list = byNotification.get(row.notification_id) ?? [];
        list.push(rowToDelivery(row));
        byNotification.set(row.notification_id, list);
      }
      return rows.map((row) => ({
        notification: rowToNotification(row),
        deliveries: byNotification.get(row.id) ?? [],
      }));
    } catch (cause) {
      throw new NotificationStorageError("listRecent", { cause });
    }
  }

  async unreadCount(): Promise<number> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS unread FROM notifications
             WHERE workspace_id = ?1 AND read_at IS NULL`,
        )
        .bind(this.#workspaceId)
        .first<{ readonly unread: number }>();
      return row?.unread ?? 0;
    } catch (cause) {
      throw new NotificationStorageError("unreadCount", { cause });
    }
  }

  async markRead(id: string, at: Date): Promise<boolean> {
    try {
      const result = await this.#db
        .prepare(
          `UPDATE notifications SET read_at = ?3
             WHERE workspace_id = ?1 AND id = ?2 AND read_at IS NULL`,
        )
        .bind(this.#workspaceId, id, toStorageTimestamp(at))
        .run();
      return (result.meta?.changes ?? 0) > 0;
    } catch (cause) {
      throw new NotificationStorageError("markRead", { cause });
    }
  }

  async markAllRead(at: Date): Promise<number> {
    try {
      const result = await this.#db
        .prepare(
          `UPDATE notifications SET read_at = ?2
             WHERE workspace_id = ?1 AND read_at IS NULL`,
        )
        .bind(this.#workspaceId, toStorageTimestamp(at))
        .run();
      return result.meta?.changes ?? 0;
    } catch (cause) {
      throw new NotificationStorageError("markAllRead", { cause });
    }
  }

  async purgeReadBefore(before: Date): Promise<number> {
    const cutoff = toStorageTimestamp(before);
    try {
      // `read_at IS NOT NULL` is the whole safety rule: an unread notification is
      // never purged, however old it is.
      //
      // The deliveries are removed EXPLICITLY, in the same batch, rather than
      // left to the foreign key's ON DELETE CASCADE. The cascade is declared and
      // correct, but foreign-key enforcement is a connection setting rather than
      // a schema guarantee, and a purge that silently leaves orphan delivery rows
      // behind would be invisible until the table was large. Deleting both in one
      // batch makes the outcome the same either way.
      const [, notifications] = await this.#db.batch([
        this.#db
          .prepare(
            `DELETE FROM notification_deliveries
               WHERE workspace_id = ?1
                 AND notification_id IN (
                   SELECT id FROM notifications
                     WHERE workspace_id = ?1
                       AND read_at IS NOT NULL
                       AND created_at < ?2
                 )`,
          )
          .bind(this.#workspaceId, cutoff),
        this.#db
          .prepare(
            `DELETE FROM notifications
               WHERE workspace_id = ?1
                 AND read_at IS NOT NULL
                 AND created_at < ?2`,
          )
          .bind(this.#workspaceId, cutoff),
      ]);
      return notifications?.meta?.changes ?? 0;
    } catch (cause) {
      throw new NotificationStorageError("purgeReadBefore", { cause });
    }
  }
}
