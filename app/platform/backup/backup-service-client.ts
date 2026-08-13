/**
 * BACKUP-02 — DalyHub's client for the private backup Worker.
 *
 * ── The one path, and what it deliberately is not ────────────────────────────
 *
 *     browser  →  authenticated DalyHub route  →  BACKUP_SERVICE  →  backup Worker
 *
 * The browser never talks to R2, the Workflows API, the D1 export API or the backup
 * Worker. It talks to a DalyHub route behind Cloudflare Access, and that route calls
 * a Worker service binding. No backup credential exists in the application Worker at
 * all — the D1 export token is a secret on the OTHER Worker — so there is nothing
 * here that could be leaked to client JavaScript even by accident.
 *
 * The application Worker also has NO R2 binding. That is the point of BACKUP-02 §4:
 * displaying "your backups are healthy" must not require the Worker that serves the
 * owner's requests to be able to read the owner's entire database in SQL.
 *
 * ── Why the binding is optional ──────────────────────────────────────────────
 * `BACKUP_SERVICE` is declared only in the named `production` environment, because
 * a service binding names a deployed Worker and local development has none. So the
 * binding is read through an OPTIONAL config shape — the same pattern the Access
 * values, the capture email addresses and the calendar encryption key already use
 * (`env as unknown as ...Env`) — and its absence is a supported state that renders
 * as "status unavailable" rather than an error page. `wrangler dev` therefore works
 * unchanged, and so does the credential-free dry-run.
 *
 * ── Failure is contained here ────────────────────────────────────────────────
 * Every call is wrapped. A missing binding, a thrown RPC, a backup Worker that is
 * mid-deploy or a shape that does not validate all produce the same honest answer:
 * status unavailable. Nothing throws into a loader, because "the backup service is
 * temporarily unreachable" must not take the whole Settings page down with it.
 */

import {
  UNAVAILABLE_BACKUP_STATUS,
  parseBackupHistory,
  parseBackupStatus,
  type BackupRunView,
  type BackupStatusView,
} from "~/kernel/backup";

/**
 * The service binding, as this module needs it.
 *
 * Typed structurally rather than by importing the backup Worker's classes: the
 * application must not depend on the backup Worker's source, and the payloads are
 * revalidated at this boundary anyway, so `unknown` is the honest return type.
 */
export interface BackupServiceEnv {
  readonly BACKUP_SERVICE?: {
    status(): Promise<unknown>;
    history(limit?: number): Promise<unknown>;
    trigger(): Promise<unknown>;
  };
}

/** The outcome of asking for a manual backup. */
export type BackupTriggerOutcome =
  | { readonly ok: true; readonly instanceId: string }
  | {
      readonly ok: false;
      /** `running` when one is already in flight; `error` otherwise. */
      readonly kind: "running" | "error";
      readonly message: string;
    };

export const BACKUP_SERVICE_UNAVAILABLE_MESSAGE =
  "Backup status is temporarily unavailable.";

const TRIGGER_UNAVAILABLE_MESSAGE =
  "The backup service is unreachable, so a backup could not be started.";

function log(event: string, reason: string): void {
  // One line, only on the paths that matter. Deliberately NOT logged on a normal
  // successful render: a status read happens on every visit to the section, and a
  // log line per page view is noise that buries the failures worth seeing.
  console.error(JSON.stringify({ backupService: event, reason }));
}

function service(env: BackupServiceEnv) {
  return env.BACKUP_SERVICE;
}

/**
 * Read backup status. Never throws; never reports health it could not confirm.
 */
export async function readBackupStatus(
  env: BackupServiceEnv,
): Promise<BackupStatusView> {
  const binding = service(env);
  if (binding === undefined) {
    // Expected in local development, and a genuine misconfiguration in
    // production. Same honest surface either way.
    return UNAVAILABLE_BACKUP_STATUS;
  }
  try {
    return parseBackupStatus(await binding.status());
  } catch (error) {
    log(
      "status-failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return UNAVAILABLE_BACKUP_STATUS;
  }
}

/** Read recent runs. An unreachable service has no history, not an error. */
export async function readBackupHistory(
  env: BackupServiceEnv,
  limit?: number,
): Promise<readonly BackupRunView[]> {
  const binding = service(env);
  if (binding === undefined) return [];
  try {
    return parseBackupHistory(await binding.history(limit));
  } catch (error) {
    log(
      "history-failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ask the backup Worker to start a manual backup.
 *
 * This forwards; it does not implement a backup. The backup Worker owns the
 * decision to refuse while one is already running, so the "don't start two"
 * guarantee lives next to the state it depends on rather than in a React handler.
 */
export async function triggerBackup(
  env: BackupServiceEnv,
): Promise<BackupTriggerOutcome> {
  const binding = service(env);
  if (binding === undefined) {
    log("trigger-unavailable", "the BACKUP_SERVICE binding is not configured");
    return {
      ok: false,
      kind: "error",
      message: TRIGGER_UNAVAILABLE_MESSAGE,
    };
  }

  let result: unknown;
  try {
    result = await binding.trigger();
  } catch (error) {
    log(
      "trigger-failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, kind: "error", message: TRIGGER_UNAVAILABLE_MESSAGE };
  }

  if (!isRecord(result)) {
    log("trigger-failed", "the backup service returned an unreadable result");
    return { ok: false, kind: "error", message: TRIGGER_UNAVAILABLE_MESSAGE };
  }

  if (result.accepted === true && typeof result.instanceId === "string") {
    return { ok: true, instanceId: result.instanceId };
  }

  const kind = result.status === "running" ? "running" : "error";
  // The message is the service's own canned sentence when it sent one; never
  // free-form text from an error.
  const message =
    typeof result.message === "string" && result.message !== ""
      ? result.message.slice(0, 200)
      : kind === "running"
        ? "A backup is already running."
        : TRIGGER_UNAVAILABLE_MESSAGE;
  if (kind === "error") log("trigger-refused", message);
  return { ok: false, kind, message };
}
