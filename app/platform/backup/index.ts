/**
 * BACKUP-02 — the backup platform: DalyHub's client for the private backup Worker.
 *
 * ── Why this is NOT a `.server.ts` module ────────────────────────────────────
 * Every other adapter in `app/platform` that talks to a binding is suffixed
 * `.server.ts`, and the first draft of this one was too. It was wrong, and the
 * production build caught it: React Router refuses a `.server` module that the
 * client graph can reach, and the Settings route imports this module's data
 * helper for its loader.
 *
 * The suffix was wrong on the merits as well as mechanically. This module imports
 * nothing server-only — no `cloudflare:workers`, no `node:*`, no secret. It takes
 * the service binding as a PARAMETER (`BackupServiceEnv`) and is otherwise pure
 * logic over a validated payload. The thing that is genuinely server-only is the
 * ROUTE, which reads `env` and passes it in; that is where the boundary belongs.
 *
 * Nothing here can leak to a browser bundle either way: without an `env` argument
 * these functions have nothing to call, and the binding only exists on the server.
 */

export {
  BACKUP_SERVICE_UNAVAILABLE_MESSAGE,
  readBackupHistory,
  readBackupStatus,
  triggerBackup,
  type BackupServiceEnv,
  type BackupTriggerOutcome,
} from "./backup-service-client";

export {
  BACKUP_HISTORY_LIMIT,
  readBackupSettings,
  type BackupSettingsData,
} from "./backup-settings";
