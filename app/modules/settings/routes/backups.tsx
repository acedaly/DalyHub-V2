/**
 * BACKUP-02 — the backup endpoints (`/settings/backups/:action`).
 *
 * Two actions, and each has exactly the HTTP method it should:
 *
 *   GET  /settings/backups/status   sanitised status + recent history, for polling
 *   POST /settings/backups/run      start a manual backup
 *
 * ── Why this one has a GET, when its siblings deliberately do not ────────────
 * The other Settings resource routes (`restore`, `capture`, `calendars`,
 * `account-security`) are POST-only, and the reason is stated in each: they accept
 * or return a credential, so nothing about them should be reachable by following a
 * link or replayable from history. Neither is true here. Backup status is sanitised
 * operational metadata — health, timestamps, sizes, retention — and reading it
 * changes nothing. It needs a GET because the surface POLLS it while a backup runs,
 * and re-running the whole Settings loader every few seconds to learn one boolean
 * would read the owner's preferences, AI policy and usage ledger each time.
 *
 * ── What cannot come back through here ───────────────────────────────────────
 * No SQL. No signed URL. No API token. No R2 credential. The response is built
 * from `BackupStatusView`/`BackupRunView`, which are validated projections — if a
 * field cannot be added to those types it cannot reach the browser, and neither
 * type can express a dump or a credential. The application Worker has no R2
 * binding at all, so there is no code path from here to a backup's contents.
 *
 * ── No restore, no delete ────────────────────────────────────────────────────
 * There is deliberately no `restore`, `delete`, `purge` or `import` action, and
 * BACKUP-02 does not add one. Production restoration is an operator action taken
 * outside DalyHub with the CLI — see docs/development/BACKUP_AND_RESTORE.md §5.
 */

import { env } from "cloudflare:workers";

import {
  readBackupSettings,
  triggerBackup,
  type BackupServiceEnv,
} from "~/platform/backup";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/backups";

/**
 * The service binding is declared only in the named `production` environment, so
 * it is absent from the generated `Env` type and read through the optional config
 * shape — the same pattern the Access values and the calendar encryption key use.
 */
const backupEnv = env as unknown as BackupServiceEnv;

export type BackupActionResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Backup state changes underneath the page; a cached "Healthy" would be
      // the single most misleading thing this endpoint could serve.
      "cache-control": "no-store",
    },
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  if (String(params.action ?? "") !== "status") {
    throw new Response("Not Found", { status: 404 });
  }
  // Fails closed: no session, no status. Cloudflare Access and the `OWNER_EMAIL`
  // gate have already run at the Worker boundary; this is the application-level
  // half of the same rule, and it is why there is no anonymous status endpoint.
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const timeZone = await scope.ownerTimeZone().catch(() => "UTC");
  return json(await readBackupSettings(backupEnv, timeZone));
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  if (String(params.action ?? "") !== "run") {
    throw new Response("Not Found", { status: 404 });
  }
  const session = requireAuthenticatedSession(context);
  // Resolved even though the backup is workspace-independent: it proves the caller
  // is a provisioned member of this workspace rather than merely holding a valid
  // session, which is the authorisation pattern every other mutation here uses.
  await resolveAuthenticatedWorkspaceScope(env, session);

  const outcome = await triggerBackup(backupEnv);
  if (outcome.ok) {
    return json({
      ok: true,
      message: "Backup started.",
    } satisfies BackupActionResult);
  }
  // "Already running" is not an error the owner caused, so it is reported as a
  // plain conflict with the service's own sentence rather than as a failure.
  return json(
    { ok: false, message: outcome.message } satisfies BackupActionResult,
    outcome.kind === "running" ? 409 : 503,
  );
}
