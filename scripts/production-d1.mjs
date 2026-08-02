/**
 * Run a Wrangler D1 command against the REAL production database.
 *
 * ── The problem this exists to remove ─────────────────────────────────────────
 * The committed `wrangler.jsonc` holds a PLACEHOLDER production `database_id`
 * ("PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID"), deliberately, so no real
 * identifier is ever committed. `wrangler d1 <cmd> dalyhub-v2 --env production
 * --remote` resolves that name through the config and therefore targets the
 * placeholder — `--env` selects the environment, it does not supply an id, and
 * exporting `CLOUDFLARE_D1_DATABASE_ID` does not change what Wrangler reads.
 *
 * So the documented migration and backup commands could not work as written. The
 * old guidance ("set the real database_id in env.production locally") asked the
 * owner to hand-edit a committed file immediately before a production operation,
 * which is exactly how a real identifier gets committed by accident.
 *
 * ── What this does instead ────────────────────────────────────────────────────
 * The same thing `deploy-production.mjs` already does for the deploy: build a
 * temporary config carrying the real id, use it, and delete it. The config is
 * written OUTSIDE the repository with owner-only permissions and removed in a
 * `finally`, so it cannot be committed and does not survive the command.
 *
 * The generated config is a plain TOP-LEVEL config (no `env`), so the command
 * needs no `--env` and there is no environment to apply twice — the same reason
 * the deploy targets its flattened config with `--env=""`.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   pnpm run db:production:list      migrations list
 *   pnpm run db:production:apply     migrations apply   (mutates production)
 *   pnpm run db:production:export -- --output <file>     full SQL backup
 *
 * or directly, for anything else:
 *   node scripts/production-d1.mjs d1 info dalyhub-v2
 *
 * `CLOUDFLARE_D1_DATABASE_ID` must be the real provisioned UUID. Nothing else is
 * read, and no secret is passed: authenticate Wrangler with `wrangler login`
 * (OS keychain) or `CLOUDFLARE_API_TOKEN`.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Committed placeholders that must never reach a real production command. */
const PLACEHOLDERS = [
  "local-development-placeholder-not-provisioned",
  "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRODUCTION_DATABASE_NAME = "dalyhub-v2";

/**
 * Validate the supplied production database id. PURE. Returns the trimmed id, or
 * an array of human-readable problems — the same fail-before-you-touch-anything
 * shape the deploy preflight uses.
 */
export function checkProductionDatabaseId(env = process.env) {
  const id = (env.CLOUDFLARE_D1_DATABASE_ID ?? "").trim();
  if (id === "") {
    return {
      ok: false,
      problems: [
        "CLOUDFLARE_D1_DATABASE_ID is not set. Supply the real provisioned remote D1 database id (a UUID).",
      ],
    };
  }
  if (PLACEHOLDERS.includes(id)) {
    return {
      ok: false,
      problems: [
        `CLOUDFLARE_D1_DATABASE_ID is the committed placeholder "${id}" — refusing to run against it.`,
      ],
    };
  }
  if (!UUID_PATTERN.test(id)) {
    return {
      ok: false,
      problems: [
        "CLOUDFLARE_D1_DATABASE_ID must be a UUID (the provisioned remote D1 database id).",
      ],
    };
  }
  return { ok: true, problems: [], id };
}

/** The committed migrations directory, as an ABSOLUTE path. See below. */
export const MIGRATIONS_DIR = join(ROOT, "migrations");

/**
 * The temporary top-level config Wrangler will read. Deliberately minimal: a name,
 * a compatibility date, and the ONE D1 binding with the real id and the committed
 * migrations directory. No `env`, no vars, no secrets — a D1 command needs none of
 * them, and anything extra would be another thing that could drift. PURE.
 *
 * **`migrations_dir` must be ABSOLUTE, and that is load-bearing.** Wrangler
 * resolves a relative `migrations_dir` against the directory holding the CONFIG
 * FILE, not the working directory — and this config is deliberately written
 * outside the repository (see the header). A relative `"migrations"` therefore
 * pointed at `/tmp/dalyhub-d1-XXXX/migrations`, which never exists, so Wrangler
 * exited 1 with `No migrations present at /tmp/…/migrations` and **every**
 * migrations command failed:
 *
 *   - `pnpm run db:production:list` and `db:production:apply` — the documented
 *     production migration path — could not work;
 *   - and once the V2.0.1 deploy preflight began consulting this wrapper to
 *     CHECK for pending migrations, a fail-closed check would have refused every
 *     production deploy, with no override covering it.
 *
 * Verified empirically against the pinned Wrangler (4.112.0), not inferred: with
 * a relative path the CLI reports the `/tmp` path and exits 1; with the absolute
 * path it lists the real migrations and exits 0. `test/unit/deploy/production-d1.test.ts`
 * holds the rule by resolving the emitted value the way Wrangler does.
 */
export function productionD1Config(databaseId) {
  return {
    name: "dalyhub-v2-production",
    compatibility_date: "2026-07-17",
    d1_databases: [
      {
        binding: "DB",
        database_name: PRODUCTION_DATABASE_NAME,
        database_id: databaseId,
        migrations_dir: MIGRATIONS_DIR,
      },
    ],
  };
}

function fail(problems) {
  console.error("\ndb:production — cannot run against production:");
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    "\nSee docs/development/DEPLOYMENT.md for how to supply the real values.",
  );
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail(["no Wrangler command given (e.g. `d1 migrations list`)."]);
  }

  const readiness = checkProductionDatabaseId();
  if (!readiness.ok) fail(readiness.problems);

  // Written outside the repository so it can never be committed, owner-only where
  // the platform supports it, and removed on success OR failure.
  const dir = mkdtempSync(join(tmpdir(), "dalyhub-d1-"));
  const configPath = join(dir, "wrangler.json");
  try {
    writeFileSync(
      configPath,
      JSON.stringify(productionD1Config(readiness.id)),
      { mode: 0o600 },
    );
    try {
      chmodSync(configPath, 0o600);
    } catch {
      // Best effort: some filesystems do not support it. The directory is already
      // process-private, and the file holds an identifier, never a secret.
    }

    // The id is NOT printed: it is not a secret, but there is no reason for it to
    // land in a terminal scrollback or a CI log.
    console.log(
      `db:production — running: wrangler ${args.join(" ")} (against the provisioned remote database)`,
    );

    const result = spawnSync(
      "wrangler",
      [...args, "--config", configPath, "--remote"],
      { stdio: "inherit", cwd: ROOT, env: process.env },
    );
    process.exit(result.status ?? 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
