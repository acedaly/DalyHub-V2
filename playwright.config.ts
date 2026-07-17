import { defineConfig, devices } from "@playwright/test";

/**
 * Deliberately minimal, deterministic E2E setup (see ADR-008 and the FND-01
 * roadmap item): a single Chromium project, no external services, no
 * production URL, no retries that could mask flakiness. The app is built once
 * and served locally through `vite preview`, which runs the server code in the
 * Cloudflare Workers runtime — the same runtime used in production.
 */
const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "pnpm run build && pnpm exec vite preview --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
