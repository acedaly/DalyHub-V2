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
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
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
