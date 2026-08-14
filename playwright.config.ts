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
 * ~190 tests would be collected and then skipped.
 *
 * Ignoring the files outright when nothing has opted in keeps them out of the
 * gate's partition entirely (`scripts/e2e-partitions.mjs` applies the same
 * rule), so every partition's work is real work. Setting either capture
 * variable brings them back, which is the only mode in which they do anything
 * at all.
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
   * partition is terminated by Playwright — which then writes its HTML report,
   * its `results.json`, traces and screenshots and exits non-zero — rather than
   * by GitHub, which cancels the job and destroys that evidence.
   *
   * 25 minutes, UNCHANGED by HARDEN-04, and that is the point. The four
   * re-splits before it (3 → 5 → 7 → 10 → 14 → 18 → 8) each answered a shard
   * hitting this ceiling, and by 2026-08-12 raising it had stopped being an
   * option at all: shard 8 was completing 102–160 of its ~190 tests in the full
   * 25 minutes, which extrapolates to 31–46 minutes — past the job's own
   * 40-minute backstop, so a bigger ceiling would only have moved the failure
   * from Playwright (which reports) to GitHub (which cancels).
   *
   * What changed instead is WHAT A PARTITION HOLDS. `--shard=n/N` divided the
   * suite by test COUNT while its tests cost between 0.8 s and 53 s each, so the
   * worst shard was "whatever the draw happened to concentrate" and adding a
   * spec file anywhere re-sliced every shard. The gate now runs the ten
   * time-balanced partitions of `e2e/partitions.json`
   * (`scripts/e2e-partitions.mjs`), derived from the per-spec-file seconds
   * MEASURED on runs 31675715619, 31690164253 and 31697528360.
   *
   * Against that split this ceiling is a backstop rather than a budget: the
   * heaviest partition is ~15 minutes of measured test time, so it fires only if
   * a partition takes about 65% longer than its own measurement — and if one
   * ever does, `scripts/e2e-partition-summary.mjs` says so in those words
   * instead of leaving a red job that reads like a failed assertion.
   *
   * Per-partition BROWSER LIFETIME was sized too, not just per-partition
   * minutes. Under the old eight-way split each shard put ~190 tests through one
   * long-lived Chromium over ~24 minutes, and HARDEN-01 recorded
   * `browser.newContext: … has been closed` landing at a POSITION (~185 tests
   * in) rather than on a test on three of four sampled runs. Ten partitions hold
   * ~14 minutes and ~160 tests each, so this change shortens browser lifetime
   * rather than trading it away.
   *
   * Unset outside CI so a full local gate run (`pnpm run e2e:gate`) is never
   * killed mid-way.
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
          : /*
             * HARDEN-02 — the FULL Chromium build, chosen at LAUNCH.
             *
             * DEBT-125's crash is a SIGSEGV inside `chrome-headless-shell`, and
             * HARDEN-01 answered it by installing the full Chromium build in CI.
             * That was the right diagnosis and the wrong lever: `playwright
             * install chromium` installs BOTH binaries, and which one runs is
             * decided at launch, not at install. Playwright's own selection is
             *
             *   getExecutableName({ channel, headless }) {
             *     …
             *     return options.headless ? "chromium-headless-shell" : "chromium";
             *   }
             *
             * so a headless run with no channel takes the shell no matter what
             * was installed. MEASURED locally at Playwright 1.62.1:
             *
             *   launch({ headless: true })
             *     → …/chromium_headless_shell-<rev>/…/chrome-headless-shell
             *   launch({ headless: true, channel: "chromium" })
             *     → …/chromium-<rev>/chrome-linux64/chrome
             *
             * CI therefore kept running the crashing binary after HARDEN-01, and
             * the crash duly recurred on `main` @ b806246 (run 31488073976,
             * shard 1): `Received signal 11 SEGV_MAPERR 0000000001b0` with every
             * frame inside `chromium_headless_shell-1234/…/chrome-headless-shell`.
             * That is NOT the falsifier HARDEN-01 wrote down — the hypothesis was
             * never actually tested, because the change never reached the launch.
             *
             * `channel: "chromium"` is the documented way to ask for the full
             * browser in headless mode, and it is set only when this environment
             * does not already pin an explicit executable (the managed sandbox's
             * `/opt/pw-browsers/chromium` IS the full build — which is exactly why
             * the crash has never reproduced locally).
             *
             * The falsifier, restated so the next person can act on it: if the
             * SIGSEGV recurs with `chrome-linux64/chrome` in the frames, the
             * binary is not the cause and DEBT-125 reopens with that evidence.
             */
            { channel: "chromium" }),
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
