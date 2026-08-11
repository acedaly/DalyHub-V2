/**
 * UIX-01 — the product-redesign screenshot matrix.
 *
 * The brief for this pass is comparative: capture the product BEFORE any visual
 * code changes, redesign against the two supplied reference PNGs (they live in
 * `docs/design/assets/references/`), then
 * capture the SAME matrix again and put the pairs beside the references. So this
 * spec captures one matrix and writes it under a `before-` prefix or none,
 * chosen by an environment variable — the same code, the same seeded day, the
 * same routes, the same viewports for both halves, so nothing in the comparison
 * differs except the product.
 *
 *     node e2e/today-fixtures.mjs typical
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test e2e/uix-01-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/uix-01-screenshots.spec.ts
 *
 * The phone contexts declare `isMobile`/`hasTouch` for the reason the M3X-02 and
 * VIS-01 specs record: a desktop Chromium narrowed to 390px still answers
 * `(hover: hover)`, so without it this photographs the mouse layout at phone
 * width and files it under the phone.
 *
 * Appearance is EMULATED (`colorScheme`) rather than switched in Settings, so a
 * dark capture is the device-driven `system` path — the one an owner who never
 * opens Settings actually sees.
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
  "uix-01-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

const LAPTOP = { width: 1280, height: 900 };
const WIDE = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

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

/* -------------------------------------------------------------------------- */
/* Desktop — light                                                            */
/* -------------------------------------------------------------------------- */

test.describe("desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("today 1280", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-1280-light");
  });

  test("tasks 1280", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-1280-light");
  });

  test("projects 1280", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-1280-light");
  });

  test("goals 1280", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await shoot(page, "goals-1280-light");
  });
});

test.describe("desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("today 1440", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-1440-light");
  });

  test("tasks 1440", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-1440-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Desktop — dark                                                             */
/* -------------------------------------------------------------------------- */

test.describe("desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("today 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-1280-dark");
  });

  test("tasks 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-1280-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Phone — light                                                              */
/* -------------------------------------------------------------------------- */

test.describe("phone light", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("today 390", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-390-light");
  });

  test("tasks 390", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-390-light");
  });

  test("quick add sheet 390", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await openQuickAdd(page);
    await shoot(page, "quick-add-390-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Phone — dark                                                               */
/* -------------------------------------------------------------------------- */

test.describe("phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("today 390 dark", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-390-dark");
  });

  test("tasks 390 dark", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-390-dark");
  });

  test("quick add sheet 390 dark", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    await openQuickAdd(page);
    await shoot(page, "quick-add-390-dark");
  });
});

/**
 * Open the phone TASK capture sheet through the controls an owner actually
 * uses: the bottom bar's central Create action, then the Task type. That is one
 * tap for a returning owner (the sheet remembers the last type for the session)
 * and two for a new one, and it is the surface the redesign reference draws.
 */
async function openQuickAdd(page: Page) {
  const create = page
    .locator("[data-testid='bottom-nav']")
    .getByRole("button", { name: /Create|New|Capture|Add/ })
    .first();
  await create.click();
  const sheet = page.getByTestId("capture-sheet");
  await expect(sheet).toBeVisible();
  const chooseTask = sheet.getByTestId("capture-choose-task");
  if (await chooseTask.isVisible().catch(() => false)) {
    await chooseTask.click();
  }
  await expect(sheet.getByRole("textbox", { name: /Title/ })).toBeVisible();
  await waitForInteractive(page);
  // Let the sheet's entrance transition finish so the capture is the resting state.
  await page.waitForTimeout(400);
}
