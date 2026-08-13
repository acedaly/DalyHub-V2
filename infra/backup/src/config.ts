/**
 * BACKUP-01 — the backup Worker's environment, and the check that it is real.
 *
 * ── Why the committed config holds placeholders ───────────────────────────────
 * DalyHub's established convention is that no real production identifier is
 * committed: `wrangler.jsonc` carries an explicit placeholder D1 id, and
 * `scripts/deploy-production.mjs` / `scripts/production-d1.mjs` inject the real
 * value at the moment of use into a config written OUTSIDE the repository. The
 * backup Worker follows the same convention for the same reason — the
 * alternative is asking the owner to hand-edit a committed file immediately
 * before a production operation, which is exactly how a real identifier gets
 * committed by accident.
 *
 * The consequence is that a placeholder COULD be deployed if the deploy script
 * were bypassed, so the Worker refuses to run against one. That refusal is the
 * point: a backup Worker pointed at a non-existent database would otherwise fail
 * nightly with a 404 that reads like a Cloudflare problem, rather than saying
 * plainly that it was never configured.
 *
 * ── Secrets versus vars ───────────────────────────────────────────────────────
 * `D1_REST_API_TOKEN` is a Worker SECRET (`wrangler secret put`), never a var,
 * never in the config file, never in the repository. Everything else here is
 * non-secret configuration. The two are kept apart deliberately: a committed
 * `var` of the same name would override a deploy-time secret and silently
 * clobber it, which is the trap `wrangler.jsonc` already documents for the
 * Access values.
 */

import type { BackupTrigger } from "./object-key";

/** The backup Worker's bindings and configuration. */
export interface BackupEnv {
  /** The private R2 bucket backups are written to. */
  BACKUPS: R2Bucket;
  /** The Workflow binding, used only to trigger instances. */
  BACKUP_WORKFLOW: Workflow<BackupParams>;

  /** Non-secret configuration. */
  CLOUDFLARE_ACCOUNT_ID: string;
  D1_DATABASE_ID: string;
  D1_DATABASE_NAME: string;
  BACKUP_ENVIRONMENT: string;
  /** Optional: the commit the Worker was built from, recorded in metadata. */
  WORKER_COMMIT?: string;

  /** Secret. Supplied by `wrangler secret put D1_REST_API_TOKEN`. */
  D1_REST_API_TOKEN: string;
}

/** Parameters a caller may pass when triggering an instance by hand. */
export interface BackupParams {
  /**
   * Force a tier. Normally unnecessary: an instance created by the Workflow's
   * own cron schedule is `daily` and anything else is `manual`, which is the
   * correct answer without a parameter. This exists so a scripted manual run can
   * be explicit, and so the intent is visible in the instance's own parameters.
   */
  trigger?: BackupTrigger;
}

/** The committed placeholders that must never reach a real backup run. */
export const CONFIG_PLACEHOLDERS = [
  "PLACEHOLDER_SET_REAL_CLOUDFLARE_ACCOUNT_ID",
  "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
  "local-development-placeholder-not-provisioned",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX32_PATTERN = /^[0-9a-f]{32}$/i;

/** Configuration proved usable, with the secret separated from the rest. */
export interface BackupConfig {
  accountId: string;
  databaseId: string;
  databaseName: string;
  environment: string;
  workerCommit?: string;
  apiToken: string;
}

/**
 * Validate the environment. PURE — returns problems rather than throwing, so
 * every one can be reported at once instead of the operator fixing them one
 * failed nightly run at a time.
 *
 * The secret's PRESENCE is checked; its value is never inspected, compared,
 * logged or included in a problem string.
 */
export function checkBackupConfig(
  env: Partial<BackupEnv>,
):
  | { ok: true; config: BackupConfig; problems: [] }
  | { ok: false; problems: string[] } {
  const problems: string[] = [];

  const read = (name: keyof BackupEnv): string =>
    typeof env[name] === "string" ? (env[name] as string).trim() : "";

  const accountId = read("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = read("D1_DATABASE_ID");
  const databaseName = read("D1_DATABASE_NAME");
  const environment = read("BACKUP_ENVIRONMENT");
  const workerCommit = read("WORKER_COMMIT");
  const apiToken = read("D1_REST_API_TOKEN");

  if (accountId === "") {
    problems.push("CLOUDFLARE_ACCOUNT_ID is not set.");
  } else if (CONFIG_PLACEHOLDERS.includes(accountId)) {
    problems.push(
      `CLOUDFLARE_ACCOUNT_ID is the committed placeholder "${accountId}".`,
    );
  } else if (!HEX32_PATTERN.test(accountId)) {
    problems.push("CLOUDFLARE_ACCOUNT_ID is not a Cloudflare account id.");
  }

  if (databaseId === "") {
    problems.push("D1_DATABASE_ID is not set.");
  } else if (CONFIG_PLACEHOLDERS.includes(databaseId)) {
    problems.push(
      `D1_DATABASE_ID is the committed placeholder "${databaseId}".`,
    );
  } else if (!UUID_PATTERN.test(databaseId)) {
    problems.push("D1_DATABASE_ID must be the provisioned D1 UUID.");
  }

  if (databaseName === "") problems.push("D1_DATABASE_NAME is not set.");
  if (environment === "") problems.push("BACKUP_ENVIRONMENT is not set.");

  if (apiToken === "") {
    problems.push(
      'The D1_REST_API_TOKEN secret is not set. Run: wrangler secret put D1_REST_API_TOKEN --config infra/backup/wrangler.jsonc (the token needs "D1 Edit" on this account).',
    );
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    problems: [],
    config: {
      accountId,
      databaseId,
      databaseName,
      environment,
      workerCommit: workerCommit === "" ? undefined : workerCommit,
      apiToken,
    },
  };
}
