/**
 * ADR-127 — the MCP Worker's capability boundary, asserted against the REAL
 * committed Wrangler config.
 *
 * The whole argument for a second Worker is that it holds no data authority:
 * it validates an Access assertion, validates tool input, and calls ONE named
 * entrypoint over a private Service Binding. That is a property of a
 * configuration file, and a configuration file is exactly the kind of thing
 * that acquires a binding "just for this one feature" and never loses it. So
 * the absence is tested rather than trusted: adding a database, bucket, queue,
 * secret store, AI, browser or outbound-proxy binding to this Worker fails
 * here, in the change that adds it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CONFIG_TEXT = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "workers",
    "dalyhub-mcp",
    "wrangler.jsonc",
  ),
  "utf8",
);

/**
 * Every Wrangler binding key that would give the MCP Worker reach of its own.
 * `services` is deliberately absent: that is the ONE binding it is allowed,
 * and its shape is asserted separately below.
 */
const FORBIDDEN_BINDINGS = [
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "queues",
  "durable_objects",
  "secrets_store_secrets",
  "hyperdrive",
  "vectorize",
  "analytics_engine_datasets",
  "dispatch_namespaces",
  "mtls_certificates",
  "browser",
  "ai",
  "images",
  "pipelines",
  "workflows",
  "send_email",
  "tail_consumers",
  "unsafe",
];

describe("dalyhub-mcp Worker capability boundary", () => {
  it("has no database, storage, secret, AI or outbound-proxy binding", () => {
    for (const binding of FORBIDDEN_BINDINGS) {
      expect(
        CONFIG_TEXT.includes(`"${binding}"`),
        `dalyhub-mcp must not declare a ${binding} binding`,
      ).toBe(false);
    }
  });

  it("reaches DalyHub only through the one named RPC entrypoint", () => {
    // Two service blocks: the local `dalyhub-v2` and the production
    // `dalyhub-v2-production`. Both name the entrypoint; neither is a route.
    const entrypoints = CONFIG_TEXT.match(/"entrypoint":\s*"([^"]+)"/g) ?? [];
    expect(entrypoints.length).toBeGreaterThan(0);
    for (const entrypoint of entrypoints) {
      expect(entrypoint).toContain("ChiefOfStaffEntrypoint");
    }
    const bindings = CONFIG_TEXT.match(/"binding":\s*"([^"]+)"/g) ?? [];
    for (const binding of bindings) {
      expect(binding).toContain("DALYHUB");
    }
  });

  it("is not publicly addressable except through its own custom domain", () => {
    expect(CONFIG_TEXT).toContain('"workers_dev": false');
    expect(CONFIG_TEXT).toContain('"preview_urls": false');
  });

  it("cannot fall back to development authentication in production", () => {
    const production = CONFIG_TEXT.slice(CONFIG_TEXT.indexOf('"production"'));
    expect(production).toContain('"AUTH_MODE": "cloudflare-access"');
    expect(production).not.toContain('"AUTH_MODE": "development"');
    expect(production).not.toContain("DEV_MCP_TOKEN");
  });
});
