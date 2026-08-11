import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { DEV_ORIGIN, DEV_PORT, PROD_PORT } from "./e2e/dev-server";

// Use the environment's pre-installed Chromium when present (this managed
// sandbox ships one at /opt/pw-browsers/chromium); in CI and elsewhere fall back
// to the browser Playwright installs itself. Conditional so the config works in
// both places without a hardcoded path that only exists here.
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const chromiumExecutablePath = existsSync(LOCAL_CHROMIUM)
  ? LOCAL_CHROMIUM
  : undefined;

/**
 * Deliberately minimal, deterministic E2E setup (see ADR-008, ADR-016 and the
 * FND-01/FND-09 roadmap items). Two local servers, no external services, no
 * production URL, no retries that could mask flakiness. Both run server code in
 * the Cloudflare Workers runtime (via `@cloudflare/vite-plugin`), the same runtime
 * used in production:
 *
 *   - The DEV server (`react-router dev`, port 4173) reads `.dev.vars` and runs
 *     the explicit development authenticator, so the browser journey can sign in
 *     as the fixed non-personal development identity. This is the `baseURL`.
 *   - The PRODUCTION-MODE server (`vite preview` of the real build, port 4174)
 *     ignores `.dev.vars` and runs Cloudflare Access mode with empty config, so an
 *     unauthenticated request fails closed — proving the production behaviour
 *     without automating a live Cloudflare login.
 */
// Shared with `e2e/helpers.ts`, which needs the same origin to build the
// same-origin mutation headers the request boundary now requires.
const baseURL = DEV_ORIGIN;

/*
 * The `*-screenshots.spec.ts` passes are opt-in capture runs: each one is
 * wrapped in a `test.skip(process.env.CAPTURE_SCREENSHOTS !== "1", …)` (or the
 * `CAPTURE_EVIDENCE` equivalent), so in an ordinary run every one of their
 * ~190 tests is collected, distributed to a shard and then skipped.
 *
 * Skipping is nearly free in TIME but not in DISTRIBUTION: Playwright's
 * `--shard` splits by test COUNT, so a slice that happened to draw many capture
 * stubs did almost no work while its siblings did all of theirs. That is a
 * meaningful part of why the shard spread was ~1.9x the mean, and why the split
 * had to keep growing to keep the worst shard under the ceiling.
 *
 * Ignoring the files outright when nothing has opted in removes the no-ops from
 * the distribution entirely, so every shard's slice is real work. Setting either
 * capture variable brings them back, which is the only mode in which they do
 * anything at all.
 */
const capturing =
  process.env.CAPTURE_SCREENSHOTS === "1" ||
  process.env.CAPTURE_EVIDENCE === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: capturing ? [] : ["**/*-screenshots.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        // Machine-readable per-test durations, written INSIDE the HTML report
        // directory so the single "playwright-report" artifact carries both the
        // human report and the numbers a future shard rebalance needs.
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  /*
   * Slow-file visibility (DEBT-41). Printed at the end of EVERY run, green or
   * red, so a spec quietly growing towards the shard budget is visible before it
   * blows it. The `list` reporter already prints each individual test's duration.
   */
  reportSlowTests: { max: 10, threshold: 30_000 },
  /*
   * A self-imposed ceiling in CI, deliberately set BELOW the workflow job's
   * `timeout-minutes` (see `.github/workflows/ci.yml`). It exists so a runaway
   * shard is terminated by Playwright — which then writes its HTML report,
   * traces and screenshots and exits non-zero — rather than by GitHub, which
   * cancels the job and destroys that evidence.
   *
   * 2026-08-11 — raised 15 → 25 as the deliberate other half of cutting the
   * split from eighteen shards to eight. It is NOT a response to a suite that
   * outgrew its budget, which is what the four previous re-splits were, and it
   * does not pin the worst shard against a moving ceiling: the ceiling is
   * re-derived from measurement each time the split changes.
   *
   * MEASURED on run 31445526789 (`main` @ e1e8bab): the twelve shards that
   * completed spent 73.4 minutes of test time between them, a mean of 6.1 and a
   * worst of 9.5 — so the whole suite is very close to 110 minutes of
   * single-worker test time. Over EIGHT slices that is a 13.8-minute mean. The
   * observed max/mean on that run was 1.56, and the capture-stub exclusion above
   * pulls it in further by removing the no-op-heavy fast slices, so the worst
   * shard should land near 20 minutes. 25 leaves ~25% headroom on that and still
   * fires well before the job's 40-minute backstop, preserving the ordering the
   * whole arrangement depends on.
   *
   * Eight, rather than fewer, because the runner pool is the real constraint:
   * on that same run shards 5, 9, 10, 12, 16 and 17 sat QUEUED for 5.5–7.0
   * minutes waiting for a runner. Past roughly twelve concurrent jobs the extra
   * shards bought no wall-clock at all — they only added a setup each. Eight
   * starts immediately, in one wave.
   *
   * Unset outside CI so a full local suite run (all shards in one process) is
   * never killed mid-way.
   */
  globalTimeout: process.env.CI ? 25 * 60_000 : undefined,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  metadata: { productionModeBaseURL: `http://localhost:${PROD_PORT}` },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      // Development-auth server for the authenticated browser journey. The local
      // D1 is migrated and the configured workspace seeded first, so the
      // authenticated /search route (DS-08) can resolve it through the real
      // composition boundary.
      command: `node ./e2e/setup-dev-auth.mjs && node ./e2e/setup-local-db.mjs && pnpm exec react-router dev --port ${DEV_PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Production-mode server (real build) for the unauthenticated fail-closed
      // check. The build copies `.dev.vars` into `build/server/`; we strip it so
      // preview runs Cloudflare Access mode with empty config and rejects
      // protected routes (no development-auth override leaks in).
      //
      // CI shards set PLAYWRIGHT_SKIP_BUILD=1 after downloading the exact
      // `build/` artifact produced once by the workflow's build job, so three
      // shards don't each redundantly rebuild the identical production bundle.
      // Local/default usage (the flag unset) still builds fresh, so `pnpm run
      // test:e2e` keeps working standalone against current source.
      command: process.env.PLAYWRIGHT_SKIP_BUILD
        ? `node ./e2e/strip-dev-vars.mjs && pnpm exec vite preview --port ${PROD_PORT} --strictPort`
        : `pnpm run build && node ./e2e/strip-dev-vars.mjs && pnpm exec vite preview --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
