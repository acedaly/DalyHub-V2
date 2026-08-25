/**
 * DEBT-204 — the toolchain step obtains pnpm without an unretried network fetch.
 *
 * `package.json` pins `packageManager`, so the FIRST command that invokes pnpm
 * makes corepack download `pnpm-<version>.tgz` from `registry.npmjs.org`. That
 * first command used to be `actions/setup-node`'s own `pnpm store path
 * --silent`, run to resolve the cache directory — inside a step nobody owns,
 * with no retry and no fallback.
 *
 * MEASURED on `main`: CI run 32710624636, a documentation-only commit, lost E2E
 * p07 eleven seconds in when the HTTP response was truncated mid-stream and
 * Node's bundled undici crashed on it. Playwright never started; the other
 * eleven partitions ran the identical action on the identical commit and
 * passed. It is a FAN-OUT problem — sixteen jobs make the same call, so the
 * chance that at least one fails is roughly sixteen times the per-call rate,
 * and any single one turns the whole run red.
 *
 * This is a TEXT check over the composite action, for the reason
 * `task-checklist-query-bounds.test.ts` gives for its own: the shape that would
 * catch the regression at runtime is a CI job nobody can run from here, while
 * the defect itself is plainly visible in the source. What it pins is the two
 * properties the fix rests on — the ORDER, and the RETRY — so an edit that
 * removes either fails at the moment it is written rather than on the run that
 * happens to lose the coin toss.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ACTION = join(process.cwd(), ".github", "actions", "setup", "action.yml");
const source = readFileSync(ACTION, "utf8");

/** The `- name:` lines of the composite action's steps, in order. */
function stepNames(): string[] {
  return [...source.matchAll(/^\s{4}- name:\s*(.+)$/gm)].map((match) =>
    match[1]!.trim(),
  );
}

function indexOfStep(pattern: RegExp): number {
  return stepNames().findIndex((name) => pattern.test(name));
}

describe("the CI toolchain step", () => {
  it("materialises pnpm BEFORE setup-node asks for the store path", () => {
    /*
     * The ordering IS the fix. `cache: pnpm` resolves the store by running
     * `pnpm store path`, and that call can only avoid the network if pnpm is
     * already on disk. A step that prepares pnpm after `setup-node` would
     * satisfy every other assertion here and fix nothing.
     */
    const prepare = indexOfStep(/prepare pnpm/i);
    const setupNode = indexOfStep(/set up node/i);
    const install = indexOfStep(/install dependencies/i);

    expect(prepare, "no pnpm preparation step").toBeGreaterThanOrEqual(0);
    expect(setupNode).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThanOrEqual(0);
    expect(prepare).toBeLessThan(setupNode);
    expect(setupNode).toBeLessThan(install);
  });

  it("retries the fetch a bounded number of times", () => {
    // Bounded, not infinite: a genuinely unreachable registry must still fail.
    expect(source).toMatch(/PNPM_PREPARE_ATTEMPTS/);
    expect(source).toMatch(/corepack prepare --activate/);
    expect(source).toMatch(/seq 1 "\$\{PNPM_PREPARE_ATTEMPTS\}"/);
  });

  it("fails LOUDLY when every attempt fails, rather than swallowing it", () => {
    /*
     * A retry that hides a real outage is worse than no retry: it moves the
     * failure four steps later, into somebody else's action, with a message
     * about a missing binary rather than about a registry.
     */
    expect(source).toMatch(/::error::/);
    expect(source).toMatch(/exit 1/);
    expect(source).toMatch(/set -euo pipefail/);
  });

  it("states the mechanism in the action's own description", () => {
    // The closing condition asks for this by name, so a future edit meets the
    // reasoning before it meets the code.
    const description = source.slice(0, source.indexOf("runs:"));
    expect(description).toMatch(/DEBT-204/);
    expect(description).toMatch(/bounded retry/i);
  });

  it("is the ONLY place the toolchain is set up", () => {
    /*
     * The whole point of the composite action, and the property that makes one
     * fix reach sixteen jobs. A workflow that ran `corepack enable` or
     * `pnpm install` for itself would be outside this repair.
     */
    const workflows = join(process.cwd(), ".github", "workflows");
    const offenders: string[] = [];
    for (const file of readdirSync(workflows)) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const text = readFileSync(join(workflows, file), "utf8");
      if (/corepack enable|pnpm install --frozen-lockfile/.test(text)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      "these workflows set up the toolchain themselves instead of using " +
        "`.github/actions/setup`, so DEBT-204's retry does not cover them",
    ).toEqual([]);
  });
});
