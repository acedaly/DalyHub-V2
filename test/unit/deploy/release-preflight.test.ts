import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * V2.0.1 — the production RELEASE preflight and the post-deploy health
 * assertion. Both are fail-closed guards around real releases:
 *
 *   - the release preflight refuses a dirty working tree, a branch other than
 *     pushed `main`, a HEAD that is not `origin/main`, a missing/red/pending
 *     CI Gate, and unacknowledged pending production D1 migrations — each with
 *     its own explicit, named, logged override flag and no general `--force`;
 *   - the health assertion refuses a wrong application name, status or
 *     environment, any version other than the release being shipped, a non-JSON
 *     body and an unreachable host — and, since HARDEN-01, reports a Cloudflare
 *     Access challenge as the third thing it is: the hostname doing its job,
 *     with the running release left UNVERIFIED rather than either failed or
 *     falsely passed.
 *
 * Every external dependency (git, the GitHub API, the production-d1 wrapper,
 * the live health endpoint) is INJECTED here — these tests run no real git
 * fetch, reach no real API, touch no production database and deploy nothing.
 *
 * `scripts/deploy-production.mjs` is a plain Node ESM script outside the
 * type-checked program; it is loaded via a runtime-resolved dynamic import,
 * matching `production-deploy-flow.test.ts`.
 */

const ROOT = process.cwd();
const MODULE_URL = pathToFileURL(
  join(ROOT, "scripts", "deploy-production.mjs"),
).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Node script under test.
type DeployModule = any;
let deploy: DeployModule;

beforeAll(async () => {
  deploy = await import(/* @vite-ignore */ MODULE_URL);
});

const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);

interface GitState {
  porcelain?: string;
  branch?: string;
  head?: string;
  originMain?: string;
  fetchFails?: boolean;
  remoteUrl?: string;
  migrationsList?: { status: number; stdout: string };
}

/** A fake `spawnSync` covering every command the release preflight runs. */
function fakeRunner(state: GitState = {}) {
  return (command: string, args: string[]) => {
    const joined = args.join(" ");
    if (command === "git") {
      if (joined === "status --porcelain") {
        return { status: 0, stdout: state.porcelain ?? "" };
      }
      if (joined === "rev-parse --abbrev-ref HEAD") {
        return { status: 0, stdout: state.branch ?? "main" };
      }
      if (joined === "rev-parse HEAD") {
        return { status: 0, stdout: state.head ?? HEAD };
      }
      if (joined === "fetch origin main") {
        return state.fetchFails
          ? { status: 1, stdout: "" }
          : { status: 0, stdout: "" };
      }
      if (joined === "rev-parse origin/main") {
        return { status: 0, stdout: state.originMain ?? state.head ?? HEAD };
      }
      if (joined === "config --get remote.origin.url") {
        return {
          status: 0,
          stdout: state.remoteUrl ?? "git@github.com:acedaly/DalyHub-V2.git",
        };
      }
    }
    if (command === "node" && joined.includes("production-d1.mjs")) {
      return (
        state.migrationsList ?? {
          status: 0,
          stdout: "✅ No migrations to apply!",
        }
      );
    }
    throw new Error(`unexpected command in test: ${command} ${joined}`);
  };
}

/** A fetch stub answering the GitHub check-runs API. */
function fakeGate(gate: {
  status?: string;
  conclusion?: string | null;
  missing?: boolean;
  httpStatus?: number;
}) {
  return async () => ({
    ok: (gate.httpStatus ?? 200) < 300,
    status: gate.httpStatus ?? 200,
    json: async () => ({
      check_runs: gate.missing
        ? []
        : [
            {
              name: "CI Gate",
              status: gate.status ?? "completed",
              conclusion: gate.conclusion ?? "success",
            },
          ],
    }),
  });
}

function preflight(options: {
  state?: GitState;
  gate?: Parameters<typeof fakeGate>[0];
  argv?: string[];
  log?: (line: string) => void;
}) {
  return deploy.runReleasePreflight({
    argv: options.argv ?? [],
    env: { GITHUB_TOKEN: "test-token" },
    runner: fakeRunner(options.state ?? {}),
    fetcher: fakeGate(options.gate ?? {}),
    log: options.log ?? (() => undefined),
  }) as Promise<{ ok: boolean; problems: string[] }>;
}

describe("runReleasePreflight — refusals (fail-closed defaults)", () => {
  it("passes when the tree is clean, HEAD is pushed main, CI Gate is green and no migration is pending", async () => {
    const result = await preflight({});
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("refuses a DIRTY working tree, naming the override flag", async () => {
    const result = await preflight({ state: { porcelain: " M app/root.tsx" } });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("working tree is dirty");
    expect(result.problems.join("\n")).toContain("--allow-dirty-tree");
  });

  it("refuses a branch other than main", async () => {
    const result = await preflight({
      state: { branch: "hotfix/thing", originMain: OTHER_HEAD },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain('"hotfix/thing", not "main"');
  });

  it("refuses when local HEAD does not match origin/main", async () => {
    const result = await preflight({
      state: { head: HEAD, originMain: OTHER_HEAD },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("does not match origin/main");
  });

  it("refuses when origin/main cannot be fetched (never passes blind)", async () => {
    const result = await preflight({ state: { fetchFails: true } });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(
      "could not fetch or resolve origin/main",
    );
  });

  it("refuses a RED CI Gate", async () => {
    const result = await preflight({ gate: { conclusion: "failure" } });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain('concluded "failure"');
  });

  it("refuses a still-running CI Gate — pending is not green", async () => {
    const result = await preflight({
      gate: { status: "in_progress", conclusion: null },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("still in_progress");
  });

  it("refuses a MISSING CI Gate check run", async () => {
    const result = await preflight({ gate: { missing: true } });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain('no "CI Gate" check run');
  });

  it("refuses when the GitHub API cannot verify the gate (e.g. no token on a private repo)", async () => {
    const result = await preflight({ gate: { httpStatus: 404 } });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("GitHub returned 404");
  });

  it("refuses PENDING production migrations without an explicit acknowledgement", async () => {
    const result = await preflight({
      state: {
        migrationsList: {
          status: 0,
          stdout:
            "Migrations to be applied:\n│ 0026_next_thing.sql │\n│ 0027_more.sql │",
        },
      },
    });
    expect(result.ok).toBe(false);
    const text = result.problems.join("\n");
    expect(text).toContain("0026_next_thing.sql");
    expect(text).toContain("0027_more.sql");
    expect(text).toContain("--acknowledge-pending-migrations");
    // Checking never applies: the guidance names the separate apply step.
    expect(text).toContain("db:production:apply");
  });

  it("refuses when the migrations CHECK itself fails (fail-closed, never assume none)", async () => {
    const result = await preflight({
      state: { migrationsList: { status: 1, stdout: "" } },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(
      "production migrations check failed",
    );
  });
});

describe("runReleasePreflight — explicit, named, logged overrides", () => {
  it("--allow-dirty-tree bypasses ONLY the clean-tree check, loudly", async () => {
    const lines: string[] = [];
    const result = await preflight({
      state: { porcelain: " M app/root.tsx" },
      argv: ["--allow-dirty-tree"],
      log: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    expect(lines.join("\n")).toContain("OVERRIDE --allow-dirty-tree");
  });

  it("--allow-non-main bypasses the branch and pushed-main checks, loudly", async () => {
    const lines: string[] = [];
    const result = await preflight({
      state: { branch: "hotfix/x", head: HEAD, originMain: OTHER_HEAD },
      argv: ["--allow-non-main"],
      log: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    expect(lines.join("\n")).toContain("OVERRIDE --allow-non-main");
  });

  it("--skip-ci-check bypasses the gate verification, loudly", async () => {
    const lines: string[] = [];
    const result = await preflight({
      gate: { conclusion: "failure" },
      argv: ["--skip-ci-check"],
      log: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    expect(lines.join("\n")).toContain("OVERRIDE --skip-ci-check");
  });

  it("--acknowledge-pending-migrations proceeds WITHOUT applying anything, loudly", async () => {
    const lines: string[] = [];
    const result = await preflight({
      state: {
        migrationsList: {
          status: 0,
          stdout: "Migrations to be applied:\n│ 0026_next_thing.sql │",
        },
      },
      argv: ["--acknowledge-pending-migrations"],
      log: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("OVERRIDE --acknowledge-pending-migrations");
    expect(text).toContain("does NOT apply them");
  });

  it("an override never bypasses a DIFFERENT check", async () => {
    const result = await preflight({
      state: { porcelain: " M dirty.ts" },
      gate: { conclusion: "failure" },
      argv: ["--skip-ci-check"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("working tree is dirty");
  });
});

describe("checkPendingProductionMigrations", () => {
  it("reports no pending migrations for a clean production database", () => {
    const result = deploy.checkPendingProductionMigrations({
      runner: fakeRunner({}),
    });
    expect(result).toMatchObject({ ok: true, pending: [] });
  });

  it("names each pending migration exactly once", () => {
    const result = deploy.checkPendingProductionMigrations({
      runner: fakeRunner({
        migrationsList: {
          status: 0,
          stdout:
            "│ 0026_next_thing.sql │\n│ 0026_next_thing.sql │\n│ 0027_more.sql │",
        },
      }),
    });
    expect(result.pending).toEqual(["0026_next_thing.sql", "0027_more.sql"]);
  });
});

describe("assertProductionHealth", () => {
  const healthy = {
    status: "ok",
    name: "DalyHub",
    version: "2.0.1",
    environment: "production",
  };

  function fetchAnswering(
    body: Record<string, unknown>,
    init: {
      status?: number;
      notJson?: boolean;
      location?: string;
    } = {},
  ) {
    // The call arguments are RECORDED rather than read back off `mock.calls`,
    // so a test can assert what the probe sent — including that it sent no
    // `headers` at all when no Access service token is configured.
    const seen: { url: string; options: Record<string, unknown> }[] = [];
    const fetcher = vi.fn(
      async (url: string, options: Record<string, unknown> = {}) => {
        seen.push({ url, options });
        return {
          ok: (init.status ?? 200) < 300,
          status: init.status ?? 200,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location"
                ? (init.location ?? null)
                : null,
          },
          json: async () => {
            if (init.notJson) throw new Error("not json");
            return body;
          },
        };
      },
    );
    return Object.assign(fetcher, { seen });
  }

  function assertHealth(
    // Deliberately loose: the injected fetcher is a stub, and different cases
    // need different shapes (a recording one, a throwing one, a flaky one).
    fetcher: unknown,
    options: Record<string, unknown> = {},
  ) {
    return deploy.assertProductionHealth({
      url: "https://example.test/health",
      expectedVersion: "2.0.1",
      fetcher,
      attempts: 1,
      log: () => undefined,
      ...options,
    }) as Promise<{
      ok: boolean;
      verified: boolean;
      reason?: string;
      problems: string[];
    }>;
  }

  it("passes for a direct, healthy production payload with the release version", async () => {
    const result = await assertHealth(fetchAnswering(healthy));
    expect(result).toEqual({ ok: true, verified: true, problems: [] });
  });

  /*
   * HARDEN-01 corrected this pair. The rule used to be "a 3xx is a failure,
   * because /health is public by design" — but Cloudflare Access protects the
   * whole `hub.daly.id.au` hostname, which is the origin hardening this file
   * enforces everywhere else, so an unauthenticated probe is ALWAYS answered by
   * Access. Under the old rule every successful deployment ended in a failed
   * assertion. The states are now distinguished rather than collapsed:
   * "Access answered" is not "the Worker is broken", and it is not "verified"
   * either.
   */
  it("reads a Cloudflare Access challenge as protected-but-unverified, not as a failure", async () => {
    const fetcher = fetchAnswering(
      {},
      {
        status: 302,
        location: "https://team.cloudflareaccess.com/cdn-cgi/access/login/x",
      },
    );
    const result = await assertHealth(fetcher);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("access-protected");
    // And it must not follow the redirect looking for a 200 login page.
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/health",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("treats a 401/403 from Access the same way as the redirect", async () => {
    for (const status of [401, 403]) {
      const result = await assertHealth(fetchAnswering({}, { status }));
      expect(result.ok).toBe(true);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe("access-protected");
    }
  });

  it("REFUSES the challenge when the endpoint is declared publicly reachable", async () => {
    // The strict rule still exists, behind an explicit declaration: if a bypass
    // policy is supposed to make /health public, a challenge means it is missing.
    const result = await assertHealth(
      fetchAnswering(
        {},
        {
          status: 302,
          location: "https://team.cloudflareaccess.com/cdn-cgi/access/login/x",
        },
      ),
      { requirePublic: true },
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("Cloudflare Access");
  });

  it("sends Access service-token headers when they are supplied, and none otherwise", async () => {
    const withToken = fetchAnswering(healthy);
    await assertHealth(withToken, {
      headers: { "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "s" },
    });
    expect(withToken).toHaveBeenCalledWith(
      "https://example.test/health",
      expect.objectContaining({
        headers: {
          "CF-Access-Client-Id": "id",
          "CF-Access-Client-Secret": "s",
        },
      }),
    );

    const withoutToken = fetchAnswering(healthy);
    await assertHealth(withoutToken, { headers: null });
    expect(withoutToken.seen[0]?.options).not.toHaveProperty("headers");
  });

  it("builds service-token headers only when BOTH halves are present", () => {
    expect(deploy.accessServiceTokenHeaders({})).toBeNull();
    expect(
      deploy.accessServiceTokenHeaders({
        PRODUCTION_ACCESS_SERVICE_TOKEN_ID: "id",
      }),
    ).toBeNull();
    expect(
      deploy.accessServiceTokenHeaders({
        PRODUCTION_ACCESS_SERVICE_TOKEN_ID: "id",
        PRODUCTION_ACCESS_SERVICE_TOKEN_SECRET: "secret",
      }),
    ).toEqual({
      "CF-Access-Client-Id": "id",
      "CF-Access-Client-Secret": "secret",
    });
  });

  it("refuses a version other than the release being shipped", async () => {
    const result = await assertHealth(
      fetchAnswering({ ...healthy, version: "2.0.0" }),
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain('"2.0.0"');
    expect(result.problems.join("\n")).toContain('"2.0.1"');
  });

  it("refuses a wrong environment, name or status", async () => {
    for (const bad of [
      { ...healthy, environment: "development" },
      { ...healthy, name: "SomethingElse" },
      { ...healthy, status: "degraded" },
    ]) {
      const result = await assertHealth(fetchAnswering(bad));
      expect(result.ok).toBe(false);
    }
  });

  it("refuses a non-JSON body and an unreachable endpoint", async () => {
    expect((await assertHealth(fetchAnswering({}, { notJson: true }))).ok).toBe(
      false,
    );
    const failing = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const result = await assertHealth(failing);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("could not reach");
  });

  it("asserts build identity when (and only when) the payload carries a commit", async () => {
    const withCommit = await assertHealth(
      fetchAnswering({ ...healthy, commit: "1234567" }),
      { expectedCommit: "abcdef0" },
    );
    expect(withCommit.ok).toBe(false);
    expect(withCommit.problems.join("\n")).toContain('"1234567"');

    // The payload deliberately exposes no commit (it is public): no refusal.
    const withoutCommit = await assertHealth(fetchAnswering(healthy), {
      expectedCommit: "abcdef0",
    });
    expect(withoutCommit.ok).toBe(true);
  });

  it("retries transient failures and succeeds without real waiting", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => healthy,
      };
    });
    const delays: number[] = [];
    const result = await assertHealth(flaky, {
      attempts: 3,
      delay: async (ms: number) => {
        delays.push(ms);
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(delays).toHaveLength(1);
  });
});
