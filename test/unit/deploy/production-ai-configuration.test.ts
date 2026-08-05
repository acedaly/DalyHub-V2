import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * AI-01 regression tests for the deploy guard's AI configuration check.
 *
 * Two things are being locked in, and they pull in opposite directions:
 *
 *   1. AI is OPTIONAL. A DalyHub deployment with no provider key at all is a
 *      fully supported production state, so the guard must NOT invent a
 *      requirement that makes an ordinary deploy fail.
 *   2. A HALF-configured AI setup is refused, because it silently sends
 *      requests somewhere the owner did not intend — a Gateway account id with
 *      no gateway id degrades to a direct provider call, which is a different
 *      data path.
 *
 * And one thing that matters more than either: the check never reads, prints,
 * echoes or returns a secret VALUE. It only ever asks whether one is present,
 * which is why every assertion below inspects presence and problem text and
 * never a credential.
 *
 * `scripts/deploy-production.mjs` is a plain Node ESM script deliberately kept
 * out of the type-checked program, so it is loaded via a runtime-resolved
 * dynamic import (the same approach `production-deploy-flow.test.ts` uses).
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

/** A fake key. Obviously not real, and never printed by anything under test. */
const FAKE_KEY = "not-a-real-key-synthetic-test-value";

/** Write a throwaway wrangler config so the readiness check has one to read. */
function tempWranglerConfig(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "dh-deploy-ai-"));
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe("checkAiConfiguration — absence is not a problem", () => {
  it("accepts a deployment with no AI configuration at all", () => {
    const result = deploy.checkAiConfiguration({});
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("treats blank and whitespace-only values as absent", () => {
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "   ",
      AI_GATEWAY_ACCOUNT_ID: "",
      AI_GATEWAY_ID: "\t",
      AI_GATEWAY_TOKEN: "",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a single provider key with no Gateway (the direct path)", () => {
    expect(
      deploy.checkAiConfiguration({ ANTHROPIC_API_KEY: FAKE_KEY }).ok,
    ).toBe(true);
    expect(deploy.checkAiConfiguration({ OPENAI_API_KEY: FAKE_KEY }).ok).toBe(
      true,
    );
  });

  it("accepts both provider keys with no Gateway", () => {
    expect(
      deploy.checkAiConfiguration({
        ANTHROPIC_API_KEY: FAKE_KEY,
        OPENAI_API_KEY: FAKE_KEY,
      }).ok,
    ).toBe(true);
  });

  it("accepts a fully configured Gateway with a provider key", () => {
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: FAKE_KEY,
      AI_GATEWAY_ACCOUNT_ID: "account-id",
      AI_GATEWAY_ID: "gateway-id",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a fully configured authenticated Gateway", () => {
    const result = deploy.checkAiConfiguration({
      OPENAI_API_KEY: FAKE_KEY,
      AI_GATEWAY_ACCOUNT_ID: "account-id",
      AI_GATEWAY_ID: "gateway-id",
      AI_GATEWAY_TOKEN: "gateway-token",
    });
    expect(result.ok).toBe(true);
  });
});

describe("checkAiConfiguration — an inconsistent setup is refused", () => {
  it("refuses a Gateway account id without a gateway id", () => {
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: FAKE_KEY,
      AI_GATEWAY_ACCOUNT_ID: "account-id",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("half-configured");
  });

  it("refuses a gateway id without an account id", () => {
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: FAKE_KEY,
      AI_GATEWAY_ID: "gateway-id",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("half-configured");
  });

  it("refuses a Gateway token with no gateway", () => {
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: FAKE_KEY,
      AI_GATEWAY_TOKEN: "gateway-token",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("AI_GATEWAY_TOKEN");
  });

  it("refuses a configured Gateway with no provider key", () => {
    const result = deploy.checkAiConfiguration({
      AI_GATEWAY_ACCOUNT_ID: "account-id",
      AI_GATEWAY_ID: "gateway-id",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("bring-your-own-keys");
  });
});

describe("checkAiConfiguration — no secret ever leaves the check", () => {
  it("never returns a secret value in a problem message", () => {
    const secret = "sk-SYNTHETIC-VALUE-THAT-MUST-NOT-BE-ECHOED";
    const result = deploy.checkAiConfiguration({
      ANTHROPIC_API_KEY: secret,
      OPENAI_API_KEY: secret,
      AI_GATEWAY_ACCOUNT_ID: secret,
      AI_GATEWAY_TOKEN: secret,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC-VALUE");
  });

  it("is pure — it does not mutate the environment it is given", () => {
    const env = { ANTHROPIC_API_KEY: FAKE_KEY };
    deploy.checkAiConfiguration(env);
    expect(env).toEqual({ ANTHROPIC_API_KEY: FAKE_KEY });
  });
});

describe("AI secrets are never committed as production vars", () => {
  it("lists every AI binding as a deploy-time secret", () => {
    expect([...deploy.AI_SECRET_KEYS].sort()).toEqual([
      "AI_GATEWAY_ACCOUNT_ID",
      "AI_GATEWAY_ID",
      "AI_GATEWAY_TOKEN",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
    ]);
  });

  it("refuses a committed production var for any AI binding", () => {
    // A committed `var` of the same name — even an empty one — OVERRIDES the
    // deploy-time secret in Workers, which would silently clobber the key.
    for (const key of deploy.AI_SECRET_KEYS) {
      const configPath = tempWranglerConfig({
        name: deploy.EXPECTED_PRODUCTION_WORKER_NAME,
        env: {
          production: {
            vars: {
              ENVIRONMENT: "production",
              AUTH_MODE: "cloudflare-access",
              [key]: "",
            },
          },
        },
      });
      const result = deploy.checkProductionDeployReadiness({
        configPath,
        env: {},
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join(" ")).toContain(
        `env.production.vars must not commit ${key}`,
      );
    }
  });
});
