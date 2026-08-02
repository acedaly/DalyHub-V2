import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * FND-01 production-closeout regression tests for the deploy FLOW (as opposed to
 * the credential-free preflight, covered by `production-preflight.test.ts`).
 *
 * These lock in the fix for the original double-`-production` naming failure and
 * the atomic-secrets deploy, exercising the deploy orchestrator's pure functions
 * and its injectable deploy runner — no Cloudflare credentials, build or upload.
 *
 * `scripts/deploy-production.mjs` is a plain Node ESM script that is deliberately
 * NOT part of the type-checked TypeScript program (the repo type-checks `app/`,
 * `workers/` and `test/`, not `scripts/`). It is loaded here via a runtime-resolved
 * dynamic import so tsc does not pull a JS file into the composite project; types
 * are irrelevant to these behavioural assertions.
 */

const ROOT = process.cwd();

// Resolve the script from the repo root on disk (a real filesystem path) so the
// dynamic import gets a `file:` URL — under Vitest `import.meta.url` can be an
// `http:` dev-server URL, which the ESM loader rejects.
const MODULE_URL = pathToFileURL(
  join(ROOT, "scripts", "deploy-production.mjs"),
).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Node script under test.
type DeployModule = any;
let deploy: DeployModule;

beforeAll(async () => {
  deploy = await import(/* @vite-ignore */ MODULE_URL);
});

const VALUES = {
  d1DatabaseId: "11111111-2222-3333-4444-555555555555",
  workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  accessTeamDomain: "https://team.cloudflareaccess.com",
  accessAud: "access-application-aud-tag-SECRET",
  ownerEmail: "owner-SECRET@example.com",
};

const PROD_D1_PLACEHOLDER = "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID";

/** A representative FLATTENED generated config, as the Cloudflare Vite build emits. */
function flattenedConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: deploy.EXPECTED_PRODUCTION_WORKER_NAME,
    main: "index.js",
    vars: { ENVIRONMENT: "production", AUTH_MODE: "cloudflare-access" },
    workers_dev: false,
    preview_urls: false,
    d1_databases: [
      {
        binding: "DB",
        database_name: "dalyhub-v2",
        database_id: PROD_D1_PLACEHOLDER,
      },
    ],
    ...overrides,
  };
}

describe("generated production Worker name is targeted exactly once", () => {
  it("accepts the flattened config whose final name is dalyhub-v2-production", () => {
    const result = deploy.checkFlattenedProductionConfig(flattenedConfig());
    expect(result.ok).toBe(true);
    expect(result.name).toBe(deploy.EXPECTED_PRODUCTION_WORKER_NAME);
  });

  it("rejects the double-production name (the original failure)", () => {
    const result = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ name: deploy.DOUBLE_PRODUCTION_WORKER_NAME }),
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(
      deploy.DOUBLE_PRODUCTION_WORKER_NAME,
    );
  });

  it("rejects any other Worker name", () => {
    const result = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ name: "dalyhub-v2" }),
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(
      deploy.EXPECTED_PRODUCTION_WORKER_NAME,
    );
  });

  it("rejects a config that still carries a nested env (not flattened → env would be re-applied)", () => {
    const result = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ env: { production: {} } }),
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("not flattened");
  });

  it("rejects a config that is not the production environment", () => {
    const result = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ vars: { ENVIRONMENT: "development" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("CLOUDFLARE_ENV=production");
  });
});

describe("origin hardening survives into the generated production config", () => {
  it("passes only when workers_dev is false", () => {
    expect(deploy.checkFlattenedProductionConfig(flattenedConfig()).ok).toBe(
      true,
    );
    const enabled = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ workers_dev: true }),
    );
    expect(enabled.ok).toBe(false);
    expect(enabled.problems.join("\n")).toContain("workers_dev");
  });

  it("passes only when preview_urls is false", () => {
    const enabled = deploy.checkFlattenedProductionConfig(
      flattenedConfig({ preview_urls: true }),
    );
    expect(enabled.ok).toBe(false);
    expect(enabled.problems.join("\n")).toContain("preview_urls");
  });

  it("rejects a config missing the flags entirely", () => {
    const missing = flattenedConfig();
    delete (missing as Record<string, unknown>).workers_dev;
    delete (missing as Record<string, unknown>).preview_urls;
    const result = deploy.checkFlattenedProductionConfig(missing);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("workers_dev");
    expect(result.problems.join("\n")).toContain("preview_urls");
  });

  it("the committed wrangler.jsonc declares both flags false for env.production", () => {
    const config = deploy.readJsonc(join(ROOT, "wrangler.jsonc")) as {
      env: { production: { workers_dev: unknown; preview_urls: unknown } };
    };
    expect(config.env.production.workers_dev).toBe(false);
    expect(config.env.production.preview_urls).toBe(false);
  });
});

describe("the final deploy command targets the flattened top-level config once", () => {
  it("does not use --env production", () => {
    const args = deploy.buildProductionDeployArgs({
      configPath: "build/server/wrangler.json",
      secretsFilePath: "/tmp/secrets.json",
    });
    expect(args).not.toContain("production");
    // No `--env production` in any adjacent form.
    for (let i = 0; i < args.length - 1; i++) {
      expect(`${args[i]} ${args[i + 1]}`).not.toBe("--env production");
    }
    expect(args.join(" ")).not.toContain("--env production");
  });

  it("explicitly targets the empty (flattened top-level) environment", () => {
    const args = deploy.buildProductionDeployArgs({
      configPath: "build/server/wrangler.json",
      secretsFilePath: "/tmp/secrets.json",
    });
    expect(args).toContain("--env=");
  });

  it("targets the flattened config with exactly one --config", () => {
    const args = deploy.buildProductionDeployArgs({
      configPath: "build/server/wrangler.json",
      secretsFilePath: "/tmp/secrets.json",
    });
    expect(args.filter((a: string) => a === "--config")).toHaveLength(1);
    const configIndex = args.indexOf("--config");
    expect(args[configIndex + 1]).toBe("build/server/wrangler.json");
  });

  it("uploads secrets atomically via a single --secrets-file", () => {
    const args = deploy.buildProductionDeployArgs({
      configPath: "build/server/wrangler.json",
      secretsFilePath: "/tmp/secrets.json",
    });
    expect(args.filter((a: string) => a === "--secrets-file")).toHaveLength(1);
  });

  it("clears CLOUDFLARE_ENV for the deploy so no environment is re-applied", () => {
    const env = deploy.deployEnvWithoutCloudflareEnv({
      CLOUDFLARE_ENV: "production",
      PATH: "/usr/bin",
    });
    expect(env.CLOUDFLARE_ENV).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("secrets are deployed atomically via one temporary file", () => {
  it("uses a single deploy invocation (not three standalone secret puts)", () => {
    const calls: string[][] = [];
    const status = deploy.deployWithSecrets({
      values: VALUES,
      configPath: "cfg.json",
      runDeploy: (a: string[]) => {
        calls.push(a);
        return 0;
      },
      log: () => {},
    });
    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("deploy");
    expect(calls[0]).toContain("--secrets-file");
  });

  it("writes exactly the three Access secret keys, restricted, outside the repo", () => {
    let observedPath = "";
    let observedContents = "";
    let observedMode = "";
    deploy.deployWithSecrets({
      values: VALUES,
      configPath: "cfg.json",
      runDeploy: (a: string[]) => {
        observedPath = a[a.indexOf("--secrets-file") + 1];
        observedContents = readFileSync(observedPath, "utf8");
        observedMode = (statSync(observedPath).mode & 0o777).toString(8);
        return 0;
      },
      log: () => {},
    });
    const parsed = JSON.parse(observedContents) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toEqual(
      [...deploy.PRODUCTION_SECRET_KEYS].sort(),
    );
    expect(parsed.ACCESS_TEAM_DOMAIN).toBe(VALUES.accessTeamDomain);
    expect(parsed.ACCESS_AUD).toBe(VALUES.accessAud);
    expect(parsed.OWNER_EMAIL).toBe(VALUES.ownerEmail);
    // The temp file lives in the OS temp dir, never inside the repository.
    expect(observedPath.startsWith(ROOT)).toBe(false);
    // Owner-only permissions where the platform supports POSIX modes.
    if (process.platform !== "win32") {
      expect(observedMode).toBe("600");
    }
  });

  it("removes the temporary secrets file after a SUCCESSFUL deploy", () => {
    let observedPath = "";
    deploy.deployWithSecrets({
      values: VALUES,
      configPath: "cfg.json",
      runDeploy: (a: string[]) => {
        observedPath = a[a.indexOf("--secrets-file") + 1];
        expect(existsSync(observedPath)).toBe(true);
        return 0;
      },
      log: () => {},
    });
    expect(observedPath).not.toBe("");
    expect(existsSync(observedPath)).toBe(false);
  });

  it("removes the temporary secrets file after a FAILED deploy", () => {
    let observedPath = "";
    expect(() =>
      deploy.deployWithSecrets({
        values: VALUES,
        configPath: "cfg.json",
        runDeploy: (a: string[]) => {
          observedPath = a[a.indexOf("--secrets-file") + 1];
          throw new Error("simulated wrangler failure");
        },
        log: () => {},
      }),
    ).toThrow("simulated wrangler failure");
    expect(observedPath).not.toBe("");
    expect(existsSync(observedPath)).toBe(false);
  });

  it("never prints secret values", () => {
    const logs: string[] = [];
    deploy.deployWithSecrets({
      values: VALUES,
      configPath: "cfg.json",
      runDeploy: () => 0,
      log: (message: string) => logs.push(message),
    });
    const printed = logs.join("\n");
    expect(printed).not.toContain(VALUES.accessAud);
    expect(printed).not.toContain(VALUES.ownerEmail);
    expect(printed).not.toContain(VALUES.accessTeamDomain);
  });
});

describe("finalising the generated config injects real values and refuses placeholders", () => {
  it("injects the real D1 id and workspace id without mutating the source object", () => {
    const source = flattenedConfig();
    const finalised = deploy.finaliseGeneratedConfig(source, VALUES) as {
      d1_databases: { database_id: string }[];
      vars: { DEFAULT_WORKSPACE_ID: string };
    };
    expect(finalised.d1_databases[0].database_id).toBe(VALUES.d1DatabaseId);
    expect(finalised.vars.DEFAULT_WORKSPACE_ID).toBe(VALUES.workspaceId);
    // Source is untouched (pure).
    expect(source.d1_databases[0].database_id).toBe(PROD_D1_PLACEHOLDER);
  });

  it("throws if a committed placeholder would survive into the upload", () => {
    // A workspace value equal to the local placeholder must be caught.
    expect(() =>
      deploy.finaliseGeneratedConfig(flattenedConfig(), {
        ...VALUES,
        workspaceId: "local-dev-workspace",
      }),
    ).toThrow(/placeholder/);
  });

  it("throws if the generated config has no DB binding to receive the id", () => {
    expect(() =>
      deploy.finaliseGeneratedConfig(
        flattenedConfig({ d1_databases: [] }),
        VALUES,
      ),
    ).toThrow(/DB/);
  });
});

describe("the deploy entry points stay credential-free by construction", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  it("deploy:dry-run only builds and dry-runs (never uploads)", () => {
    const script = pkg.scripts["deploy:dry-run"];
    expect(script).toContain("--dry-run");
    expect(script).not.toContain("secret");
    expect(script).not.toContain("--env production");
  });

  it("deploy:production:preflight runs the guard in preflight-only mode", () => {
    expect(pkg.scripts["deploy:production:preflight"]).toContain(
      "--preflight-only",
    );
  });
});

describe("the build identifier is recorded, optional, and never a channel for junk", () => {
  it("normalises a full commit hash to the short form About renders", () => {
    expect(
      deploy.normaliseBuildCommit("9F2C1B7A4E5D6C8B0A1F2E3D4C5B6A7980ABCDEF"),
    ).toBe("9f2c1b7");
  });

  it("treats an absent or malformed identifier as none, exactly as the renderer does", () => {
    // The SAME rule `app/lib/version.ts` applies. Keeping them identical is the
    // point: a value that passes the deploy guard is a value About will show, so
    // a deploy can never succeed while silently shipping something the page drops.
    for (const value of [
      "",
      "   ",
      "not-a-hash",
      "9f2c1b",
      "zzzzzzz",
      "9f2c1b7 extra",
      "<script>alert(1)</script>",
      undefined,
      null,
      42,
    ]) {
      expect(deploy.normaliseBuildCommit(value), String(value)).toBeNull();
    }
  });

  it("writes BUILD_COMMIT into the generated config when there is one", () => {
    const finalised = deploy.finaliseGeneratedConfig(flattenedConfig(), {
      ...VALUES,
      buildCommit: "9f2c1b7",
    }) as { vars: Record<string, string> };
    expect(finalised.vars.BUILD_COMMIT).toBe("9f2c1b7");
  });

  it("writes NO BUILD_COMMIT var at all when there is none", () => {
    // Not an empty string: an empty var would read as "supplied but blank", and
    // About would have to guess. Absent means absent, and About says so.
    const finalised = deploy.finaliseGeneratedConfig(flattenedConfig(), {
      ...VALUES,
      buildCommit: null,
    }) as { vars: Record<string, string> };
    expect("BUILD_COMMIT" in finalised.vars).toBe(false);
  });

  it("defaults the identifier from the checkout, and survives a git failure", () => {
    const fromGit = deploy.resolveBuildCommitFromGit(() => ({
      status: 0,
      stdout: "9f2c1b7a4e5d6c8b0a1f2e3d4c5b6a7980abcdef\n",
    }));
    expect(fromGit).toBe("9f2c1b7");

    // Recording a commit is a convenience, never a gate: a non-git checkout or a
    // failing git must not stop a deployment.
    expect(
      deploy.resolveBuildCommitFromGit(() => ({ status: 128 })),
    ).toBeNull();
    expect(
      deploy.resolveBuildCommitFromGit(() => {
        throw new Error("git is not installed");
      }),
    ).toBeNull();
  });
});
