#!/usr/bin/env node
/**
 * DalyHub V2 — production deploy orchestrator (FND-01 / FND-09).
 *
 * `pnpm run deploy:production` runs this. It exists to make a real production
 * deployment SAFE by construction: the committed `wrangler.jsonc` carries no real
 * private values, only placeholders, and this script FAILS BEFORE ANY UPLOAD if
 * the real production configuration has not been supplied at deploy time. So a
 * production deploy can never silently ship a local placeholder, and no personal
 * or provisioned identifier is ever committed to the repository.
 *
 * Flow:
 *   1. Preflight (no side effects, no upload): validate the committed
 *      `env.production` switches and that every real production value is supplied
 *      via the environment. Any failure exits non-zero here, before the build.
 *   2. Build the Worker for the production environment (`CLOUDFLARE_ENV=production
 *      pnpm run build`), producing the FLATTENED deploy config
 *      (`build/server/wrangler.json`). The Cloudflare Vite plugin has already
 *      resolved the named production environment into a top-level config whose
 *      final Worker name is `dalyhub-v2-production` — the environment is applied
 *      exactly once, at build time.
 *   3. Inject the real provisioned D1 id and workspace id into that generated
 *      config, validate the final Worker name and origin hardening, and assert no
 *      placeholder survives.
 *   4. Deploy the flattened config ONCE, explicitly targeting the flattened
 *      top-level config with `--env=""` (never `--env production`, and with
 *      `CLOUDFLARE_ENV` cleared) so the environment is NOT applied a second time.
 *      The Access secrets are uploaded atomically with the Worker code via a
 *      single securely-created temporary `--secrets-file`; no standalone
 *      `wrangler secret put` runs, so no secrets-only Worker is ever created
 *      before the real code.
 *
 * ── Why `--env=""` (the original double-`-production` failure) ──────────────────
 * The FIRST production deploy created a Worker named
 * `dalyhub-v2-production-production`. Cause: the generated flattened config
 * already carries the final name `dalyhub-v2-production`, but the deploy was still
 * invoked with `CLOUDFLARE_ENV=production`, so Wrangler applied the `production`
 * environment a SECOND time and appended `-production` again. The flattened config
 * is a plain top-level config — applying any named environment to it is wrong.
 * This script therefore reads and validates the final name from the generated
 * config, deploys with `--env=""` (empty = the top-level config, no suffixing) and
 * never leaves `CLOUDFLARE_ENV=production` set for the deploy, so the name can only
 * ever be `dalyhub-v2-production`.
 *
 * Steps 2–4 need Cloudflare credentials and are never run by CI. The credential-
 * free validation used by CI is `pnpm run deploy:dry-run`. This module's
 * preflight can be run in isolation (no credentials, no upload) with
 * `--preflight-only` (or `DEPLOY_PRODUCTION_PREFLIGHT_ONLY=1`), which the unit
 * tests use.
 *
 * The real values are supplied through these environment variables (never
 * committed): `CLOUDFLARE_D1_DATABASE_ID`, `PRODUCTION_DEFAULT_WORKSPACE_ID`,
 * `PRODUCTION_ACCESS_TEAM_DOMAIN`, `PRODUCTION_ACCESS_AUD`,
 * `PRODUCTION_OWNER_EMAIL` (plus `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
 * for the upload itself). See docs/development/DEPLOYMENT.md.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_CONFIG =
  process.env.DEPLOY_WRANGLER_CONFIG ?? join(ROOT, "wrangler.jsonc");
const REDIRECTED_CONFIG = join(ROOT, "build", "server", "wrangler.json");

/** Committed placeholders that must NEVER reach a real deployment. */
const LOCAL_D1_PLACEHOLDER = "local-development-placeholder-not-provisioned";
const PROD_D1_PLACEHOLDER = "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID";
const LOCAL_WORKSPACE_PLACEHOLDER = "local-dev-workspace";

/**
 * The one correct final Worker name. The Cloudflare Vite build flattens the named
 * `env.production` into a top-level config carrying exactly this name; the deploy
 * must target it once. `DOUBLE_PRODUCTION_WORKER_NAME` is the exact name the
 * original bug created (the `production` environment applied twice) and must never
 * be produced again.
 */
export const EXPECTED_PRODUCTION_WORKER_NAME = "dalyhub-v2-production";
export const DOUBLE_PRODUCTION_WORKER_NAME = "dalyhub-v2-production-production";

/**
 * The Access secrets uploaded atomically with the Worker code. These are private
 * operational config — supplied only at deploy time, never committed, never
 * printed.
 */
export const PRODUCTION_SECRET_KEYS = [
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "OWNER_EMAIL",
];

/** Auth values that are private operational config and must NOT be committed. */
const UNCOMMITTED_VAR_KEYS = [
  "DEFAULT_WORKSPACE_ID",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "OWNER_EMAIL",
  // AI-01: provider credentials and Gateway identifiers are supplied at deploy
  // time as secrets. A committed `var` of the same name -- even an empty one --
  // would OVERRIDE the deploy-time secret and clobber it.
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AI_GATEWAY_ACCOUNT_ID",
  "AI_GATEWAY_ID",
  "AI_GATEWAY_TOKEN",
];

/**
 * AI-01: the OPTIONAL AI secrets. An ordinary DalyHub deployment needs none of
 * them -- AI disabled or unconfigured is a fully supported production state, so
 * their absence is never a problem. What IS a problem is an INCONSISTENT set,
 * which would send requests somewhere the owner did not intend.
 */
export const AI_SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AI_GATEWAY_ACCOUNT_ID",
  "AI_GATEWAY_ID",
  "AI_GATEWAY_TOKEN",
];

/**
 * Check the AI configuration supplied at deploy time. PURE, and it never reads,
 * prints, echoes or returns a secret VALUE -- only whether each one is present.
 *
 * The rules, and the reason for each:
 *   - nothing set: fine. AI is off; DalyHub deploys and runs normally.
 *   - a Gateway account id without a gateway id (or the reverse): REFUSED. A
 *     half-configured Gateway silently degrades to direct provider calls, which
 *     is a different data path than the owner asked for.
 *   - a Gateway token with no gateway: REFUSED, same reasoning.
 *   - a Gateway configured with NO provider key: REFUSED. Bring-your-own-keys is
 *     the intended mode, so a gateway with nothing to authenticate through it is
 *     a configuration the owner did not mean to make.
 */
export function checkAiConfiguration(env = process.env) {
  const present = (key) => isNonEmptyString((env[key] ?? "").trim());
  const problems = [];

  const anyProvider = present("ANTHROPIC_API_KEY") || present("OPENAI_API_KEY");
  const account = present("AI_GATEWAY_ACCOUNT_ID");
  const gateway = present("AI_GATEWAY_ID");
  const token = present("AI_GATEWAY_TOKEN");

  if (account !== gateway) {
    problems.push(
      "AI Gateway is half-configured: set BOTH AI_GATEWAY_ACCOUNT_ID and AI_GATEWAY_ID, or neither.",
    );
  }
  if (token && !(account && gateway)) {
    problems.push(
      "AI_GATEWAY_TOKEN is set without AI_GATEWAY_ACCOUNT_ID and AI_GATEWAY_ID.",
    );
  }
  if (account && gateway && !anyProvider) {
    problems.push(
      "AI Gateway is configured but no provider key is supplied; DalyHub uses bring-your-own-keys.",
    );
  }
  return { ok: problems.length === 0, problems };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalise a build identifier to the SAME rule `app/lib/version.ts` applies when
 * it renders one: hex only, 7-40 characters, truncated to a short hash. Keeping
 * the rule identical means a value that passes here is a value About will show —
 * a deploy cannot succeed while silently supplying something the page then drops.
 * Returns `null` for absent or malformed input. PURE.
 */
export function normaliseBuildCommit(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-fA-F]{7,40}$/.test(trimmed)) return null;
  return trimmed.slice(0, 7).toLowerCase();
}

/**
 * The commit this deploy is shipping, defaulted from the checkout when the
 * environment did not supply one. Impure by design (it shells out to git), so it
 * is kept OUT of `checkProductionDeployReadiness`, which stays pure apart from
 * reading the config file. A non-git checkout, or any git failure, yields `null`
 * and the deploy proceeds with no build identifier — recording one is a
 * convenience, never a gate.
 */
export function resolveBuildCommitFromGit(runner = spawnSync) {
  try {
    const result = runner("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) return null;
    return normaliseBuildCommit(result.stdout ?? "");
  } catch {
    return null;
  }
}

/** Strip line and block comments from JSONC without touching string bodies. */
function stripJsonc(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** Parse a JSONC file (comments + trailing commas tolerated). */
export function readJsonc(path) {
  const raw = readFileSync(path, "utf8");
  const withoutComments = stripJsonc(raw);
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function looksLikeHttpsOrigin(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Validate the committed production config and the deploy-time environment.
 * Returns the resolved real values on success, or an array of human-readable
 * problems. PURE apart from reading the config file — no upload, no build.
 */
export function checkProductionDeployReadiness({
  configPath = WRANGLER_CONFIG,
  env = process.env,
} = {}) {
  const problems = [];

  let config;
  try {
    config = readJsonc(configPath);
  } catch (error) {
    return { ok: false, problems: [`could not read ${configPath}: ${error}`] };
  }

  const prod = config?.env?.production;
  if (prod === undefined || prod === null || typeof prod !== "object") {
    return {
      ok: false,
      problems: ["wrangler.jsonc has no env.production environment."],
    };
  }

  const vars = prod.vars ?? {};

  // Production is always production.
  if (vars.ENVIRONMENT !== "production") {
    problems.push('env.production.vars.ENVIRONMENT must be "production".');
  }
  // Production can never enable development auth.
  if (vars.AUTH_MODE === "development") {
    problems.push(
      "env.production must not enable development auth (AUTH_MODE=development).",
    );
  } else if (vars.AUTH_MODE !== "cloudflare-access") {
    problems.push('env.production.vars.AUTH_MODE must be "cloudflare-access".');
  }
  // Real private values must not be committed as production vars.
  for (const key of UNCOMMITTED_VAR_KEYS) {
    if (key in vars) {
      problems.push(
        `env.production.vars must not commit ${key}; supply it at deploy time.`,
      );
    }
  }

  // Real production values, supplied only via the environment (never committed).
  const d1DatabaseId = (env.CLOUDFLARE_D1_DATABASE_ID ?? "").trim();
  if (
    !isNonEmptyString(d1DatabaseId) ||
    d1DatabaseId === LOCAL_D1_PLACEHOLDER ||
    d1DatabaseId === PROD_D1_PLACEHOLDER ||
    !UUID_PATTERN.test(d1DatabaseId)
  ) {
    problems.push(
      "CLOUDFLARE_D1_DATABASE_ID must be the real provisioned remote D1 database id (a UUID).",
    );
  }

  const workspaceId = (env.PRODUCTION_DEFAULT_WORKSPACE_ID ?? "").trim();
  if (
    !isNonEmptyString(workspaceId) ||
    workspaceId === LOCAL_WORKSPACE_PLACEHOLDER ||
    !UUID_PATTERN.test(workspaceId)
  ) {
    problems.push(
      "PRODUCTION_DEFAULT_WORKSPACE_ID must be the real provisioned workspace id (a UUID, not the local placeholder).",
    );
  }

  const accessTeamDomain = (env.PRODUCTION_ACCESS_TEAM_DOMAIN ?? "").trim();
  if (!looksLikeHttpsOrigin(accessTeamDomain)) {
    problems.push(
      "PRODUCTION_ACCESS_TEAM_DOMAIN must be the Access team domain (an https URL).",
    );
  }

  const accessAud = (env.PRODUCTION_ACCESS_AUD ?? "").trim();
  if (!isNonEmptyString(accessAud)) {
    problems.push(
      "PRODUCTION_ACCESS_AUD must be the Access application Audience (AUD) tag.",
    );
  }

  const ownerEmail = (env.PRODUCTION_OWNER_EMAIL ?? "").trim();
  if (!isNonEmptyString(ownerEmail) || !looksLikeEmail(ownerEmail)) {
    problems.push("PRODUCTION_OWNER_EMAIL must be the owner's email address.");
  }

  // OPTIONAL, and deliberately so: a deployment that records no build identifier
  // is honest (About says "Not recorded") rather than broken. But if one IS
  // supplied and is malformed, fail here rather than let it be silently dropped
  // at render time — a typo'd commit at deploy time should be loud.
  // AI-01: AI is OPTIONAL, so an absent configuration is never a problem here --
  // only an inconsistent one. No secret value is read or printed.
  problems.push(...checkAiConfiguration(env).problems);

  const suppliedBuildCommit = (env.BUILD_COMMIT ?? "").trim();
  const buildCommit = normaliseBuildCommit(suppliedBuildCommit);
  if (suppliedBuildCommit !== "" && buildCommit === null) {
    problems.push(
      "BUILD_COMMIT must be a git commit hash (7-40 hex characters) when supplied.",
    );
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    problems: [],
    values: {
      d1DatabaseId,
      workspaceId,
      accessTeamDomain,
      accessAud,
      ownerEmail,
      buildCommit,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* V2.0.1 — release preflight: refuse to deploy the wrong repository state.   */
/* -------------------------------------------------------------------------- */

/**
 * The explicit, individually-named override flags a legitimate release workflow
 * may need. Each bypasses EXACTLY ONE refusal, is logged loudly when used, and
 * none is a general `--force`. Production defaults are fail-closed: with no
 * flag, every check must pass.
 */
export const RELEASE_OVERRIDE_FLAGS = Object.freeze({
  /** Bypass the clean-working-tree refusal. */
  allowDirtyTree: "--allow-dirty-tree",
  /**
   * Bypass the current-branch-is-main AND the HEAD-equals-origin/main refusals
   * (deploying from any ref other than pushed `main` is one decision, not two).
   */
  allowNonMain: "--allow-non-main",
  /** Bypass the required CI Gate verification for the release commit. */
  skipCiCheck: "--skip-ci-check",
  /**
   * Acknowledge that the pending production D1 migrations listed by the check
   * have been reviewed and are ready to apply. This flag NEVER applies them —
   * migrating is `pnpm run db:production:apply`, a separate, deliberate step.
   */
  acknowledgePendingMigrations: "--acknowledge-pending-migrations",
});

/** Parse the release-override flags out of an argv array. PURE. */
export function parseReleaseOverrides(argv) {
  return {
    allowDirtyTree: argv.includes(RELEASE_OVERRIDE_FLAGS.allowDirtyTree),
    allowNonMain: argv.includes(RELEASE_OVERRIDE_FLAGS.allowNonMain),
    skipCiCheck: argv.includes(RELEASE_OVERRIDE_FLAGS.skipCiCheck),
    acknowledgePendingMigrations: argv.includes(
      RELEASE_OVERRIDE_FLAGS.acknowledgePendingMigrations,
    ),
  };
}

/** Run one git command, capturing stdout. Returns `null` on any failure. */
function gitOutput(runner, args) {
  try {
    const result = runner("git", args, { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0) return null;
    return (result.stdout ?? "").trim();
  } catch {
    return null;
  }
}

/**
 * Verify the checkout is the state a production release should ship from: a
 * CLEAN working tree, on `main`, with local HEAD exactly `origin/main` (after a
 * real fetch, so the comparison is against the remote as it is now — not a
 * stale local ref). Fail-closed: a git command that cannot run is a refusal,
 * never a pass. `runner` is injectable for tests; nothing here touches the
 * network beyond `git fetch`.
 */
export function checkReleaseGitState({
  runner = spawnSync,
  overrides = {},
  log = console.log,
} = {}) {
  const problems = [];

  const porcelain = gitOutput(runner, ["status", "--porcelain"]);
  if (porcelain === null) {
    problems.push(
      "could not read the git working-tree state (`git status --porcelain` failed).",
    );
  } else if (porcelain !== "") {
    if (overrides.allowDirtyTree) {
      log(
        `deploy:production — OVERRIDE ${RELEASE_OVERRIDE_FLAGS.allowDirtyTree}: the working tree is DIRTY and the clean-tree check is bypassed. The deployed Worker may not match any commit.`,
      );
    } else {
      problems.push(
        `the git working tree is dirty — commit, stash or discard local changes first (override: ${RELEASE_OVERRIDE_FLAGS.allowDirtyTree}).`,
      );
    }
  }

  const branch = gitOutput(runner, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = gitOutput(runner, ["rev-parse", "HEAD"]);
  if (branch === null || head === null) {
    problems.push(
      "could not resolve the current git branch or HEAD commit — refusing to deploy an unknown state.",
    );
    return { ok: problems.length === 0, problems, head: null };
  }

  if (overrides.allowNonMain) {
    log(
      `deploy:production — OVERRIDE ${RELEASE_OVERRIDE_FLAGS.allowNonMain}: deploying from "${branch}" @ ${head.slice(0, 7)} without requiring pushed main.`,
    );
    return { ok: problems.length === 0, problems, head };
  }

  if (branch !== "main") {
    problems.push(
      `the current branch is "${branch}", not "main" — production releases ship from pushed main (override: ${RELEASE_OVERRIDE_FLAGS.allowNonMain}).`,
    );
  }

  // A real fetch, so "matches origin/main" means the remote as it is NOW.
  const fetched = gitOutput(runner, ["fetch", "origin", "main"]);
  const originMain =
    fetched === null ? null : gitOutput(runner, ["rev-parse", "origin/main"]);
  if (originMain === null) {
    problems.push(
      "could not fetch or resolve origin/main — refusing to deploy without confirming the release commit is pushed.",
    );
  } else if (head !== originMain) {
    problems.push(
      `local HEAD (${head.slice(0, 7)}) does not match origin/main (${originMain.slice(0, 7)}) — push or fast-forward first (override: ${RELEASE_OVERRIDE_FLAGS.allowNonMain}).`,
    );
  }

  return { ok: problems.length === 0, problems, head };
}

/** The GitHub repository this checkout deploys, derived from the origin URL. */
export function resolveGitHubRepo({ runner = spawnSync } = {}) {
  const url = gitOutput(runner, ["config", "--get", "remote.origin.url"]);
  if (url === null) return null;
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Verify the release commit has a SUCCESSFUL required `CI Gate` check run on
 * GitHub. Red, cancelled, still-running, queued and missing all refuse — a gate
 * that has not finished is not a green gate. Fail-closed: an unreachable API,
 * a missing token on a private repository, or an unparseable response is a
 * refusal, never a pass. `fetcher` is injectable for tests.
 */
export async function checkReleaseCiGate({
  commit,
  repo,
  env = process.env,
  fetcher = fetch,
  checkName = "CI Gate",
} = {}) {
  const problems = [];
  if (!repo) {
    return {
      ok: false,
      problems: [
        "could not derive the GitHub repository from the git remote — cannot verify the CI Gate.",
      ],
    };
  }
  const token = (env.GITHUB_TOKEN ?? env.GH_TOKEN ?? "").trim();
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${commit}/check-runs?check_name=${encodeURIComponent(checkName)}&per_page=100`;
  let payload;
  try {
    const response = await fetcher(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "dalyhub-deploy-preflight",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        problems: [
          `GitHub returned ${response.status} for the ${checkName} check runs of ${commit.slice(0, 7)} — cannot verify CI. Set GITHUB_TOKEN (a read-only token) or, deliberately, ${RELEASE_OVERRIDE_FLAGS.skipCiCheck}.`,
        ],
      };
    }
    payload = await response.json();
  } catch (error) {
    return {
      ok: false,
      problems: [
        `could not reach the GitHub API to verify the ${checkName} status: ${error instanceof Error ? error.message : error}`,
      ],
    };
  }

  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const gates = runs.filter((run) => run?.name === checkName);
  if (gates.length === 0) {
    problems.push(
      `no "${checkName}" check run exists for ${commit.slice(0, 7)} — CI has not run on the release commit.`,
    );
  } else {
    // The newest run for the commit is the authoritative one.
    const gate = gates[0];
    if (gate.status !== "completed") {
      problems.push(
        `the "${checkName}" check for ${commit.slice(0, 7)} is still ${gate.status} — wait for it to finish.`,
      );
    } else if (gate.conclusion !== "success") {
      problems.push(
        `the "${checkName}" check for ${commit.slice(0, 7)} concluded "${gate.conclusion}", not "success" — do not release over a red gate.`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * CHECK for pending production D1 migrations — this never applies one. Runs the
 * same audited wrapper the manual steps use (`scripts/production-d1.mjs`, which
 * refuses placeholders and never writes a real id into the repository) with
 * `d1 migrations list`, and reports every unapplied migration it names.
 * Fail-closed: a wrapper failure (missing credentials, network) is a refusal,
 * never a pass. `runner` is injectable for tests.
 */
export function checkPendingProductionMigrations({ runner = spawnSync } = {}) {
  let result;
  try {
    result = runner(
      "node",
      [
        join(ROOT, "scripts", "production-d1.mjs"),
        "d1",
        "migrations",
        "list",
        "dalyhub-v2",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (error) {
    return {
      ok: false,
      pending: [],
      problems: [
        `could not run the production migrations check: ${error instanceof Error ? error.message : error}`,
      ],
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      pending: [],
      problems: [
        "the production migrations check failed (`production-d1.mjs d1 migrations list`) — supply CLOUDFLARE_D1_DATABASE_ID and Cloudflare credentials, and retry.",
      ],
    };
  }
  // `wrangler d1 migrations list` names only UNAPPLIED migrations; every
  // migration filename in its output is therefore pending.
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pending = [...new Set(output.match(/\d{4}_[\w-]+\.sql/g) ?? [])];
  return { ok: true, pending, problems: [] };
}

/**
 * The V2.0.1 release preflight: refuse to continue when the repository or
 * production state is not what a release should ship — a dirty tree, a branch
 * other than pushed `main`, a missing/red/pending CI Gate, or unacknowledged
 * pending production migrations. Every dependency (git, the GitHub API, the
 * migrations wrapper) is injectable so tests never touch a real remote,
 * database or Worker. Returns `{ ok, problems }`; logs each check's outcome.
 */
export async function runReleasePreflight({
  argv = process.argv,
  env = process.env,
  runner = spawnSync,
  fetcher = fetch,
  log = console.log,
} = {}) {
  const overrides = parseReleaseOverrides(argv);
  const problems = [];

  const git = checkReleaseGitState({ runner, overrides, log });
  problems.push(...git.problems);
  if (git.ok) {
    log("deploy:production — release check: git state OK.");
  }

  if (overrides.skipCiCheck) {
    log(
      `deploy:production — OVERRIDE ${RELEASE_OVERRIDE_FLAGS.skipCiCheck}: the required CI Gate verification is bypassed. Only do this when CI is verified green by hand.`,
    );
  } else if (git.head === null) {
    problems.push(
      "cannot verify the CI Gate without a resolvable HEAD commit.",
    );
  } else {
    const ci = await checkReleaseCiGate({
      commit: git.head,
      repo: resolveGitHubRepo({ runner }),
      env,
      fetcher,
    });
    problems.push(...ci.problems);
    if (ci.ok) {
      log(
        `deploy:production — release check: CI Gate is green for ${git.head.slice(0, 7)}.`,
      );
    }
  }

  const migrations = checkPendingProductionMigrations({ runner });
  problems.push(...migrations.problems);
  if (migrations.ok && migrations.pending.length === 0) {
    log("deploy:production — release check: no pending production migrations.");
  } else if (migrations.ok && migrations.pending.length > 0) {
    if (overrides.acknowledgePendingMigrations) {
      log(
        `deploy:production — OVERRIDE ${RELEASE_OVERRIDE_FLAGS.acknowledgePendingMigrations}: ${migrations.pending.length} pending migration(s) acknowledged as reviewed (${migrations.pending.join(", ")}). This deploy does NOT apply them — run \`pnpm run db:production:apply\` deliberately.`,
      );
    } else {
      problems.push(
        `production has ${migrations.pending.length} pending D1 migration(s): ${migrations.pending.join(", ")}. Review and apply them first (\`pnpm run db:production:apply\`), or acknowledge deliberately with ${RELEASE_OVERRIDE_FLAGS.acknowledgePendingMigrations}. This deploy never applies migrations itself.`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

/* -------------------------------------------------------------------------- */
/* V2.0.1 — post-deploy health & version assertion.                           */
/* -------------------------------------------------------------------------- */

/** Where the public production health endpoint lives. Overridable for drills. */
export const DEFAULT_PRODUCTION_HEALTH_URL = "https://hub.daly.id.au/health";

/**
 * Assert the deployed production application is the release we just shipped.
 * `/health` is public by design, so a Cloudflare Access redirect (3xx) is NOT a
 * valid health response — it means the endpoint is misconfigured behind Access,
 * and the check refuses rather than following the redirect to a login page that
 * returns 200. The payload must report the application name, the production
 * environment and EXACTLY the version being released (read from the single
 * version authority's mirror in `package.json`). The payload deliberately
 * carries no commit (it is public; the commit is on the authenticated About
 * screen), so build identity is asserted only if a `commit` field is present.
 * Retries briefly to ride out propagation. `fetcher`/`delay` are injectable.
 */
export async function assertProductionHealth({
  url = process.env.PRODUCTION_HEALTH_URL ?? DEFAULT_PRODUCTION_HEALTH_URL,
  expectedVersion,
  expectedCommit = null,
  fetcher = fetch,
  attempts = 5,
  delayMs = 3000,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  const version =
    expectedVersion ??
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

  let lastProblems = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const problems = [];
    try {
      const response = await fetcher(url, { redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        problems.push(
          `${url} answered ${response.status} (a redirect — almost certainly Cloudflare Access). /health must be publicly reachable; an Access login page is not an application health response.`,
        );
      } else if (!response.ok) {
        problems.push(`${url} answered HTTP ${response.status}.`);
      } else {
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          problems.push(`${url} did not return JSON.`);
        }
        if (payload !== null) {
          if (payload.status !== "ok") {
            problems.push(
              `health status is ${JSON.stringify(payload.status)}, not "ok".`,
            );
          }
          if (payload.name !== "DalyHub") {
            problems.push(
              `health name is ${JSON.stringify(payload.name)}, not "DalyHub".`,
            );
          }
          if (payload.environment !== "production") {
            problems.push(
              `health environment is ${JSON.stringify(payload.environment)}, not "production".`,
            );
          }
          if (payload.version !== version) {
            problems.push(
              `health version is ${JSON.stringify(payload.version)} but this release is ${JSON.stringify(version)} — the deployed Worker is not this release.`,
            );
          }
          if (
            expectedCommit &&
            typeof payload.commit === "string" &&
            payload.commit !== expectedCommit
          ) {
            problems.push(
              `health commit is ${JSON.stringify(payload.commit)} but this release commit is ${JSON.stringify(expectedCommit)}.`,
            );
          }
        }
      }
    } catch (error) {
      problems.push(
        `could not reach ${url}: ${error instanceof Error ? error.message : error}`,
      );
    }

    if (problems.length === 0) {
      log(
        `deploy:production — health verified: ${url} reports DalyHub ${version} in production.`,
      );
      return { ok: true, problems: [] };
    }
    lastProblems = problems;
    if (attempt < attempts) {
      log(
        `deploy:production — health check attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms…`,
      );
      await delay(delayMs);
    }
  }
  return { ok: false, problems: lastProblems };
}

function fail(message, problems = []) {
  console.error(`\ndeploy:production — ${message}`);
  for (const problem of problems) {
    console.error(`  • ${problem}`);
  }
  console.error(
    "\nSupply the real production configuration (see docs/development/DEPLOYMENT.md) and retry.",
  );
  process.exit(1);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

/**
 * Validate the FLATTENED generated deploy config (`build/server/wrangler.json`).
 * The Cloudflare Vite build has already applied the named production environment
 * exactly once, so this is a plain top-level config whose Worker name must be the
 * final `dalyhub-v2-production` (never the double-`-production` name the original
 * bug produced), and whose alternate public origins must be permanently disabled.
 * PURE: inspects the object only. Returns the validated final name on success or
 * an array of human-readable problems.
 */
export function checkFlattenedProductionConfig(config) {
  const problems = [];

  if (config === null || typeof config !== "object") {
    return {
      ok: false,
      problems: ["the generated deploy config is not an object."],
    };
  }

  if (config?.vars?.ENVIRONMENT !== "production") {
    problems.push(
      "the generated deploy config is not the production environment — build with CLOUDFLARE_ENV=production.",
    );
  }

  // The flattening must have collapsed the named environment: a residual
  // `env.production` means the environment was NOT applied and a later Wrangler
  // command would apply it (again), reintroducing the double-`-production` bug.
  if (config.env !== undefined) {
    problems.push(
      "the generated deploy config still has a nested `env` — it is not flattened; do not re-apply an environment.",
    );
  }

  const name = config.name;
  if (name === DOUBLE_PRODUCTION_WORKER_NAME) {
    problems.push(
      `the generated Worker name is "${DOUBLE_PRODUCTION_WORKER_NAME}" — the production environment was applied twice. It must be "${EXPECTED_PRODUCTION_WORKER_NAME}".`,
    );
  } else if (name !== EXPECTED_PRODUCTION_WORKER_NAME) {
    problems.push(
      `the generated Worker name must be "${EXPECTED_PRODUCTION_WORKER_NAME}" (got ${JSON.stringify(name)}).`,
    );
  }

  // Origin hardening must survive flattening (FND-01 §3).
  if (config.workers_dev !== false) {
    problems.push(
      'the generated production config must set "workers_dev": false (the *.workers.dev origin is an unauthenticated bypass).',
    );
  }
  if (config.preview_urls !== false) {
    problems.push(
      'the generated production config must set "preview_urls": false (Preview URLs are an unauthenticated bypass).',
    );
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, problems: [], name };
}

/**
 * Inject the real provisioned values into a COPY of the generated deploy config
 * and assert no committed placeholder survives. PURE: does not read or write disk.
 * Returns the finalised config object; throws `Error` with a human-readable
 * message on any problem (missing DB binding, surviving placeholder).
 */
export function finaliseGeneratedConfig(config, values) {
  const finalised = JSON.parse(JSON.stringify(config));

  const databases = Array.isArray(finalised.d1_databases)
    ? finalised.d1_databases
    : [];
  const dbBinding = databases.find((database) => database.binding === "DB");
  if (dbBinding === undefined) {
    throw new Error(
      "the generated deploy config has no D1 `DB` binding to receive the production database id.",
    );
  }
  dbBinding.database_id = values.d1DatabaseId;

  if (finalised.vars === null || typeof finalised.vars !== "object") {
    throw new Error(
      "the generated deploy config has no `vars` to receive the workspace id.",
    );
  }
  finalised.vars.DEFAULT_WORKSPACE_ID = values.workspaceId;

  // The build identifier is OPTIONAL. Set it only when there is one, so an
  // unconfigured deployment has no `BUILD_COMMIT` var at all rather than an empty
  // string that would read as a supplied-but-blank value.
  if (values.buildCommit) {
    finalised.vars.BUILD_COMMIT = values.buildCommit;
  } else {
    delete finalised.vars.BUILD_COMMIT;
  }

  const serialised = JSON.stringify(finalised);
  for (const placeholder of [
    PROD_D1_PLACEHOLDER,
    LOCAL_D1_PLACEHOLDER,
    LOCAL_WORKSPACE_PLACEHOLDER,
  ]) {
    if (serialised.includes(placeholder)) {
      throw new Error(
        `a placeholder ("${placeholder}") is still present in the deploy config — refusing to upload.`,
      );
    }
  }

  return finalised;
}

/**
 * Build the argv for the ONE-AND-ONLY production deploy. It explicitly targets
 * the flattened top-level config with `--env=""` (empty environment) so the
 * already-final Worker name is used verbatim and no environment suffix is applied
 * a second time, and uploads the Access secrets atomically with the code via a
 * single `--secrets-file`. PURE: builds the array only. It never contains
 * `--env production`.
 */
export function buildProductionDeployArgs({ configPath, secretsFilePath }) {
  return [
    "deploy",
    "--config",
    configPath,
    // Empty environment = the flattened top-level config. NOT `--env production`,
    // which would re-suffix the name to `dalyhub-v2-production-production`.
    "--env=",
    "--secrets-file",
    secretsFilePath,
  ];
}

/**
 * The environment for the final deploy: the current process environment with
 * `CLOUDFLARE_ENV` removed, so no named environment can be re-applied at deploy
 * time regardless of how the orchestrator was invoked. PURE.
 */
export function deployEnvWithoutCloudflareEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  delete env.CLOUDFLARE_ENV;
  return env;
}

/**
 * Write the Access secrets to a securely-created temporary file OUTSIDE the
 * repository (OS temp dir), restricted to the owner where the platform supports
 * it. Returns `{ dir, path }`; the caller MUST delete `dir` in a `finally`. Only
 * the three `PRODUCTION_SECRET_KEYS` are included, and no value is ever printed.
 */
export function writeSecretsFile(values, { baseDir = tmpdir() } = {}) {
  const dir = mkdtempSync(join(baseDir, "dalyhub-deploy-secrets-"));
  const path = join(dir, "secrets.json");
  const secrets = {
    ACCESS_TEAM_DOMAIN: values.accessTeamDomain,
    ACCESS_AUD: values.accessAud,
    OWNER_EMAIL: values.ownerEmail,
  };
  // Create with owner-only permissions, then write (mode on writeFileSync is only
  // applied when the file is created, so set it explicitly for existing-fd safety).
  writeFileSync(path, JSON.stringify(secrets), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort: some platforms (e.g. Windows) don't support POSIX modes.
  }
  return { dir, path };
}

/**
 * Deploy the finalised config ONCE with the Access secrets uploaded atomically.
 * Creates a single temporary secrets file, runs the deploy, and ALWAYS deletes the
 * temporary directory in a `finally` (on success or failure). Secret values are
 * never printed. `runDeploy` and `log` are injectable for tests; the defaults run
 * real Wrangler and log to the console. Returns the deploy exit status.
 */
export function deployWithSecrets({
  values,
  configPath = REDIRECTED_CONFIG,
  runDeploy = defaultRunDeploy,
  log = console.log,
}) {
  const { dir, path } = writeSecretsFile(values);
  try {
    log(
      `deploy:production — deploying ${EXPECTED_PRODUCTION_WORKER_NAME} with secrets from a temporary file (values not shown).`,
    );
    const args = buildProductionDeployArgs({
      configPath,
      secretsFilePath: path,
    });
    return runDeploy(args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Default deploy runner: real Wrangler, with CLOUDFLARE_ENV cleared. */
function defaultRunDeploy(args) {
  const result = spawnSync("wrangler", args, {
    stdio: "inherit",
    cwd: ROOT,
    env: deployEnvWithoutCloudflareEnv(),
  });
  return result.status ?? 1;
}

async function main() {
  const preflightOnly =
    process.argv.includes("--preflight-only") ||
    process.env.DEPLOY_PRODUCTION_PREFLIGHT_ONLY === "1";
  const releaseCheckOnly = process.argv.includes("--release-check-only");
  const verifyHealthOnly = process.argv.includes("--verify-health-only");

  // Standalone post-deploy verification (`pnpm run deploy:production:verify`):
  // assert the LIVE production /health reports this release, and nothing else.
  if (verifyHealthOnly) {
    const health = await assertProductionHealth({
      expectedCommit: resolveBuildCommitFromGit(),
    });
    if (!health.ok) {
      fail("the production health assertion failed.", health.problems);
    }
    return;
  }

  // Standalone release-state check (`pnpm run deploy:production:release-check`):
  // git state, CI Gate and pending-migration checks, with no build and no upload.
  if (releaseCheckOnly) {
    const release = await runReleasePreflight();
    if (!release.ok) {
      fail(
        "the release preflight refused — the repository or production state is not releasable.",
        release.problems,
      );
    }
    console.log("deploy:production — release preflight passed.");
    return;
  }

  // 1. Preflight — runs BEFORE any build or upload.
  //
  //    Default the build identifier from the checkout when the caller did not set
  //    one, so a deployment records WHICH COMMIT it shipped without the owner
  //    having to remember an extra export. An explicit BUILD_COMMIT still wins,
  //    and a checkout git cannot read simply yields none.
  if (!isNonEmptyString((process.env.BUILD_COMMIT ?? "").trim())) {
    const fromGit = resolveBuildCommitFromGit();
    if (fromGit !== null) {
      process.env.BUILD_COMMIT = fromGit;
    }
  }
  const readiness = checkProductionDeployReadiness();
  if (!readiness.ok) {
    fail(
      "the required production D1 / workspace / auth configuration has not been supplied.",
      readiness.problems,
    );
  }
  console.log(
    "deploy:production — preflight passed: production configuration supplied.",
  );
  console.log(
    readiness.values.buildCommit
      ? `deploy:production — build identifier: ${readiness.values.buildCommit}`
      : 'deploy:production — build identifier: none (About will read "Not recorded").',
  );

  if (preflightOnly) {
    return;
  }

  // 1.5 Release preflight (V2.0.1) — refuse to ship the wrong repository state:
  //     a dirty tree, a branch other than pushed main, a missing/red/pending CI
  //     Gate, or unacknowledged pending production migrations. Fail-closed, with
  //     explicit, individually-named and loudly-logged override flags only.
  const release = await runReleasePreflight();
  if (!release.ok) {
    fail(
      "the release preflight refused — the repository or production state is not releasable.",
      release.problems,
    );
  }
  console.log("deploy:production — release preflight passed.");

  // 2. Build for the production environment. The Cloudflare Vite plugin applies
  //    the named production environment exactly once here, producing the flattened
  //    top-level config with the final name `dalyhub-v2-production`.
  if (run("pnpm", ["run", "build"], { CLOUDFLARE_ENV: "production" }) !== 0) {
    fail("the production build failed.");
  }

  // 3. Read, validate and finalise the flattened generated config: confirm the
  //    final Worker name is `dalyhub-v2-production` (never double-`-production`)
  //    and the origins are hardened, then inject the real values and assert no
  //    placeholder survives — all before any upload.
  let generated;
  try {
    generated = JSON.parse(readFileSync(REDIRECTED_CONFIG, "utf8"));
  } catch (error) {
    fail(
      `could not read the generated deploy config ${REDIRECTED_CONFIG}: ${error}`,
    );
  }
  const flattened = checkFlattenedProductionConfig(generated);
  if (!flattened.ok) {
    fail(
      "the generated production deploy config is not deployable as-is.",
      flattened.problems,
    );
  }
  console.log(
    `deploy:production — generated Worker name validated: ${flattened.name} (targeted once).`,
  );

  let finalised;
  try {
    finalised = finaliseGeneratedConfig(generated, readiness.values);
  } catch (error) {
    fail(String(error instanceof Error ? error.message : error));
  }
  writeFileSync(REDIRECTED_CONFIG, JSON.stringify(finalised));

  // 4. Deploy ONCE, targeting the flattened top-level config with `--env=""`
  //    (never `--env production`, `CLOUDFLARE_ENV` cleared), uploading the Access
  //    secrets atomically with the code via a single temporary secrets file that
  //    is always deleted afterwards. No secrets-only Worker is ever created first.
  const status = deployWithSecrets({ values: readiness.values });
  if (status !== 0) {
    process.exit(status);
  }

  // 5. Post-deploy assertion (V2.0.1): the public /health must answer directly
  //    (never via a Cloudflare Access redirect) and report this exact release.
  //    A deploy whose health check fails exits non-zero so the failure is never
  //    silent — the Worker is live, but it is not verified.
  const health = await assertProductionHealth({
    expectedCommit: readiness.values.buildCommit,
  });
  if (!health.ok) {
    fail(
      "the Worker was deployed but the production health assertion FAILED — investigate before trusting this release.",
      health.problems,
    );
  }
  process.exit(0);
}

// Only run the orchestration when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`deploy:production — unexpected failure: ${error}`);
    process.exit(1);
  });
}
