/**
 * NOTIFY-01 — the D1 notification settings store.
 *
 * Workspace- AND owner-scoped, like `owner_app_preferences` and
 * `workspace_ai_preferences`. The workspace comes from the composition boundary
 * and the owner from the trusted actor context; neither is ever a request value
 * (ADR-010).
 *
 * ── The credential boundary is the SQL, not a convention ────────────────────
 * {@link COLUMNS} does not select `pushover_user_key` or `pushover_app_token`.
 * Two methods select them explicitly — the scheduled sender's `listEnabledSenders`
 * and the validation action's `getWithSecrets` — and nothing that renders calls
 * either. A loader therefore cannot leak a Pushover key even by accident, in the
 * same way a calendar feed URL cannot.
 *
 * ── Why the credentials are in the database at all ──────────────────────────
 * They are the OWNER's credentials, not the deployment's: they identify the
 * owner's Pushover account and their DalyHub application registration, and they
 * change when the owner changes them rather than when the Worker is redeployed.
 * Putting them in `wrangler secret` would make "turn on notifications" a deploy.
 * This is a single-owner deployment behind Cloudflare Access, and the trade is
 * accepted knowingly — see the ADR.
 *
 * Records no Activity (ADR-012): configuration is not history.
 */

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationStorageError,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type NotificationSettingsRepository,
  type NotificationSettingsWithSecrets,
} from "~/kernel/notifications";
import { systemClock } from "~/kernel/entities";
import type { Clock } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface SettingsRow {
  readonly owner_id: string;
  readonly enabled: number;
  readonly digest_enabled: number;
  readonly asset_obligations_enabled: number;
  readonly digest_send_time: string;
  readonly timezone: string | null;
  readonly pushover_enabled: number;
  readonly pushover_configured: number;
  readonly pushover_validated_at: string | null;
  readonly version: number;
}

interface SecretRow extends SettingsRow {
  readonly pushover_user_key: string | null;
  readonly pushover_app_token: string | null;
}

/**
 * The ordinary read. `pushover_configured` is DERIVED in SQL rather than
 * selected: the surface needs to know whether keys are stored, and knowing that
 * must not require reading them.
 */
const COLUMNS =
  "owner_id, enabled, digest_enabled, asset_obligations_enabled, " +
  "digest_send_time, timezone, pushover_enabled, " +
  "(CASE WHEN pushover_user_key IS NOT NULL AND pushover_app_token IS NOT NULL " +
  "THEN 1 ELSE 0 END) AS pushover_configured, " +
  "pushover_validated_at, version";

/** The same read PLUS the credentials. Two callers, both named in the header. */
const SECRET_COLUMNS = `${COLUMNS}, pushover_user_key, pushover_app_token`;

function rowToSettings(row: SettingsRow): NotificationSettings {
  return {
    enabled: row.enabled === 1,
    digestEnabled: row.digest_enabled === 1,
    assetObligationsEnabled: row.asset_obligations_enabled === 1,
    digestSendTime: row.digest_send_time,
    timeZone: row.timezone,
    pushoverEnabled: row.pushover_enabled === 1,
    pushoverConfigured: row.pushover_configured === 1,
    pushoverValidatedAt:
      row.pushover_validated_at === null
        ? null
        : fromStorageTimestamp(row.pushover_validated_at),
    version: row.version,
  };
}

function rowToSecrets(row: SecretRow): NotificationSettingsWithSecrets {
  return {
    ...rowToSettings(row),
    ownerId: row.owner_id,
    pushoverUserKey: row.pushover_user_key,
    pushoverAppToken: row.pushover_app_token,
  };
}

export type D1NotificationSettingsRepositoryOptions = {
  readonly clock?: Clock;
};

export class D1NotificationSettingsRepository implements NotificationSettingsRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1NotificationSettingsRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
  }

  async get(ownerId: string): Promise<NotificationSettings> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM notification_settings
             WHERE workspace_id = ?1 AND owner_id = ?2`,
        )
        .bind(this.#workspaceId, ownerId)
        .first<SettingsRow>();
      // An absent row and a disabled row are the SAME state, so there is nothing
      // to create on first read. Notifications are off until the owner says
      // otherwise, and a deployment that never visits Settings writes nothing.
      return row === null
        ? { ...DEFAULT_NOTIFICATION_SETTINGS, version: 0 }
        : rowToSettings(row);
    } catch (cause) {
      throw new NotificationStorageError("get", { cause });
    }
  }

  async getWithSecrets(
    ownerId: string,
  ): Promise<NotificationSettingsWithSecrets> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${SECRET_COLUMNS} FROM notification_settings
             WHERE workspace_id = ?1 AND owner_id = ?2`,
        )
        .bind(this.#workspaceId, ownerId)
        .first<SecretRow>();
      return row === null
        ? {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            version: 0,
            ownerId,
            pushoverUserKey: null,
            pushoverAppToken: null,
          }
        : rowToSecrets(row);
    } catch (cause) {
      throw new NotificationStorageError("getWithSecrets", { cause });
    }
  }

  async listEnabledSenders(): Promise<
    readonly NotificationSettingsWithSecrets[]
  > {
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${SECRET_COLUMNS} FROM notification_settings
             WHERE workspace_id = ?1 AND enabled = 1
             ORDER BY owner_id ASC`,
        )
        .bind(this.#workspaceId)
        .all<SecretRow>();
      return (result.results ?? []).map(rowToSecrets);
    } catch (cause) {
      throw new NotificationStorageError("listEnabledSenders", { cause });
    }
  }

  async update(
    ownerId: string,
    patch: NotificationSettingsPatch,
  ): Promise<NotificationSettings> {
    // Read-modify-write over a whole row rather than a per-column upsert.
    //
    // The columns here are NOT independent — changing a credential must clear the
    // validation stamp and disable the channel, and that rule is easier to state
    // once, here, than to encode in a partial `ON CONFLICT` assignment list. The
    // cost is that two settings saved at the same instant resolve last-write-wins
    // rather than merging; this is a single-owner product with one Settings form,
    // so that is the honest trade rather than an oversight.
    const current = await this.getWithSecrets(ownerId);
    const next = { ...current, ...patch };

    // A credential that CHANGED is a credential that has not been proven. The
    // stamp is cleared and the channel is switched off, which the database also
    // insists on (the CHECK on `notification_settings`) — this is what makes
    // "validate before enable" survive a key being swapped for a wrong one.
    const userKey =
      patch.pushoverUserKey !== undefined
        ? patch.pushoverUserKey
        : current.pushoverUserKey;
    const appToken =
      patch.pushoverAppToken !== undefined
        ? patch.pushoverAppToken
        : current.pushoverAppToken;
    const credentialsChanged =
      userKey !== current.pushoverUserKey ||
      appToken !== current.pushoverAppToken;
    const validatedAt = credentialsChanged ? null : current.pushoverValidatedAt;
    const pushoverEnabled =
      (patch.pushoverEnabled ?? current.pushoverEnabled) &&
      userKey !== null &&
      appToken !== null &&
      validatedAt !== null;

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    try {
      const row = await this.#db
        .prepare(
          `INSERT INTO notification_settings (
             workspace_id, owner_id, enabled, digest_enabled,
             asset_obligations_enabled, digest_send_time, timezone,
             pushover_enabled, pushover_user_key, pushover_app_token,
             pushover_validated_at, version, created_at, updated_at
           )
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12)
           ON CONFLICT (workspace_id, owner_id) DO UPDATE SET
             enabled = excluded.enabled,
             digest_enabled = excluded.digest_enabled,
             asset_obligations_enabled = excluded.asset_obligations_enabled,
             digest_send_time = excluded.digest_send_time,
             timezone = excluded.timezone,
             pushover_enabled = excluded.pushover_enabled,
             pushover_user_key = excluded.pushover_user_key,
             pushover_app_token = excluded.pushover_app_token,
             pushover_validated_at = excluded.pushover_validated_at,
             version = notification_settings.version + 1,
             updated_at = excluded.updated_at
           RETURNING ${COLUMNS}`,
        )
        .bind(
          this.#workspaceId,
          ownerId,
          next.enabled ? 1 : 0,
          next.digestEnabled ? 1 : 0,
          next.assetObligationsEnabled ? 1 : 0,
          next.digestSendTime,
          next.timeZone,
          pushoverEnabled ? 1 : 0,
          userKey,
          appToken,
          validatedAt === null ? null : toStorageTimestamp(validatedAt),
          nowTs,
        )
        .first<SettingsRow>();
      if (row === null) throw new Error("no row returned");
      return rowToSettings(row);
    } catch (cause) {
      throw new NotificationStorageError("update", { cause });
    }
  }

  async recordPushoverValidation(ownerId: string, at: Date): Promise<void> {
    try {
      const result = await this.#db
        .prepare(
          `UPDATE notification_settings
             SET pushover_validated_at = ?3, updated_at = ?3,
                 version = version + 1
             WHERE workspace_id = ?1 AND owner_id = ?2
               AND pushover_user_key IS NOT NULL
               AND pushover_app_token IS NOT NULL`,
        )
        .bind(this.#workspaceId, ownerId, toStorageTimestamp(at))
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        // Nothing to stamp: there are no stored credentials to have validated.
        // Saying so here keeps the route from reporting a successful test
        // against keys that were never saved.
        throw new NotificationStorageError("recordPushoverValidation");
      }
    } catch (cause) {
      if (cause instanceof NotificationStorageError) throw cause;
      throw new NotificationStorageError("recordPushoverValidation", { cause });
    }
  }
}
