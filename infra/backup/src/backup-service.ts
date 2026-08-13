/**
 * BACKUP-02 — the internal backup service, reachable ONLY over a Worker service
 * binding.
 *
 * ── Why this is an RPC entrypoint and not an HTTP API ────────────────────────
 * BACKUP-02 needs DalyHub to display backup health, which means the application
 * Worker needs to ask something about the backups. The obvious implementation is
 * a few routes on this Worker's `fetch` handler. That was rejected.
 *
 * A named `WorkerEntrypoint` bound with `entrypoint: "BackupService"` is reachable
 * only through the service binding — there is no URL that reaches these methods,
 * so no route, custom domain, `workers.dev` origin or Access misconfiguration can
 * ever expose them. The default export's `fetch` stays a flat 404. That is a
 * structural guarantee rather than a policy, which is the right shape for the one
 * Worker that can read the owner's entire database.
 *
 * ── What crosses the boundary ────────────────────────────────────────────────
 * Sanitised operational metadata only: health, timestamps, sizes, retention, a
 * trigger label, and a canned failure sentence chosen by stage. Never a dump,
 * never a byte of one, never a signed URL, never a token, never an object body.
 * `BackupStatus` and `BackupRunRecord` ARE the leak boundary — if a field cannot
 * be added to those types, it cannot reach the application, let alone a browser.
 *
 * The application does not trust this shape either: it re-validates everything at
 * its own boundary (`app/kernel/backup`). Two independent checks on one payload is
 * the correct amount for data that decides whether the owner believes their
 * backups are working.
 */

import { WorkerEntrypoint } from "cloudflare:workers";

import {
  BACKUP_GRACE_HOURS,
  BACKUP_INTERVAL_HOURS,
  BACKUP_SCHEDULE_CRON,
  BACKUP_STALE_AFTER_HOURS,
  calculateBackupHealth,
  runBlocksNewBackup,
  type BackupHealth,
  type BackupHealthReason,
} from "./backup-health";
import { checkBackupConfig, type BackupEnv } from "./config";
import { logError, logInfo } from "./logging";
import { BACKUP_RETENTION_DAYS } from "./object-key";
import { RUN_LOG_LIMIT, type BackupRunRecord } from "./run-records";
import { countRetainedBackups, readRunLog } from "./status-store";

/** Re-exported so callers of the service need only one import. */
export { BACKUP_SCHEDULE_CRON };

/** Everything `status()` returns. This type is the leak boundary. */
export interface BackupStatus {
  /**
   * Whether backup state could be read. `false` means "we do not know", which the
   * UI must render as "status unavailable" and never as a failure.
   */
  readonly available: boolean;
  readonly health: BackupHealth;
  readonly reason: BackupHealthReason;
  readonly latestAttempt: BackupRunRecord | null;
  readonly lastSuccessfulBackup: BackupRunRecord | null;
  /** How many dumps are currently retained, and whether the count is exact. */
  readonly retainedBackupCount: number;
  readonly retainedBackupCountExact: boolean;
  readonly retentionDays: {
    readonly daily: number;
    readonly manual: number;
  };
  /** The cron expression, and the fact that it is UTC — never a local time. */
  readonly schedule: string;
  readonly scheduleTimeZone: "UTC";
  readonly intervalHours: number;
  readonly graceHours: number;
  readonly staleAfterHours: number;
  /** The database being backed up, by NAME. Not its id. */
  readonly databaseName: string | null;
}

export interface BackupHistory {
  readonly available: boolean;
  readonly runs: readonly BackupRunRecord[];
}

export type BackupTriggerResult =
  | {
      readonly accepted: true;
      readonly instanceId: string;
      readonly status: "queued";
    }
  | {
      readonly accepted: false;
      /** `running` — one is already in flight. `error` — it could not be started. */
      readonly status: "running" | "error";
      readonly message: string;
    };

/**
 * How many runs `history()` returns by default, and at most.
 *
 * Capped at the rolling log's own length: asking for more cannot return more, and
 * a status screen that pages through a year of backups is not the feature.
 */
export const HISTORY_DEFAULT_LIMIT = RUN_LOG_LIMIT;

export class BackupService extends WorkerEntrypoint<BackupEnv> {
  /** Backup health and the facts the summary card renders. */
  async status(): Promise<BackupStatus> {
    const config = checkBackupConfig(this.env);
    const databaseName = config.ok ? config.config.databaseName : null;

    const log = await readRunLog(this.env.BACKUPS);
    if (log === null) {
      // Storage could not be read. Say so; do not guess.
      logError("status-unavailable", {
        reason: "the backup run log could not be read",
      });
      return this.#status({
        available: false,
        health: "unknown",
        reason: "unavailable",
        latestAttempt: null,
        lastSuccessfulBackup: null,
        retained: { count: 0, exact: false },
        databaseName,
      });
    }

    const verdict = calculateBackupHealth({
      runs: log,
      available: true,
      now: new Date(),
    });

    let retained = { count: 0, exact: false };
    try {
      retained = await countRetainedBackups(this.env.BACKUPS);
    } catch {
      // A failed count must not turn a healthy report into an unavailable one:
      // the count is supporting detail, not the verdict.
      logError("retained-count-failed", {
        reason: "the backup objects could not be counted",
      });
    }

    return this.#status({
      available: true,
      health: verdict.health,
      reason: verdict.reason,
      latestAttempt: verdict.latestAttempt,
      lastSuccessfulBackup: verdict.lastSuccess,
      retained,
      databaseName,
    });
  }

  /** Recent runs, newest first. */
  async history(limit = HISTORY_DEFAULT_LIMIT): Promise<BackupHistory> {
    const log = await readRunLog(this.env.BACKUPS);
    if (log === null) {
      logError("history-unavailable", {
        reason: "the backup run log could not be read",
      });
      return { available: false, runs: [] };
    }
    const bounded = Math.max(
      1,
      Math.min(Math.trunc(limit) || HISTORY_DEFAULT_LIMIT, RUN_LOG_LIMIT),
    );
    return { available: true, runs: log.slice(0, bounded) };
  }

  /**
   * Start a manual backup.
   *
   * Refuses while a run is genuinely in flight, so a double-press or an impatient
   * second click cannot start two exports. It does NOT implement a second backup
   * path — it creates an instance of the one BACKUP-01 Workflow.
   */
  async trigger(): Promise<BackupTriggerResult> {
    const config = checkBackupConfig(this.env);
    if (!config.ok) {
      logError("trigger-refused", { reason: config.problems.join(" ") });
      return {
        accepted: false,
        status: "error",
        message:
          "The backup service is not fully configured, so a backup cannot be started.",
      };
    }

    const now = new Date();
    const log = await readRunLog(this.env.BACKUPS);
    if (log !== null) {
      const inFlight = log.find((run) => runBlocksNewBackup(run, now));
      if (inFlight !== undefined) {
        return {
          accepted: false,
          status: "running",
          message: "A backup is already running.",
        };
      }
    }
    // A `null` log does not block the trigger. Being unable to read the history is
    // not a reason to refuse to take a backup — it is a reason to take one.

    try {
      const instance = await this.env.BACKUP_WORKFLOW.create({
        params: { trigger: "manual" },
      });
      logInfo("manual-trigger-accepted", {
        trigger: "manual",
        instanceId: instance.id,
      });
      return { accepted: true, instanceId: instance.id, status: "queued" };
    } catch (error) {
      logError("manual-trigger-failed", {
        trigger: "manual",
        reason: error instanceof Error ? error.message : "unknown error",
      });
      return {
        accepted: false,
        status: "error",
        message: "The backup could not be started. Please try again.",
      };
    }
  }

  /** Assemble the status payload, so every return path has the same shape. */
  #status(parts: {
    available: boolean;
    health: BackupHealth;
    reason: BackupHealthReason;
    latestAttempt: BackupRunRecord | null;
    lastSuccessfulBackup: BackupRunRecord | null;
    retained: { count: number; exact: boolean };
    databaseName: string | null;
  }): BackupStatus {
    return {
      available: parts.available,
      health: parts.health,
      reason: parts.reason,
      latestAttempt: parts.latestAttempt,
      lastSuccessfulBackup: parts.lastSuccessfulBackup,
      retainedBackupCount: parts.retained.count,
      retainedBackupCountExact: parts.retained.exact,
      retentionDays: {
        daily: BACKUP_RETENTION_DAYS.daily,
        manual: BACKUP_RETENTION_DAYS.manual,
      },
      schedule: BACKUP_SCHEDULE_CRON,
      scheduleTimeZone: "UTC",
      intervalHours: BACKUP_INTERVAL_HOURS,
      graceHours: BACKUP_GRACE_HOURS,
      staleAfterHours: BACKUP_STALE_AFTER_HOURS,
      databaseName: parts.databaseName,
    };
  }
}
