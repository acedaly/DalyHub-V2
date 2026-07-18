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
 *      pnpm run build`), producing the flattened deploy config.
 *   3. Inject the real provisioned D1 id and workspace id into that generated
 *      config and assert no placeholder survives.
 *   4. Set the Access secrets (`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` / `OWNER_EMAIL`)
 *      on the production Worker.
 *   5. Deploy.
 *
 * Steps 2–5 need Cloudflare credentials and are never run by CI. The credential-
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
import { readFileSync, writeFileSync } from "node:fs";
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

/** Auth values that are private operational config and must NOT be committed. */
const UNCOMMITTED_VAR_KEYS = [
  "DEFAULT_WORKSPACE_ID",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "OWNER_EMAIL",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    },
  };
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

/** Inject the real values into the generated deploy config; assert no placeholder survives. */
function finaliseDeployConfig(values) {
  const redirected = JSON.parse(readFileSync(REDIRECTED_CONFIG, "utf8"));
  if (redirected?.vars?.ENVIRONMENT !== "production") {
    fail(
      "the generated deploy config is not the production environment — build with CLOUDFLARE_ENV=production.",
    );
  }
  for (const database of redirected.d1_databases ?? []) {
    if (database.binding === "DB") {
      database.database_id = values.d1DatabaseId;
    }
  }
  redirected.vars.DEFAULT_WORKSPACE_ID = values.workspaceId;

  const serialised = JSON.stringify(redirected);
  for (const placeholder of [
    PROD_D1_PLACEHOLDER,
    LOCAL_D1_PLACEHOLDER,
    LOCAL_WORKSPACE_PLACEHOLDER,
  ]) {
    if (serialised.includes(placeholder)) {
      fail(
        `a placeholder ("${placeholder}") is still present in the deploy config — refusing to upload.`,
      );
    }
  }
  writeFileSync(REDIRECTED_CONFIG, serialised);
}

function setSecret(name, value) {
  const result = spawnSync(
    "wrangler",
    ["secret", "put", name, "--env", "production"],
    { input: `${value}\n`, stdio: ["pipe", "inherit", "inherit"], cwd: ROOT },
  );
  if ((result.status ?? 1) !== 0) {
    fail(`failed to set the production secret ${name}.`);
  }
}

function main() {
  const preflightOnly =
    process.argv.includes("--preflight-only") ||
    process.env.DEPLOY_PRODUCTION_PREFLIGHT_ONLY === "1";

  // 1. Preflight — runs BEFORE any build or upload.
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

  if (preflightOnly) {
    return;
  }

  // 2. Build for the production environment.
  if (run("pnpm", ["run", "build"], { CLOUDFLARE_ENV: "production" }) !== 0) {
    fail("the production build failed.");
  }

  // 3. Inject real values into the generated deploy config.
  finaliseDeployConfig(readiness.values);

  // 4. Set the Access secrets on the production Worker.
  setSecret("ACCESS_TEAM_DOMAIN", readiness.values.accessTeamDomain);
  setSecret("ACCESS_AUD", readiness.values.accessAud);
  setSecret("OWNER_EMAIL", readiness.values.ownerEmail);

  // 5. Deploy the finalised, production-flattened config.
  const status = run("wrangler", ["deploy", "--config", REDIRECTED_CONFIG], {
    CLOUDFLARE_ENV: "production",
  });
  process.exit(status);
}

// Only run the orchestration when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
