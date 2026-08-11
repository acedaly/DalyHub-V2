import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * HARDEN-01 — the read-only production verifier.
 *
 * The two properties that matter about this script are safety and honesty:
 *
 *   - it never mutates. Every Wrangler command it issues is a `list`, and the
 *     migrations check is delegated to the existing wrapper so there is one
 *     path to the production database rather than two. A test that only checked
 *     the happy path would not notice a `deploy` or an `apply` creeping in, so
 *     the commands themselves are asserted;
 *   - it never claims a verification it does not have. A check that cannot run —
 *     no credentials, an Access-protected origin — reports SKIPPED, and the
 *     summary says PARTIALLY VERIFIED. "Could not check" reading as a pass is
 *     precisely the confusion this whole hardening pass exists to end.
 *
 * Every external dependency (Wrangler, the migrations wrapper, the live health
 * endpoint) is INJECTED: these tests run no Wrangler, touch no production
 * database and make no request.
 */

const ROOT = process.cwd();
const MODULE_URL = pathToFileURL(
  join(ROOT, "scripts", "verify-production.mjs"),
).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VerifyModule = any;
let verify: VerifyModule;

beforeAll(async () => {
  verify = await import(/* @vite-ignore */ MODULE_URL);
});

const FULL_ENV = {
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_D1_DATABASE_ID: "11111111-2222-3333-4444-555555555555",
  PRODUCTION_DEFAULT_WORKSPACE_ID: "ws",
  PRODUCTION_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  PRODUCTION_ACCESS_AUD: "aud",
  PRODUCTION_OWNER_EMAIL: "owner@example.invalid",
};

/** A fake Wrangler that answers `deployments list` and `secret list`. */
function fakeRunner({
  deployments = JSON.stringify([
    { id: "dep-old", created_on: "2026-08-01T00:00:00Z" },
    { id: "dep-new", created_on: "2026-08-10T00:00:00Z" },
  ]),
  secrets = JSON.stringify([
    { name: "ACCESS_TEAM_DOMAIN" },
    { name: "ACCESS_AUD" },
    { name: "OWNER_EMAIL" },
  ]),
  status = 0,
} = {}) {
  const calls: { command: string; args: string[] }[] = [];
  const runner = vi.fn((command: string, args: string[]) => {
    calls.push({ command, args });
    if (args[0] === "deployments") return { status, stdout: deployments };
    if (args[0] === "secret") return { status, stdout: secrets };
    return { status: 0, stdout: "" };
  });
  return Object.assign(runner, { calls });
}

/** A stand-in for the deploy module's exports. */
interface FakeHealth {
  ok: boolean;
  verified: boolean;
  reason?: string;
  status?: number;
  problems: string[];
}

function fakeDeploy({
  pending = [] as string[],
  migrationsOk = true,
  health = { ok: true, verified: true, problems: [] } as FakeHealth,
}: {
  pending?: string[];
  migrationsOk?: boolean;
  health?: FakeHealth;
} = {}) {
  return {
    EXPECTED_PRODUCTION_WORKER_NAME: "dalyhub-v2-production",
    PRODUCTION_SECRET_KEYS: ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "OWNER_EMAIL"],
    DEFAULT_PRODUCTION_HEALTH_URL: "https://example.test/health",
    checkPendingProductionMigrations: () => ({
      ok: migrationsOk,
      pending,
      problems: migrationsOk ? [] : ["no credentials"],
    }),
    assertProductionHealth: async () => health,
  };
}

function run(options: Record<string, unknown> = {}) {
  return verify.verifyProduction({
    runner: fakeRunner(),
    env: FULL_ENV,
    log: () => undefined,
    deployModule: fakeDeploy(),
    ...options,
  }) as Promise<{
    checks: { name: string; status: string; detail: string }[];
    exitCode: number;
    verdict: string;
  }>;
}

describe("verify:production — what it reads", () => {
  it("reports every check green, and exits 0, when production is as expected", async () => {
    const outcome = await run();
    expect(outcome.checks.map((c) => c.status)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.verdict).toContain("VERIFIED");
    expect(outcome.verdict).not.toContain("NOT VERIFIED");
  });

  it("only ever asks Wrangler to LIST — never deploy, apply or put", async () => {
    const runner = fakeRunner();
    await run({ runner });
    expect(runner.calls.length).toBeGreaterThan(0);
    for (const call of runner.calls) {
      expect(call.args).toContain("list");
      for (const forbidden of ["deploy", "apply", "put", "delete", "execute"]) {
        expect(call.args).not.toContain(forbidden);
      }
    }
  });

  it("names the newest deployment even when Wrangler prints them oldest-last", async () => {
    // Ordering is not assumed: the entries are sorted by their own timestamp, so
    // a Wrangler upgrade that flips the order cannot make this report the wrong
    // revision while still looking green.
    expect(
      verify.newestDeployment(
        JSON.stringify([
          { id: "b", created_on: "2026-08-10T00:00:00Z" },
          { id: "a", created_on: "2026-08-01T00:00:00Z" },
        ]),
      ).id,
    ).toBe("b");
    expect(verify.newestDeployment("not json")).toBeNull();
    expect(verify.newestDeployment("[]")).toBeNull();
  });

  it("reads secret NAMES and nothing else", async () => {
    expect(
      verify.secretNames(
        JSON.stringify([{ name: "ACCESS_AUD", type: "secret_text" }]),
      ),
    ).toEqual(["ACCESS_AUD"]);
    expect(verify.secretNames("{}")).toEqual([]);
  });
});

describe("verify:production — when it refuses to call something verified", () => {
  it("SKIPS, and says PARTIALLY VERIFIED, when the configuration is absent", async () => {
    const outcome = await run({ env: {} });
    const config = outcome.checks.find((c) => c.name === "Configuration")!;
    expect(config.status).toBe("SKIPPED");
    expect(outcome.verdict).toContain("PARTIALLY VERIFIED");
    // Not a failure — this environment simply cannot answer the question.
    expect(outcome.exitCode).toBe(0);
  });

  it("SKIPS the health check on a Cloudflare Access challenge, and says so", async () => {
    const outcome = await run({
      deployModule: fakeDeploy({
        health: {
          ok: true,
          verified: false,
          reason: "access-protected",
          status: 302,
          problems: [],
        },
      }),
    });
    const health = outcome.checks.find((c) => c.name === "Application health")!;
    expect(health.status).toBe("SKIPPED");
    expect(health.detail).toContain("Access");
    expect(health.detail).toContain("NOT confirmed");
    expect(outcome.exitCode).toBe(0);
  });

  it("SKIPS rather than passes when Wrangler is not authenticated", async () => {
    const outcome = await run({ runner: fakeRunner({ status: 1 }) });
    const worker = outcome.checks.find((c) => c.name === "Worker deployment")!;
    const secrets = outcome.checks.find((c) => c.name === "Worker secrets")!;
    expect(worker.status).toBe("SKIPPED");
    expect(secrets.status).toBe("SKIPPED");
  });
});

describe("verify:production — what it calls a real failure", () => {
  it("FAILS on a missing Access secret, and exits non-zero", async () => {
    const outcome = await run({
      runner: fakeRunner({
        secrets: JSON.stringify([{ name: "ACCESS_AUD" }]),
      }),
    });
    const secrets = outcome.checks.find((c) => c.name === "Worker secrets")!;
    expect(secrets.status).toBe("FAIL");
    expect(secrets.detail).toContain("ACCESS_TEAM_DOMAIN");
    expect(secrets.detail).toContain("OWNER_EMAIL");
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdict).toContain("NOT VERIFIED");
  });

  it("FAILS on pending migrations, and refuses to apply them", async () => {
    const outcome = await run({
      deployModule: fakeDeploy({ pending: ["0039_something.sql"] }),
    });
    const migrations = outcome.checks.find((c) => c.name === "D1 migrations")!;
    expect(migrations.status).toBe("FAIL");
    expect(outcome.exitCode).toBe(1);
  });

  it("FAILS on an unhealthy application, carrying the reason through", async () => {
    const outcome = await run({
      deployModule: fakeDeploy({
        health: {
          ok: false,
          verified: false,
          problems: ["health status is bad"],
        },
      }),
    });
    const health = outcome.checks.find((c) => c.name === "Application health")!;
    expect(health.status).toBe("FAIL");
    expect(outcome.exitCode).toBe(1);
  });
});
