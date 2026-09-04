/**
 * V2.8 CONV-03 — the properties the stability measurement rests on.
 *
 * [DEBT-203](../../../docs/product/PRODUCT_DEBT.md) closes on **ten consecutive
 * green runs of one unchanged tree**, and that count is only worth taking if the
 * ten runs are the same gate, run the same way, with nothing hidden. Three
 * things have to be true for that, and none of them was checked anywhere:
 *
 *   1. **The gate can be re-run on an unchanged tree at all.** Until CONV-03 the
 *      only ways to obtain a second run of one commit were an empty commit —
 *      forbidden by this programme's own rules, and it changes the SHA anyway —
 *      or a re-run of the failed jobs, which is not a run of the gate. A
 *      `workflow_dispatch` trigger is the mechanism, and a workflow that quietly
 *      lost it would leave the next person back where CONV-03 started.
 *   2. **A dispatched run is a FULL run.** The `Scope` job may legitimately skip
 *      the expensive jobs for a documentation-only pull request. If a dispatched
 *      run could take that path, ten "green" runs could be ten runs of `Static`.
 *   3. **Nothing is retried, quarantined or allowlisted to reach green.** A
 *      single `retries: 1` would make the measurement meaningless without
 *      changing a line of any test.
 *
 * This is a TEXT check over the workflow and the Playwright config, for the
 * reason `toolchain-setup.test.ts` gives for its own: the shape that would catch
 * the regression at runtime is a CI run nobody can perform from here, while the
 * defect is plainly visible in the source. Each assertion below fails against
 * the state this item found — the first three because `workflow_dispatch` did
 * not exist.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKFLOW = join(process.cwd(), ".github", "workflows", "ci.yml");
const workflow = readFileSync(WORKFLOW, "utf8");

const PLAYWRIGHT_CONFIG = join(process.cwd(), "playwright.config.ts");
const playwrightConfig = readFileSync(PLAYWRIGHT_CONFIG, "utf8");

const E2E_DIR = join(process.cwd(), "e2e");

/** Every file the E2E suite is made of — specs, fixtures and helpers alike. */
function e2eSources(): { file: string; source: string }[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      file: `e2e/${name}`,
      source: readFileSync(join(E2E_DIR, name), "utf8"),
    }));
}

describe("the stability run can be taken at all", () => {
  it("offers a manual dispatch of the SAME workflow", () => {
    // Inside the `on:` block, not merely somewhere in the file.
    const triggers = workflow.slice(
      workflow.indexOf("\non:"),
      workflow.indexOf("\nconcurrency:"),
    );
    expect(triggers).toContain("workflow_dispatch:");
  });

  it("takes no inputs, so two dispatched runs cannot differ", () => {
    // An input is a way for two runs of "the same gate" to be different runs,
    // and a stability measurement whose runs can differ measures nothing.
    const dispatch = workflow.slice(workflow.indexOf("workflow_dispatch:"));
    const nextBlock = dispatch.indexOf("\nconcurrency:");
    expect(dispatch.slice(0, nextBlock)).not.toContain("inputs:");
  });

  it("gives a dispatched run a concurrency group of its own", () => {
    // Ten runs of one ref share a group otherwise, so they queue behind each
    // other for hours — and any future `cancel-in-progress` would make them
    // cancel each other, which is how a count of ten silently becomes one.
    const group = workflow
      .split("\n")
      .find((line) => line.trim().startsWith("group: ci-"));
    expect(group).toBeDefined();
    expect(group).toContain("workflow_dispatch");
    expect(group).toContain("github.run_id");
  });

  it("never cancels a dispatched or a `main` run in flight", () => {
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
  });

  it("runs EVERYTHING on a dispatch — the path filter is for pull requests only", () => {
    // `Scope` is fail-open by construction: anything that is not a pull request
    // sets `code=true` before the filter is consulted. That is what makes a
    // dispatched run a full run rather than a run of `Static` alone.
    expect(workflow).toContain(
      `if [ "\${{ github.event_name }}" != "pull_request" ]; then`,
    );
    const scope = workflow.slice(
      workflow.indexOf('if [ "${{ github.event_name }}" != "pull_request" ]'),
    );
    expect(scope.slice(0, 200)).toContain(
      'echo "code=true" >> "$GITHUB_OUTPUT"',
    );
  });
});

describe("green is measured, never retried", () => {
  it("keeps Playwright at `retries: 0`", () => {
    expect(playwrightConfig).toMatch(/^\s*retries:\s*0,\s*$/m);
  });

  it("has no per-file or per-describe retry override anywhere in the suite", () => {
    // `test.describe.configure({ retries: n })` and `test.info().retry` are the
    // two ways a single file could reintroduce retries without touching the
    // config every reviewer looks at.
    const offenders = e2eSources()
      .filter(({ source }) => /\bretries\s*:/.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("has no `test.only` — one would silently shrink the gate to one test", () => {
    // `forbidOnly` already fails the run in CI; this fails the commit.
    const offenders = e2eSources()
      .filter(({ source }) => /\btest\.only\(|\bdescribe\.only\(/.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("accepts nothing but success from a required job, with one named exception", () => {
    // The CI Gate's only tolerated non-success is a `Scope`-caused skip on a
    // documentation-only pull request, and it cross-checks that decision. An
    // allowlist of "known red" jobs would have to appear here to work, so this
    // is where its absence is asserted.
    expect(workflow).toContain(
      '.value.result != "success" and .value.result != "skipped"',
    );
    expect(workflow).not.toMatch(
      /allow(ed)?[-_ ]?fail|continue-on-error: true\s*\n\s*- name: Run E2E/i,
    );
  });
});
