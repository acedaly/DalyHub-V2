import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupGoalByTitle,
  createMeasurableGoal,
  uniqueGoalTitle,
} from "./goal-fixtures";
import { gotoFixture } from "./helpers";

/**
 * UNTITLED-11 — the visual evidence for Habits, the charts and Today.
 *
 * The migration brief requires each of those three surfaces at desktop, laptop,
 * 390 and 320, and in dark, against the same seeded development database the
 * journeys run on. These are the shots that get LOOKED AT, not just captured.
 *
 * Opt-in, like every other screenshot pass:
 *
 *     CAPTURE_SCREENSHOTS=1 \
 *       pnpm exec playwright test e2e/untitled-11-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "untitled-11",
);

const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 800 };
const SMALL_LAPTOP = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 720 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

test.describe("UNTITLED-11 — Habits", () => {
  test("collection, every width", async ({ page }) => {
    for (const [name, size] of [
      ["1440", DESKTOP],
      ["1280", LAPTOP],
      ["1024", SMALL_LAPTOP],
      ["390", PHONE],
      ["320", NARROW],
    ] as const) {
      await page.setViewportSize(size);
      await gotoFixture(page, "/habits");
      await shoot(page, `habits-collection-${name}`);
      await shoot(page, `habits-collection-${name}-full`, true);
    }
  });

  test("record, desktop and phone", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoFixture(page, "/habits/h-ev-strength");
    await shoot(page, "habits-record-1440", true);

    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/habits/h-ev-strength");
    await shoot(page, "habits-record-390", true);

    await page.setViewportSize(NARROW);
    await gotoFixture(page, "/habits/h-ev-strength");
    await shoot(page, "habits-record-320", true);
  });

  test("creation form", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoFixture(page, "/habits/new");
    await shoot(page, "habits-new-1440", true);
  });
});

test.describe("UNTITLED-11 — Habits in dark", () => {
  test.use({ colorScheme: "dark" });

  test("collection and record", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoFixture(page, "/habits");
    await shoot(page, "habits-collection-1440-dark", true);

    await gotoFixture(page, "/habits/h-ev-strength");
    await shoot(page, "habits-record-1440-dark", true);

    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/habits");
    await shoot(page, "habits-collection-390-dark", true);
  });
});

/**
 * The Goal trend needs READINGS, and the seeded database has no measurable Goal
 * with a history — so the chart shots build one, the same way
 * `goal-measurement.spec.ts` does, and remove it afterwards.
 */
test.describe("UNTITLED-11 — the Goal chart", () => {
  const title = uniqueGoalTitle("chart shot");

  test.afterAll(() => {
    cleanupGoalByTitle(title);
  });

  test("trend, every width, light and dark", async ({ page, browser }) => {
    await page.setViewportSize(DESKTOP);
    const goalUrl = await createMeasurableGoal(page, title);

    for (const [value, on] of [
      ["84.0", "2026-06-07"],
      ["82.6", "2026-06-28"],
      ["81.1", "2026-07-19"],
      ["79.4", "2026-08-09"],
      ["78.2", "2026-08-30"],
    ] as const) {
      await page.getByTestId("goal-record-measurement").first().click();
      const sheet = page.getByTestId("goal-check-in-sheet");
      await expect(sheet).toBeVisible();
      await sheet.getByRole("textbox", { name: /^Measurement/ }).fill(value);
      await sheet.getByLabel("Date").fill(on);
      await page.getByTestId("goal-check-in-save").click();
      await expect(sheet).toHaveCount(0);
    }

    const chart = page.getByTestId("goal-trend-chart");
    await expect(chart).toBeVisible();

    for (const [name, size] of [
      ["1440", DESKTOP],
      ["1024", SMALL_LAPTOP],
      ["390", PHONE],
      ["320", NARROW],
    ] as const) {
      await page.setViewportSize(size);
      await expect(chart).toBeVisible();
      await chart.screenshot({ path: join(OUT, `goal-chart-${name}.png`) });
      await shoot(page, `goal-record-${name}`);
    }

    // Dark needs its own context, so it is captured here rather than in a
    // second test that would have to rebuild the Goal's history.
    const dark = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await dark.newPage();
    await darkPage.setViewportSize(DESKTOP);
    await gotoFixture(darkPage, new URL(goalUrl).pathname);
    const darkChart = darkPage.getByTestId("goal-trend-chart");
    await expect(darkChart).toBeVisible();
    await darkChart.screenshot({ path: join(OUT, "goal-chart-1440-dark.png") });
    await darkPage.screenshot({
      path: join(OUT, "goal-record-1440-dark.png"),
    });
    await dark.close();
  });
});

test.describe("UNTITLED-11 — Today", () => {
  test("every width the contract names", async ({ page }) => {
    for (const [name, size] of [
      ["1920", { width: 1920, height: 1080 }],
      ["1440", DESKTOP],
      ["1280", LAPTOP],
      ["1024", SMALL_LAPTOP],
      ["768", { width: 768, height: 1024 }],
      ["430", { width: 430, height: 932 }],
      ["390", PHONE],
      ["375", { width: 375, height: 812 }],
      ["320", NARROW],
    ] as const) {
      await page.setViewportSize(size);
      await gotoFixture(page, "/today");
      await shoot(page, `today-${name}`);
      await shoot(page, `today-${name}-full`, true);
    }
  });
});

test.describe("UNTITLED-11 — Today in dark", () => {
  test.use({ colorScheme: "dark" });

  test("desktop and phone", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoFixture(page, "/today");
    await shoot(page, "today-1440-dark", true);

    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/today");
    await shoot(page, "today-390-dark", true);
  });
});
