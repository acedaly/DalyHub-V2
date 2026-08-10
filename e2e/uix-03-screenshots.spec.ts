/**
 * UIX-03 — the Goals redesign screenshot matrix.
 *
 * Same comparative shape as `uix-01`/`uix-02`: one spec captures one matrix and
 * writes it under a `before-` prefix or none, chosen by an environment variable,
 * so nothing between a `before-` and its pair differs except the product.
 *
 *     node e2e/today-fixtures.mjs goals
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-03-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-03-screenshots.spec.ts
 *
 * The `goals` scenario is the dataset, not `gallery`: it seeds one Goal per
 * branch the progress engine can reach — decreasing with a real backslide,
 * increasing, behind schedule, milestone, target exceeded, not started, stale,
 * completed and legacy-unmeasured — which is what makes "can I read this Goal in
 * a second?" a question the screenshots can actually answer.
 *
 * The phone contexts declare `isMobile`/`hasTouch` because a desktop Chromium
 * narrowed to 390px still answers `(hover: hover)` — without it this photographs
 * the mouse layout at phone width and files it under the phone.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, waitForInteractive } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-03-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

const LAPTOP = { width: 1280, height: 1100 };
const WIDE = { width: 1440, height: 1100 };
const PHONE = { width: 390, height: 844 };

/** The seeded weight Goal — the brief's own acceptance case. */
const WEIGHT_GOAL = "/goals/tf-goal-weight";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/** Open the progress-entry sheet from a measurable Goal record. */
async function openProgressEntry(page: Page) {
  await gotoFixture(page, WEIGHT_GOAL);
  await page.getByTestId("goal-record-measurement").first().click();
  await expect(page.getByTestId("goal-check-in-sheet")).toBeVisible();
  await page.waitForTimeout(400);
}

/* -------------------------------------------------------------------------- */
/* Goals index                                                                */
/* -------------------------------------------------------------------------- */

test.describe("goals index — desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("goals index 1280", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-index-1280-light");
  });

  test("goal detail 1280", async ({ page }) => {
    await gotoFixture(page, WEIGHT_GOAL);
    await shoot(page, "goal-detail-1280-light");
  });

  test("today 1280", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-1280-light");
  });
});

test.describe("goals index — desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("goals index 1440", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-index-1440-light");
  });

  test("goal detail 1440", async ({ page }) => {
    await gotoFixture(page, WEIGHT_GOAL);
    await shoot(page, "goal-detail-1440-light");
  });
});

test.describe("goals index — desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("goals index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-index-1280-dark");
  });

  test("goal detail 1280 dark", async ({ page }) => {
    await gotoFixture(page, WEIGHT_GOAL);
    await shoot(page, "goal-detail-1280-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Phone                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("phone light", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("goals index 390", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-index-390-light");
  });

  test("goal detail 390", async ({ page }) => {
    await gotoFixture(page, WEIGHT_GOAL);
    await shoot(page, "goal-detail-390-light");
  });

  test("today 390", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-390-light");
  });

  test("progress entry 390", async ({ page }) => {
    await openProgressEntry(page);
    await shoot(page, "progress-entry-390-light");
  });
});

test.describe("phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("goals index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-index-390-dark");
  });

  test("goal detail 390 dark", async ({ page }) => {
    await gotoFixture(page, WEIGHT_GOAL);
    await shoot(page, "goal-detail-390-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Progress entry — desktop                                                   */
/* -------------------------------------------------------------------------- */

test.describe("progress entry — desktop", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("progress entry 1280", async ({ page }) => {
    await openProgressEntry(page);
    await shoot(page, "progress-entry-1280-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Additional Goal shapes — the branches one Goal cannot show                 */
/* -------------------------------------------------------------------------- */

test.describe("goal shapes — desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  for (const [slug, name] of [
    ["tf-goal-halfmarathon", "milestone"],
    ["tf-goal-books", "behind"],
    ["tf-goal-walk", "exceeded"],
    ["tf-goal-family", "unmeasured"],
    ["tf-goal-screen", "not-started"],
  ] as const) {
    test(`goal ${name} 1280`, async ({ page }) => {
      await page.goto(`/goals/${slug}`);
      await waitForInteractive(page);
      await shoot(page, `goal-${name}-1280-light`);
    });
  }
});
