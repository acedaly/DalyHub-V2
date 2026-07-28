import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

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
const DEV_PORT = 4173;
const PROD_PORT = 4174;
const baseURL = `http://localhost:${DEV_PORT}`;

export default defineConfig({
  testDir: "./e2e",
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
   * cancels the job and destroys that evidence. Sized against the measured
   * worst shard: on run 30314062657 (five shards, all green) the slowest spent
   * 11m09s on tests, so 15 minutes leaves roughly a third again in headroom for
   * runner variance while still catching a hang before the job backstop.
   * Unset outside CI so a full local suite run (all shards in one process) is
   * never killed mid-way.
   */
  globalTimeout: process.env.CI ? 15 * 60_000 : undefined,
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
