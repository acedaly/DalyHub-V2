/**
 * The production D1 guard (`scripts/production-d1.mjs`).
 *
 * The documented backup and migration commands used to run
 * `wrangler d1 ... dalyhub-v2 --env production --remote`, which resolves the
 * database NAME through the committed config — whose production `database_id` is a
 * placeholder by design. `--env` selects an environment; it does not supply an id,
 * and exporting `CLOUDFLARE_D1_DATABASE_ID` does not change what Wrangler reads.
 * So the mandatory pre-deploy backup targeted a placeholder.
 *
 * The fix generates a temporary config carrying the real id, exactly as the deploy
 * orchestrator does. These tests hold the two properties that matter: it refuses to
 * run without a real id, and the config it generates points at that id and nothing
 * placeholder-shaped.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "production-d1.mjs");
const MODULE_URL = pathToFileURL(SCRIPT).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Node script under test.
type ProductionD1Module = any;
let d1: ProductionD1Module;

beforeAll(async () => {
  d1 = await import(/* @vite-ignore */ MODULE_URL);
});

const REAL_ID = "11111111-2222-3333-4444-555555555555";

function run(env: Record<string, string>): {
  status: number;
  stderr: string;
  stdout: string;
} {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(clean)) {
    if (key.startsWith("CLOUDFLARE_")) delete clean[key];
  }
  const result = spawnSync(
    "node",
    [SCRIPT, "d1", "migrations", "list", "dalyhub-v2"],
    { cwd: ROOT, encoding: "utf8", env: { ...clean, ...env } },
  );
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

describe("production D1 guard — refuses to touch production without a real id", () => {
  it("fails when no database id is supplied", () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARE_D1_DATABASE_ID");
  });

  it("refuses the committed production placeholder", () => {
    const result = run({
      CLOUDFLARE_D1_DATABASE_ID:
        "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("placeholder");
  });

  it("refuses the committed LOCAL placeholder", () => {
    // The local one is the more dangerous mistake: it is what the top-level
    // config carries, so it is what a half-configured shell would inherit.
    const result = run({
      CLOUDFLARE_D1_DATABASE_ID:
        "local-development-placeholder-not-provisioned",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("placeholder");
  });

  it("refuses anything that is not a UUID", () => {
    for (const value of ["nope", "dalyhub-v2", "1234"]) {
      const result = run({ CLOUDFLARE_D1_DATABASE_ID: value });
      expect(result.status, value).toBe(1);
      expect(result.stderr, value).toContain("UUID");
    }
  });

  it("accepts a real UUID", () => {
    expect(
      d1.checkProductionDatabaseId({ CLOUDFLARE_D1_DATABASE_ID: REAL_ID }),
    ).toEqual({ ok: true, problems: [], id: REAL_ID });
  });
});

describe("production D1 guard — the generated config", () => {
  it("binds the REAL id to the production database and the committed migrations", () => {
    const config = d1.productionD1Config(REAL_ID) as {
      name: string;
      env?: unknown;
      d1_databases: {
        binding: string;
        database_name: string;
        database_id: string;
        migrations_dir: string;
      }[];
    };

    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0]).toMatchObject({
      binding: "DB",
      database_name: d1.PRODUCTION_DATABASE_NAME,
      database_id: REAL_ID,
    });
  });

  /**
   * The regression this test exists for, stated plainly: `migrations_dir` was
   * the relative string `"migrations"`, and Wrangler resolves a relative
   * `migrations_dir` against the directory holding the CONFIG FILE — which this
   * script deliberately writes to the OS temp directory, outside the repository.
   * So it pointed at `/tmp/dalyhub-d1-XXXX/migrations`, which never exists:
   * Wrangler exited 1 with `No migrations present at /tmp/…/migrations`, and
   * BOTH documented production migration commands (`db:production:list` and
   * `db:production:apply`) could not work at all.
   *
   * A test using an injected/fake command runner cannot catch this — the bug is
   * in a PATH, not in control flow — so this resolves the emitted value exactly
   * the way Wrangler does and checks the real directory is on the other end.
   */
  it("resolves migrations_dir to the REAL migrations from a config written outside the repository", () => {
    const config = d1.productionD1Config(REAL_ID) as {
      d1_databases: { migrations_dir: string }[];
    };
    const emitted = config.d1_databases[0]!.migrations_dir;

    // Absolute, so where the config file lives cannot change what it means.
    expect(isAbsolute(emitted)).toBe(true);

    // Resolve it the way Wrangler does: against the config file's own directory,
    // in a temp dir exactly like the one `main()` creates.
    const configDir = mkdtempSync(join(tmpdir(), "dalyhub-d1-test-"));
    try {
      const resolved = resolve(configDir, emitted);
      expect(existsSync(resolved)).toBe(true);
      // It is the committed sequence, not merely some directory that exists.
      expect(existsSync(join(resolved, "0001_create_entities.sql"))).toBe(true);
      expect(
        readdirSync(resolved).filter((name) => name.endsWith(".sql")).length,
      ).toBeGreaterThan(20);

      // And the old relative value would NOT have resolved — the failure mode.
      expect(existsSync(resolve(configDir, "migrations"))).toBe(false);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it("is a plain TOP-LEVEL config, so no environment can be applied twice", () => {
    // The same reason the deploy targets its flattened config with `--env=""`.
    const config = d1.productionD1Config(REAL_ID) as { env?: unknown };
    expect(config.env).toBeUndefined();
  });

  it("contains no placeholder and no secret", () => {
    const serialised = JSON.stringify(d1.productionD1Config(REAL_ID));
    for (const placeholder of [
      "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
      "local-development-placeholder-not-provisioned",
      "local-dev-workspace",
    ]) {
      expect(serialised).not.toContain(placeholder);
    }
    // A D1 command needs no auth values; anything extra is another thing that
    // could drift, and a secret in a temp file is a secret on disk.
    for (const secret of [
      "ACCESS_TEAM_DOMAIN",
      "ACCESS_AUD",
      "OWNER_EMAIL",
      "DEFAULT_WORKSPACE_ID",
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });
});
