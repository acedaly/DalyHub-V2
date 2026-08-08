/**
 * REVIEW-03 — the Review evidence set.
 *
 * Deliberately small. The question these captures answer is "does the evidence
 * READ clearly and say something worth reading", not "does it render" — the
 * functional spec already proves that. So: the surface it replaces, the same
 * Review after, the first-Review case that must not become a wall of zeros, the
 * attention-heavy view, a phone and one dark-mode frame. Six frames per stage,
 * not thirty.
 *
 * STAGED, like the #131/#132 evidence sets, so ONE spec captures both sides:
 *
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before pnpm exec playwright test e2e/reviews-insights-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=after  pnpm exec playwright test e2e/reviews-insights-screenshots.spec.ts
 *
 * Every frame is taken against `e2e/seed-review-insights.sql` — a week that
 * actually happened — so the captures are reproducible rather than dependent on
 * whatever is in the local database.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, waitForInteractive } from "./helpers";

const STAGE = process.env.SHOT_STAGE === "before" ? "before" : "after";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "docs", "design", "assets", "review-03-2026-08");
const SEED_FILE = join(HERE, "seed-review-insights.sql");
const WORKSPACE = "local-dev-workspace";

const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const CURRENT_REVIEW = "/reviews/ri-review-now?tab=progress";
const FIRST_REVIEW = "/reviews/ri-review-first?tab=progress";
const GUIDED_REVIEW = "/reviews/ri-review-now/guide?step=overview";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

function wrangler(args: readonly string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

const CLEANUP = [
  `DELETE FROM review_insight_snapshots WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_step_acknowledgements WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_workflow_state WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_sections WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM activities WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-act-%';`,
  `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-l-%';`,
  `DELETE FROM task_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM project_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM goal_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM area_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM entities WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-%';`,
].join("\n");

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  wrangler(["d1", "execute", "DB", "--local", "--command", CLEANUP]);
  wrangler(["d1", "execute", "DB", "--local", "--file", SEED_FILE]);
});

test.afterAll(() => {
  try {
    wrangler(["d1", "execute", "DB", "--local", "--command", CLEANUP]);
  } catch {
    // Best-effort, exactly as in the functional spec.
  }
});

/** Land on a surface and wait for something real, so no frame is mid-render. */
async function open(page: Page, path: string, settled: string | RegExp) {
  await gotoFixture(page, path);
  await waitForInteractive(page);
  await expect(
    page.getByRole("heading", { name: settled }).first(),
  ).toBeVisible();
  await page.waitForTimeout(250);
}

test.describe("laptop", () => {
  test.use({ viewport: LAPTOP });

  test(`captures the guided Review's opening step (${STAGE})`, async ({
    page,
  }) => {
    // BEFORE: six live counts with nothing to compare them against.
    // AFTER: the same step, answering what changed.
    await open(page, GUIDED_REVIEW, /Settle in/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-guided-overview-1440.png`),
      fullPage: true,
    });
  });

  test(`captures the Review record's Progress tab (${STAGE})`, async ({
    page,
  }) => {
    await open(page, CURRENT_REVIEW, /RI: This week/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-record-progress-1440.png`),
      fullPage: true,
    });
  });

  test(`captures the first-Review case (${STAGE})`, async ({ page }) => {
    await open(page, FIRST_REVIEW, /RI: A first ever Review/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-first-review-1440.png`),
      fullPage: true,
    });
  });

  test(`captures the Review record in dark (${STAGE})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, CURRENT_REVIEW, /RI: This week/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-record-progress-dark-1440.png`),
      fullPage: true,
    });
  });
});

test.describe("phone", () => {
  test.use({ viewport: PHONE });

  test(`captures the evidence on a phone (${STAGE})`, async ({ page }) => {
    await open(page, CURRENT_REVIEW, /RI: This week/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-record-progress-390.png`),
      fullPage: true,
    });
  });

  test(`captures the guided opening step on a phone (${STAGE})`, async ({
    page,
  }) => {
    await open(page, GUIDED_REVIEW, /Settle in/);
    await page.screenshot({
      path: join(OUT, `review03-${STAGE}-guided-overview-390.png`),
      fullPage: true,
    });
  });
});
