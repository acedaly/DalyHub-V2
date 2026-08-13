/**
 * BACKUP-02 — the one assembly of everything the Backups surface renders.
 *
 * ── Why this is not in the route ─────────────────────────────────────────────
 * Two places need it: the Settings loader (first render) and the
 * `/settings/backups/status` GET (polling while a backup runs). If each assembled
 * its own payload, a surface's first paint and its refresh could disagree about
 * health — which is the one thing this feature must never do.
 *
 * It lives HERE rather than in the route because the Settings route is in the
 * client module graph, and a helper that reached `cloudflare:workers` would drag
 * the Workers runtime into the browser bundle. (It did, and the production build
 * refused it — which is exactly what that guard is for.) So the binding arrives as
 * a PARAMETER and this module imports nothing server-only, while each caller reads
 * `env` in its own server-only context.
 */

import type { BackupRunView, BackupStatusView } from "~/kernel/backup";

import {
  readBackupHistory,
  readBackupStatus,
  type BackupServiceEnv,
} from "./backup-service-client";

/**
 * How many runs the surface asks for.
 *
 * Matches what the history list renders, and the backup service caps it again on
 * its own side — a client asking for more cannot get more.
 */
export const BACKUP_HISTORY_LIMIT = 30;

/** Everything the Backups surface needs, in one payload. */
export type BackupSettingsData = {
  readonly status: BackupStatusView;
  readonly history: readonly BackupRunView[];
  /** The owner's timezone, so every instant is formatted in local time. */
  readonly timeZone: string;
};

/**
 * Read status and history together.
 *
 * Both calls are already failure-contained: an unreachable backup service yields
 * "status unavailable" and an empty history rather than throwing, so this never
 * takes the Settings page down with it.
 */
export async function readBackupSettings(
  env: BackupServiceEnv,
  timeZone: string,
): Promise<BackupSettingsData> {
  const [status, history] = await Promise.all([
    readBackupStatus(env),
    readBackupHistory(env, BACKUP_HISTORY_LIMIT),
  ]);
  return { status, history, timeZone };
}
