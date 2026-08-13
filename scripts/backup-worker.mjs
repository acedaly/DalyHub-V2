/**
 * BACKUP-01 — the operator's interface to the production backup Worker.
 *
 * ── What this is for ──────────────────────────────────────────────────────────
 * `dalyhub-v2-backup` is a separate Worker hosting the
 * `dalyhub-production-backup` Workflow, which exports the production D1 database
 * to the private `dalyhub-v2-backups` R2 bucket once a night. Everything an
 * operator needs to do to it — provision it, deploy it, set its secret, run a
 * backup by hand, look at what happened, find and fetch a backup — goes through
 * here so there is one documented path rather than a folder of remembered
 * Wrangler invocations.
 *
 * ── Why no generated config ───────────────────────────────────────────────────
 * `scripts/production-d1.mjs` writes a temporary Wrangler config outside the
 * repository because a D1 *migrations* command needs the real database id inside
 * the config file. A deploy does not: `wrangler deploy --var NAME:VALUE`
 * overrides a `var` directly, so the real account and database ids are passed on
 * the invocation and the committed `infra/backup/wrangler.jsonc` keeps its
 * placeholders. That is strictly better — no real identifier is ever written to
 * disk, not even to a temporary file, and there is no second copy of the config
 * to drift from the committed one.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   pnpm run backup:provision                 create the bucket + lifecycle rules
 *   pnpm run backup:secret                    set D1_REST_API_TOKEN (interactive)
 *   pnpm run backup:deploy                    deploy the Worker + Workflow
 *   pnpm run db:production:backup             run a backup NOW (manual tier)
 *   pnpm run db:production:backup:list        list stored backups
 *   pnpm run backup:status [<instance-id>]    inspect a Workflow run
 *   pnpm run backup:verify                    assert the live configuration
 *   node scripts/backup-worker.mjs download <key> --output <file>
 *
 * Authenticate Wrangler with `wrangler login` (OS keychain) or
 * `CLOUDFLARE_API_TOKEN`. No secret is ever passed on a command line by this
 * script: the D1 export token is typed into `wrangler secret put`'s own prompt.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "infra", "backup", "wrangler.jsonc");

export const WORKER_NAME = "dalyhub-v2-backup";
export const WORKFLOW_NAME = "dalyhub-production-backup";
export const BUCKET_NAME = "dalyhub-v2-backups";
export const BACKUP_CRON = "0 16 * * *";

/**
 * The two lifecycle rules that ARE the retention policy.
 *
 * Retention is enforced by R2, not by deletion code in the Worker. A backup
 * system that deletes its own backups is one bug away from removing the thing it
 * exists to keep, and R2 lifecycle rules are declarative, inspectable and
 * outside the code path that could be wrong.
 *
 * Neither rule transitions to Infrequent Access: BACKUP-01 deliberately does not
 * add a storage tier: 90 daily copies of a ~1.4 MB database is a trivial amount
 * of Standard storage, and IA adds a retrieval cost and a minimum-duration
 * charge to the exact objects an emergency needs quickly.
 */
export const LIFECYCLE_RULES = [
  {
    id: "dalyhub-daily-backups-90-days",
    prefix: "production/daily/",
    expireDays: 90,
  },
  {
    id: "dalyhub-manual-backups-365-days",
    prefix: "production/manual/",
    expireDays: 365,
  },
];

const PLACEHOLDERS = [
  "PLACEHOLDER_SET_REAL_CLOUDFLARE_ACCOUNT_ID",
  "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
  "local-development-placeholder-not-provisioned",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Validate the real production identifiers supplied by the environment. PURE.
 *
 * Reuses the variable names the repository already uses for production
 * operations (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`) rather than
 * inventing backup-specific ones — see docs/development/DEPLOYMENT.md.
 *
 * Typed as a plain record rather than `NodeJS.ProcessEnv`: the repository
 * augments `ProcessEnv` with the application's own required variables, and a
 * test supplying just these two should not have to invent the others.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true, problems: string[], accountId: string, databaseId: string }
 *          | { ok: false, problems: string[] }}
 */
export function checkProductionIdentifiers(env = process.env) {
  const problems = [];
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const databaseId = (env.CLOUDFLARE_D1_DATABASE_ID ?? "").trim();

  if (accountId === "") {
    problems.push(
      "CLOUDFLARE_ACCOUNT_ID is not set. Supply the real Cloudflare account id.",
    );
  } else if (PLACEHOLDERS.includes(accountId)) {
    problems.push(
      `CLOUDFLARE_ACCOUNT_ID is the committed placeholder "${accountId}".`,
    );
  } else if (!ACCOUNT_PATTERN.test(accountId)) {
    problems.push(
      "CLOUDFLARE_ACCOUNT_ID must be a 32-character Cloudflare account id.",
    );
  }

  if (databaseId === "") {
    problems.push(
      "CLOUDFLARE_D1_DATABASE_ID is not set. Supply the real provisioned production D1 database id (a UUID).",
    );
  } else if (PLACEHOLDERS.includes(databaseId)) {
    problems.push(
      `CLOUDFLARE_D1_DATABASE_ID is the committed placeholder "${databaseId}".`,
    );
  } else if (!UUID_PATTERN.test(databaseId)) {
    problems.push("CLOUDFLARE_D1_DATABASE_ID must be a UUID.");
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, problems: [], accountId, databaseId };
}

/**
 * Assert the committed backup config still has the properties that keep this
 * Worker private. PURE over the file's TEXT.
 *
 * Deliberately a textual check rather than a JSONC parse: the properties that
 * matter are few and exact, and a hand-rolled comment-stripper is a worse thing
 * to trust than a regexp whose failure mode is "refuses a valid config" rather
 * than "accepts a public one".
 *
 * @param {string} text
 * @returns {string[]} problems
 */
export function checkCommittedBackupConfig(text) {
  const problems = [];
  if (!/"workers_dev"\s*:\s*false/.test(text)) {
    problems.push(
      'infra/backup/wrangler.jsonc must set "workers_dev": false — the backup Worker must have no public origin.',
    );
  }
  if (!/"preview_urls"\s*:\s*false/.test(text)) {
    problems.push(
      'infra/backup/wrangler.jsonc must set "preview_urls": false — preview URLs are an unauthenticated origin.',
    );
  }
  if (/"routes"\s*:/.test(text) || /"route"\s*:/.test(text)) {
    problems.push(
      "infra/backup/wrangler.jsonc declares a route. The backup Worker must not be reachable.",
    );
  }
  if (
    !new RegExp(
      `"schedules"\\s*:\\s*\\["${escapeRegExp(BACKUP_CRON)}"\\]`,
    ).test(text)
  ) {
    problems.push(
      `infra/backup/wrangler.jsonc must schedule the Workflow with "${BACKUP_CRON}" (UTC).`,
    );
  }
  if (!new RegExp(`"bucket_name"\\s*:\\s*"${BUCKET_NAME}"`).test(text)) {
    problems.push(
      `infra/backup/wrangler.jsonc must bind the "${BUCKET_NAME}" bucket.`,
    );
  }
  return problems;
}

/**
 * Escape a literal for embedding in a RegExp.
 *
 * Load-bearing: the cron expression `0 16 * * *` is almost entirely regex
 * metacharacters, so matching it unescaped silently never matches and the
 * deploy preflight would refuse every deploy for a reason that was not true.
 *
 * @param {string} literal
 */
function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {string[]} problems @returns {never} */
function fail(problems) {
  console.error("\nbackup-worker — cannot continue:");
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    "\nSee infra/backup/README.md and docs/development/BACKUP_AND_RESTORE.md.",
  );
  process.exit(1);
}

/**
 * Run Wrangler, inheriting stdio so interactive prompts work.
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [options]
 */
function wrangler(args, options = {}) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
  if (result.status !== 0 && options.allowFailure !== true) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

/**
 * Run Wrangler and CAPTURE its output, for the commands whose text we parse.
 * @param {string[]} args
 */
function wranglerCapture(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** The short commit the Worker is built from, for backup object metadata. */
function currentCommit() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (result.status !== 0) return "";
  return (result.stdout ?? "").trim();
}

function readConfigText() {
  if (!existsSync(CONFIG)) {
    fail([`The backup Wrangler config is missing: ${CONFIG}`]);
  }
  return readFileSync(CONFIG, "utf8");
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create the private bucket and apply the retention rules.
 *
 * Idempotent: re-running against an existing bucket reports it and moves on to
 * the lifecycle rules, which R2 treats as upserts by rule id.
 */
function commandProvision() {
  console.log(`Creating the private R2 bucket "${BUCKET_NAME}" if needed…`);
  const created = wranglerCapture(["r2", "bucket", "create", BUCKET_NAME]);
  const alreadyExists = /already exists|10004/i.test(
    created.stdout + created.stderr,
  );
  if (created.status !== 0 && !alreadyExists) {
    process.stderr.write(created.stderr);
    fail([
      `Could not create the bucket. If this says "Please enable R2 through the Cloudflare Dashboard" (code 10042), enable R2 once at https://dash.cloudflare.com → R2 → Enable, then re-run.`,
    ]);
  }
  console.log(alreadyExists ? `Bucket already exists.` : `Bucket created.`);

  for (const rule of LIFECYCLE_RULES) {
    console.log(
      `Applying lifecycle rule "${rule.id}" (${rule.prefix} → expire after ${rule.expireDays} days)…`,
    );
    wrangler([
      "r2",
      "bucket",
      "lifecycle",
      "add",
      BUCKET_NAME,
      rule.id,
      rule.prefix,
      "--expire-days",
      String(rule.expireDays),
      "--force",
    ]);
  }

  // A backup bucket that is publicly readable is the whole disaster in one
  // step, so this is asserted rather than assumed. Buckets are private by
  // default; this catches the case where one was enabled by hand.
  console.log(`\nConfirming the bucket has no public development URL…`);
  const devUrl = wranglerCapture([
    "r2",
    "bucket",
    "dev-url",
    "get",
    BUCKET_NAME,
  ]);
  process.stdout.write(devUrl.stdout);
  if (
    /enabled/i.test(devUrl.stdout) &&
    !/disabled|not enabled/i.test(devUrl.stdout)
  ) {
    fail([
      `The bucket "${BUCKET_NAME}" has a PUBLIC r2.dev URL enabled. Disable it: wrangler r2 bucket dev-url disable ${BUCKET_NAME}`,
    ]);
  }

  console.log(
    `\nProvisioned. Next: pnpm run backup:secret, then pnpm run backup:deploy.`,
  );
}

/**
 * Set the D1 export token as a Worker secret.
 *
 * The value is typed into Wrangler's own prompt — never an argument, never an
 * environment variable interpolated into a command, never echoed by this script.
 */
function commandSecret() {
  console.log(
    [
      `Setting the D1_REST_API_TOKEN secret on ${WORKER_NAME}.`,
      ``,
      `The token needs exactly one permission:`,
      ``,
      `    Account → D1 → Edit`,
      ``,
      `"D1 Edit" is the least privilege that works: the export endpoint is a POST`,
      `that starts a job, so "D1 Read" is not sufficient. Scope the token to this`,
      `account only, and give it no other permission — it must not be a Global API`,
      `Key and must not be an existing broad production token.`,
      ``,
      `Create it at: https://dash.cloudflare.com/profile/api-tokens`,
      ``,
      `Paste the token at the prompt. It is not echoed and never touches the repo.`,
      ``,
    ].join("\n"),
  );
  wrangler(["secret", "put", "D1_REST_API_TOKEN", "--config", CONFIG]);
}

/** Deploy the backup Worker with the real identifiers injected. */
function commandDeploy() {
  const problems = checkCommittedBackupConfig(readConfigText());
  if (problems.length > 0) fail(problems);

  const identifiers = checkProductionIdentifiers();
  if (!identifiers.ok) fail(identifiers.problems);

  const commit = currentCommit();
  console.log(
    `Deploying ${WORKER_NAME} (Workflow ${WORKFLOW_NAME}, schedule "${BACKUP_CRON}" UTC)…`,
  );
  // The identifiers are NOT printed. They are not secrets, but there is no
  // reason for them to sit in a terminal scrollback.
  const args = [
    "deploy",
    "--config",
    CONFIG,
    "--var",
    `CLOUDFLARE_ACCOUNT_ID:${identifiers.accountId}`,
    "--var",
    `D1_DATABASE_ID:${identifiers.databaseId}`,
  ];
  if (commit !== "") args.push("--var", `WORKER_COMMIT:${commit}`);
  wrangler(args);
}

/**
 * Trigger a Workflow instance now.
 *
 * Defaults to the MANUAL tier, which is the honest default for a human-invoked
 * backup: it is not one of the nightly series, and it is kept for a year rather
 * than ninety days precisely because a hand-run backup is usually taken right
 * before something risky.
 *
 * @param {string[]} argv
 */
function commandTrigger(argv) {
  const daily = argv.includes("--daily");
  const trigger = daily ? "daily" : "manual";
  console.log(
    `Triggering ${WORKFLOW_NAME} (trigger: ${trigger}) …\n` +
      `It will be stored under production/${trigger}/.`,
  );
  wrangler([
    "workflows",
    "trigger",
    WORKFLOW_NAME,
    JSON.stringify({ trigger }),
    "--config",
    CONFIG,
  ]);
  console.log(
    `\nFollow it with:\n  pnpm run backup:status\n  pnpm run db:production:backup:list`,
  );
}

/**
 * Describe a Workflow instance. With no id, describes the latest.
 * @param {string[]} argv
 */
function commandStatus(argv) {
  const id = argv.find((token) => !token.startsWith("--")) ?? "latest";
  wrangler([
    "workflows",
    "instances",
    "describe",
    WORKFLOW_NAME,
    id,
    "--config",
    CONFIG,
  ]);
}

/**
 * List stored backups.
 *
 * Wrangler has no `r2 object list`, so this uses the Cloudflare REST API
 * endpoint the dashboard uses. That needs a token rather than the OAuth session,
 * so `CLOUDFLARE_API_TOKEN` must be set with "Workers R2 Storage → Read".
 *
 * @param {string[]} argv
 */
async function commandList(argv) {
  const identifiers = checkProductionIdentifiers();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (accountId === "") {
    fail(identifiers.problems.filter((p) => p.includes("ACCOUNT")));
  }
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (token === "") {
    fail([
      "CLOUDFLARE_API_TOKEN is not set, and Wrangler has no `r2 object list` command.",
      'Set a token with "Workers R2 Storage → Read" to list backups from the CLI,',
      `or browse the bucket in the dashboard: https://dash.cloudflare.com → R2 → ${BUCKET_NAME}`,
    ]);
  }

  const prefixFlag = argv.indexOf("--prefix");
  const prefix =
    prefixFlag >= 0 ? (argv[prefixFlag + 1] ?? "production/") : "production/";

  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET_NAME}/objects`,
  );
  url.searchParams.set("prefix", prefix);
  url.searchParams.set("per_page", "1000");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = /** @type {any} */ (await response.json());
  if (!response.ok || body?.success !== true) {
    fail([
      `The R2 list API returned HTTP ${response.status}.`,
      ...(Array.isArray(body?.errors)
        ? body.errors.map(
            (/** @type {any} */ e) => `${e?.code ?? "?"}: ${e?.message ?? ""}`,
          )
        : []),
    ]);
  }

  const objects = Array.isArray(body.result) ? body.result : [];
  if (objects.length === 0) {
    console.log(`No backups found under "${prefix}" in ${BUCKET_NAME}.`);
    return;
  }

  // Newest last, so the most recent backup is the line nearest the prompt.
  objects.sort((/** @type {any} */ a, /** @type {any} */ b) =>
    String(a.key).localeCompare(String(b.key)),
  );
  console.log(
    `${objects.length} backup(s) under "${prefix}" in ${BUCKET_NAME}:\n`,
  );
  for (const object of objects) {
    const size = Number(object.size ?? 0);
    const kib = (size / 1024).toFixed(1);
    console.log(`  ${object.key}`);
    console.log(
      `      ${size} bytes (${kib} KiB)   uploaded ${object.last_modified ?? "?"}`,
    );
  }
  console.log(
    `\nDownload one with:\n  node scripts/backup-worker.mjs download <key> --output <file>`,
  );
}

/**
 * Download one backup object to a local file.
 * @param {string[]} argv
 */
function commandDownload(argv) {
  const key = argv.find((token) => !token.startsWith("--"));
  const outputFlag = argv.indexOf("--output");
  const output = outputFlag >= 0 ? argv[outputFlag + 1] : undefined;
  if (key === undefined || output === undefined) {
    fail([
      "Usage: node scripts/backup-worker.mjs download <object-key> --output <file>",
    ]);
  }
  console.log(`Downloading ${key} → ${output}`);
  wrangler([
    "r2",
    "object",
    "get",
    `${BUCKET_NAME}/${key}`,
    "--file",
    /** @type {string} */ (output),
    "--remote",
  ]);
  console.log(
    `\nDone. This file is the owner's entire production database in plain SQL.\n` +
      `Keep it somewhere you control and delete it when you are finished.`,
  );
}

/**
 * Assert the LIVE configuration matches what BACKUP-01 requires.
 *
 * Reports rather than changes. It is the answer to "is the nightly backup
 * actually configured the way I think it is?", which is not a question a
 * committed config file can answer.
 */
function commandVerify() {
  const problems = checkCommittedBackupConfig(readConfigText());
  if (problems.length > 0) fail(problems);
  console.log(
    `Committed config OK (no route, no public origin, ${BACKUP_CRON} UTC).\n`,
  );

  console.log(`── Workflow ──────────────────────────────────────────────`);
  wrangler(["workflows", "describe", WORKFLOW_NAME, "--config", CONFIG], {
    allowFailure: true,
  });

  console.log(`\n── Bucket ────────────────────────────────────────────────`);
  wrangler(["r2", "bucket", "info", BUCKET_NAME], { allowFailure: true });

  console.log(`\n── Lifecycle rules ───────────────────────────────────────`);
  wrangler(["r2", "bucket", "lifecycle", "list", BUCKET_NAME], {
    allowFailure: true,
  });

  console.log(`\n── Public access (must be disabled) ──────────────────────`);
  wrangler(["r2", "bucket", "dev-url", "get", BUCKET_NAME], {
    allowFailure: true,
  });

  console.log(`\n── Worker secrets (names only) ───────────────────────────`);
  wrangler(["secret", "list", "--config", CONFIG], { allowFailure: true });
}

/* -------------------------------------------------------------------------- */

const COMMANDS = {
  provision: commandProvision,
  secret: commandSecret,
  deploy: commandDeploy,
  trigger: commandTrigger,
  status: commandStatus,
  list: commandList,
  download: commandDownload,
  verify: commandVerify,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , command, ...rest] = process.argv;
  const run = /** @type {Record<string, (argv: string[]) => unknown>} */ (
    COMMANDS
  )[command ?? ""];
  if (run === undefined) {
    fail([
      `Unknown command "${command ?? ""}". Expected one of: ${Object.keys(COMMANDS).join(", ")}.`,
    ]);
  }
  await run(rest);
}
