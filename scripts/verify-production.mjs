/**
 * Verify — never change — the deployed DalyHub production environment.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Answering "is production what I think it is?" used to mean running four
 * different commands from three different documents and reading each one's
 * output differently: `deploy:production:preflight` for configuration,
 * `db:production:list` for migrations, a hand-typed `wrangler deployments list`
 * for the Worker, and a `curl` whose result nobody could agree how to read.
 * That is a checklist, and a checklist executed by hand is a checklist executed
 * differently every time.
 *
 * ── The one rule ──────────────────────────────────────────────────────────────
 * VERIFICATION AND MUTATION STAY SEPARATE. Nothing here deploys, applies a
 * migration, writes a secret, or sends a request that changes anything. Every
 * Wrangler command it runs is a `list`. If you want to change production, the
 * commands that do that are `pnpm run deploy:production` and
 * `pnpm run db:production:apply`, and they are deliberately not reachable from
 * here.
 *
 * It also never prints a secret VALUE. Secrets are verified by NAME — "is
 * `ACCESS_AUD` set on the Worker?" — which is the only question a verification
 * needs to ask and the only one that is safe to answer in a terminal.
 *
 * And it never bypasses Cloudflare Access. An unauthenticated probe of an
 * Access-protected hostname is answered by Access; that answer is reported as
 * what it is (see `deploy-production.mjs` → `assertProductionHealth`), not
 * worked around.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   pnpm run verify:production
 *
 * Every check degrades honestly: a check that cannot run because a credential
 * or identifier is absent reports **SKIPPED**, never a pass. The exit code is
 * non-zero only when something is definitively WRONG — a missing required
 * secret, a Worker that does not exist, an unhealthy application. "Could not
 * check" is not "verified", and it is not a failure of production either; the
 * summary says which is which, and the process exits 0 with an explicit
 * NOT-VERIFIED line so an operator reads the state rather than the exit code.
 *
 * Credentials come from the environment exactly as the deploy does:
 * `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, or an interactive
 * `wrangler login`. `CLOUDFLARE_D1_DATABASE_ID` selects the real database.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY_MODULE = join(ROOT, "scripts", "deploy-production.mjs");

/*
 * The temporary-config machinery that points Wrangler at the real D1 database
 * is `production-d1.mjs`'s, and it is reused THROUGH that script rather than
 * reimplemented here: `checkPendingProductionMigrations` shells out to it. One
 * place knows how to reach the production database, and one place has to be
 * fixed when that changes.
 */

/** Outcomes, in the order of how bad they are. */
export const PASS = "PASS";
export const SKIPPED = "SKIPPED";
export const FAIL = "FAIL";

/**
 * One check's result. `detail` is a single human sentence — the thing an
 * operator reads. `notes` carries the supporting lines.
 */
function result(name, status, detail, notes = []) {
  return { name, status, detail, notes };
}

/* -------------------------------------------------------------------------- */
/* 1. Configuration presence — no values, ever.                               */
/* -------------------------------------------------------------------------- */

/**
 * The environment values a production operation needs. Reported as
 * present/absent by NAME. `CLOUDFLARE_D1_DATABASE_ID` is additionally shape-
 * checked, because "set to the committed placeholder" is a distinct and much
 * worse state than "not set".
 */
export const REQUIRED_ENVIRONMENT = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_D1_DATABASE_ID",
  "PRODUCTION_DEFAULT_WORKSPACE_ID",
  "PRODUCTION_ACCESS_TEAM_DOMAIN",
  "PRODUCTION_ACCESS_AUD",
  "PRODUCTION_OWNER_EMAIL",
];

/** PURE. Which of the required names are supplied, and which are not. */
export function checkEnvironmentPresence(env = process.env) {
  const missing = REQUIRED_ENVIRONMENT.filter(
    (key) => (env[key] ?? "").trim() === "",
  );
  const present = REQUIRED_ENVIRONMENT.filter(
    (key) => (env[key] ?? "").trim() !== "",
  );
  if (missing.length === REQUIRED_ENVIRONMENT.length) {
    return result(
      "Configuration",
      SKIPPED,
      "none of the production configuration is supplied in this environment, so nothing below that needs it can run.",
      [`not supplied: ${missing.join(", ")}`],
    );
  }
  if (missing.length > 0) {
    return result(
      "Configuration",
      SKIPPED,
      "the production configuration is only partly supplied.",
      [
        `supplied: ${present.join(", ")}`,
        `not supplied: ${missing.join(", ")}`,
        "Values are never printed — only whether each name is set.",
      ],
    );
  }
  return result(
    "Configuration",
    PASS,
    "every required production identifier is supplied in this environment.",
    ["Values are never printed — only whether each name is set."],
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Worker deployment identity.                                             */
/* -------------------------------------------------------------------------- */

/**
 * PURE. Read `wrangler deployments list --json` output into the newest
 * deployment's identity. Wrangler's JSON is an array, newest last on some
 * versions and first on others, so this sorts by the timestamp it prints rather
 * than trusting the order — an ordering assumption is exactly the kind of thing
 * that quietly reports the wrong revision after a Wrangler upgrade.
 */
export function newestDeployment(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : (parsed?.deployments ?? []);
  if (!Array.isArray(list) || list.length === 0) return null;
  const stamped = list
    .map((entry) => ({
      id: entry?.id ?? entry?.deployment_id ?? null,
      created: entry?.created_on ?? entry?.createdOn ?? entry?.date ?? null,
      author: entry?.author_email ?? entry?.author ?? null,
      versions: entry?.versions ?? null,
    }))
    .sort((a, b) =>
      String(a.created ?? "").localeCompare(String(b.created ?? "")),
    );
  return stamped[stamped.length - 1] ?? null;
}

/**
 * PURE. Does this Wrangler error say the Worker does not exist, as opposed to
 * "I could not ask"?
 *
 * The distinction is the whole contract of this script. Wrangler reports both a
 * missing Worker and a missing credential as a non-zero exit, and collapsing
 * them means a DELETED production Worker — which this script's own rules call a
 * definitive failure — reports SKIPPED and exits 0. Matched on the message
 * rather than on an exit code because Wrangler does not distinguish them by
 * code; deliberately narrow, so an unrecognised error still degrades to
 * SKIPPED rather than inventing a failure.
 */
export function isWorkerNotFound(stderr) {
  return /not\s*found|could\s+not\s+find|does\s+not\s+exist|\[code:\s*10007\]/i.test(
    String(stderr ?? ""),
  );
}

function checkWorkerDeployment({ runner = spawnSync, workerName } = {}) {
  const run = runner(
    "wrangler",
    ["deployments", "list", "--name", workerName, "--json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (run.status !== 0) {
    const detail = String(run.stderr ?? "")
      .trim()
      .split("\n")
      .slice(-3)
      .join(" ");
    if (isWorkerNotFound(run.stderr)) {
      return result(
        "Worker deployment",
        FAIL,
        `Wrangler reports no Worker named ${workerName}. Either nothing is deployed under that name or the name is wrong — both are failures, not "could not check".`,
        [detail].filter(Boolean),
      );
    }
    return result(
      "Worker deployment",
      SKIPPED,
      `could not list deployments for ${workerName} — Wrangler is not authenticated, or the account cannot reach it.`,
      [detail].filter(Boolean),
    );
  }
  const newest = newestDeployment(run.stdout ?? "");
  if (newest === null) {
    return result(
      "Worker deployment",
      FAIL,
      `${workerName} exists to Wrangler but reports no deployments — nothing is live under that name.`,
    );
  }
  return result(
    "Worker deployment",
    PASS,
    `${workerName} last deployed ${newest.created ?? "at an unreported time"}.`,
    [newest.id ? `deployment: ${newest.id}` : null].filter(Boolean),
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Worker secrets — by NAME.                                               */
/* -------------------------------------------------------------------------- */

/** PURE. The secret NAMES `wrangler secret list --format json` reports. */
export function secretNames(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? entry : entry?.name))
      .filter((name) => typeof name === "string" && name !== "");
  } catch {
    return [];
  }
}

function checkWorkerSecrets({ runner = spawnSync, workerName, required } = {}) {
  const run = runner(
    "wrangler",
    ["secret", "list", "--name", workerName, "--format", "json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (run.status !== 0) {
    return result(
      "Worker secrets",
      SKIPPED,
      `could not list the secrets set on ${workerName} — Wrangler is not authenticated for this account.`,
    );
  }
  const names = secretNames(run.stdout ?? "");
  const missing = required.filter((key) => !names.includes(key));
  if (missing.length > 0) {
    return result(
      "Worker secrets",
      FAIL,
      `${workerName} is missing required Access secrets: ${missing.join(", ")}. The Worker fails closed without them, so protected routes are rejected.`,
      [`set on the Worker: ${names.join(", ") || "none"}`],
    );
  }
  return result(
    "Worker secrets",
    PASS,
    `every required Access secret is set on ${workerName}.`,
    [`set on the Worker (NAMES only, never values): ${names.join(", ")}`],
  );
}

/* -------------------------------------------------------------------------- */
/* 4. D1 migrations.                                                          */
/* -------------------------------------------------------------------------- */

function checkMigrations({ runner = spawnSync, pendingCheck } = {}) {
  const outcome = pendingCheck({ runner });
  if (!outcome.ok) {
    return result(
      "D1 migrations",
      SKIPPED,
      "could not read the production migration state.",
      outcome.problems,
    );
  }
  if (outcome.pending.length > 0) {
    return result(
      "D1 migrations",
      FAIL,
      `production has ${outcome.pending.length} unapplied migration(s), so the deployed application may be querying tables the database does not have.`,
      [
        `pending: ${outcome.pending.join(", ")}`,
        "Apply them DELIBERATELY with `pnpm run db:production:apply` — this command never will.",
      ],
    );
  }
  return result(
    "D1 migrations",
    PASS,
    "production has no unapplied migrations.",
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Health / Access response class.                                         */
/* -------------------------------------------------------------------------- */

async function checkHealth({ assertHealth, url }) {
  const health = await assertHealth({ log: () => undefined });
  if (!health.ok) {
    return result(
      "Application health",
      FAIL,
      `${url} did not answer as a healthy production DalyHub.`,
      health.problems,
    );
  }
  if (health.verified) {
    return result(
      "Application health",
      PASS,
      `${url} answered directly and reports this release in production.`,
    );
  }
  return result(
    "Application health",
    SKIPPED,
    `${url} answered ${health.status} — Cloudflare Access protecting the hostname, which is the intended configuration. The RUNNING release is therefore NOT confirmed from here.`,
    [
      "Confirm it as the owner: sign in and read /about, which shows the version and the deployed commit.",
      "Or supply PRODUCTION_ACCESS_SERVICE_TOKEN_ID / _SECRET so this check can pass through Access as a machine identity.",
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* Orchestration.                                                             */
/* -------------------------------------------------------------------------- */

/** PURE. The single sentence that goes at the bottom, and the exit code. */
export function summarise(checks) {
  const failed = checks.filter((check) => check.status === FAIL);
  const skipped = checks.filter((check) => check.status === SKIPPED);
  if (failed.length > 0) {
    return {
      exitCode: 1,
      verdict: `NOT VERIFIED — ${failed.length} check(s) FAILED: ${failed.map((c) => c.name).join(", ")}.`,
    };
  }
  if (skipped.length > 0) {
    return {
      exitCode: 0,
      verdict: `PARTIALLY VERIFIED — ${skipped.length} check(s) could not run here: ${skipped.map((c) => c.name).join(", ")}. Those remain owner/environment action; nothing below them is a pass.`,
    };
  }
  return { exitCode: 0, verdict: "VERIFIED — every check passed." };
}

export async function verifyProduction({
  runner = spawnSync,
  env = process.env,
  log = console.log,
  deployModule,
} = {}) {
  const deploy =
    deployModule ?? (await import(pathToFileURL(DEPLOY_MODULE).href));
  const checks = [];

  log(
    "verify:production — read-only. Nothing here deploys, migrates or writes.\n",
  );

  checks.push(checkEnvironmentPresence(env));
  checks.push(
    checkWorkerDeployment({
      runner,
      workerName: deploy.EXPECTED_PRODUCTION_WORKER_NAME,
    }),
  );
  checks.push(
    checkWorkerSecrets({
      runner,
      workerName: deploy.EXPECTED_PRODUCTION_WORKER_NAME,
      required: deploy.PRODUCTION_SECRET_KEYS,
    }),
  );
  checks.push(
    checkMigrations({
      runner,
      pendingCheck: deploy.checkPendingProductionMigrations,
    }),
  );
  const healthUrl =
    env.PRODUCTION_HEALTH_URL ?? deploy.DEFAULT_PRODUCTION_HEALTH_URL;
  checks.push(
    await checkHealth({
      url: healthUrl,
      assertHealth: (options) =>
        deploy.assertProductionHealth({
          url: healthUrl,
          attempts: 1,
          ...options,
        }),
    }),
  );

  for (const check of checks) {
    log(`  [${check.status.padEnd(7)}] ${check.name} — ${check.detail}`);
    for (const note of check.notes) log(`             ${note}`);
  }

  const summary = summarise(checks);
  log(`\nverify:production — ${summary.verdict}`);
  return { checks, ...summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verifyProduction()
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((error) => {
      console.error(`verify:production — unexpected failure: ${error}`);
      process.exit(1);
    });
}
