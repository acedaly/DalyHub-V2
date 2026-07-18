import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * The production deploy guard (`scripts/deploy-production.mjs`) must FAIL BEFORE
 * ANY UPLOAD when the real production D1 / workspace / auth configuration has not
 * been supplied, and must never let a committed local placeholder ship. These
 * tests drive the real script in its side-effect-free `--preflight-only` mode as
 * a subprocess, exercising the committed `wrangler.jsonc` and controlled
 * environments. No Cloudflare credentials, build or upload occur.
 */

// Vitest runs from the repository root; resolve the script from there so the
// spawned process reads the committed wrangler.jsonc.
const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "deploy-production.mjs");

const VALID_ENV = {
  CLOUDFLARE_D1_DATABASE_ID: "11111111-2222-3333-4444-555555555555",
  PRODUCTION_DEFAULT_WORKSPACE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  PRODUCTION_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  PRODUCTION_ACCESS_AUD: "access-application-aud-tag",
  PRODUCTION_OWNER_EMAIL: "owner@example.com",
};

const tempConfigs: string[] = [];

function tempWranglerConfig(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "dh-deploy-"));
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, JSON.stringify(contents));
  tempConfigs.push(path);
  return path;
}

function runPreflight(env: Record<string, string>): {
  status: number;
  stderr: string;
  stdout: string;
} {
  // Start from the real env (so PATH etc. are present and the type is
  // ProcessEnv) but strip any ambient deploy vars so a host CLOUDFLARE_*/
  // PRODUCTION_* value cannot leak into a case that is meant to be missing.
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(cleanEnv)) {
    if (
      key.startsWith("CLOUDFLARE_") ||
      key.startsWith("PRODUCTION_") ||
      key === "DEPLOY_WRANGLER_CONFIG"
    ) {
      delete cleanEnv[key];
    }
  }
  const result = spawnSync("node", [SCRIPT, "--preflight-only"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...cleanEnv, ...env },
  });
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

afterAll(() => {
  // Best-effort cleanup of temp configs' parent dirs is unnecessary in CI's
  // ephemeral runner; leaving the files is harmless. (No-op kept for clarity.)
  void tempConfigs;
});

describe("production deploy preflight (scripts/deploy-production.mjs)", () => {
  it("passes against the committed wrangler.jsonc when every real value is supplied", () => {
    const result = runPreflight({ ...VALID_ENV });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("preflight passed");
  });

  it("fails before upload when no production configuration is supplied", () => {
    const result = runPreflight({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARE_D1_DATABASE_ID");
    expect(result.stderr).toContain("PRODUCTION_DEFAULT_WORKSPACE_ID");
    expect(result.stderr).toContain("PRODUCTION_ACCESS_TEAM_DOMAIN");
    expect(result.stderr).toContain("PRODUCTION_ACCESS_AUD");
    expect(result.stderr).toContain("PRODUCTION_OWNER_EMAIL");
  });

  it("rejects the committed local D1 placeholder as the production database id", () => {
    const result = runPreflight({
      ...VALID_ENV,
      CLOUDFLARE_D1_DATABASE_ID:
        "local-development-placeholder-not-provisioned",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARE_D1_DATABASE_ID");
  });

  it("rejects the committed production D1 placeholder as the production database id", () => {
    const result = runPreflight({
      ...VALID_ENV,
      CLOUDFLARE_D1_DATABASE_ID:
        "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARE_D1_DATABASE_ID");
  });

  it("rejects the local workspace placeholder as the production workspace id", () => {
    const result = runPreflight({
      ...VALID_ENV,
      PRODUCTION_DEFAULT_WORKSPACE_ID: "local-dev-workspace",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PRODUCTION_DEFAULT_WORKSPACE_ID");
  });

  it("rejects a non-https Access team domain", () => {
    const result = runPreflight({
      ...VALID_ENV,
      PRODUCTION_ACCESS_TEAM_DOMAIN: "http://team.cloudflareaccess.com",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PRODUCTION_ACCESS_TEAM_DOMAIN");
  });

  it("rejects a production config that enables development auth", () => {
    const configPath = tempWranglerConfig({
      name: "dalyhub-v2",
      env: {
        production: {
          vars: { ENVIRONMENT: "production", AUTH_MODE: "development" },
        },
      },
    });
    const result = runPreflight({
      ...VALID_ENV,
      DEPLOY_WRANGLER_CONFIG: configPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("development auth");
  });

  it("rejects a production config whose ENVIRONMENT is not production", () => {
    const configPath = tempWranglerConfig({
      name: "dalyhub-v2",
      env: {
        production: {
          vars: { ENVIRONMENT: "staging", AUTH_MODE: "cloudflare-access" },
        },
      },
    });
    const result = runPreflight({
      ...VALID_ENV,
      DEPLOY_WRANGLER_CONFIG: configPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT");
  });

  it("rejects a production config that commits real private values as vars", () => {
    const configPath = tempWranglerConfig({
      name: "dalyhub-v2",
      env: {
        production: {
          vars: {
            ENVIRONMENT: "production",
            AUTH_MODE: "cloudflare-access",
            OWNER_EMAIL: "owner@committed.example",
            DEFAULT_WORKSPACE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          },
        },
      },
    });
    const result = runPreflight({
      ...VALID_ENV,
      DEPLOY_WRANGLER_CONFIG: configPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not commit");
  });

  it("fails when there is no env.production environment at all", () => {
    const configPath = tempWranglerConfig({ name: "dalyhub-v2" });
    const result = runPreflight({
      ...VALID_ENV,
      DEPLOY_WRANGLER_CONFIG: configPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no env.production");
  });
});
