/**
 * GOAL-02 — the visual acceptance capture.
 *
 * One pass over the surfaces this change owns, on a desktop and on an iPhone, in
 * both appearances, so the measurable-Goal work can be LOOKED AT rather than
 * described. It seeds the brief's own acceptance scenario (85 kg → 70 kg with
 * three readings) through the real product, so what is captured is a Goal an
 * owner could have created.
 *
 * Opt-in exactly like every other screenshot pass, so the ordinary gate neither
 * slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/goal-measurement-screenshots.spec.ts
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, ownerToday, waitForInteractive } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "goal-02",
);

const DESKTOP = { width: 1440, height: 1000 };
/** iPhone 15/16 logical resolution. */
const IPHONE = { width: 393, height: 852 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** The brief's acceptance Goal, created and measured through the product. */
async function seedAcceptanceGoal(page: Page): Promise<string> {
  await gotoFixture(page, "/areas/a-dh");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.getByRole("link", { name: "New Goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Goal" });
  await dialog.getByLabel(/Title/).fill("Reach 70 kg");
  await dialog.getByTestId("new-goal-measurement-target_value").check();
  await dialog.getByRole("textbox", { name: /^Measure in/ }).fill("kg");
  await dialog.getByRole("textbox", { name: /^Starting value/ }).fill("85");
  await dialog.getByRole("textbox", { name: /^Target value/ }).fill("70");
  await dialog.getByLabel("Target date").fill("2026-12-31");
  await dialog.getByRole("button", { name: "Create Goal" }).click();
  await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
  await waitForInteractive(page);

  for (const [value, measuredOn] of [
    ["85.0", "2026-06-10"],
    ["83.2", "2026-06-22"],
    ["81.6", "2026-07-05"],
    ["80.1", "2026-07-23"],
    ["79.3", "2026-07-31"],
    ["79.0", ownerToday()],
  ] as const) {
    await page.getByTestId("goal-record-measurement").first().click();
    const sheet = page.getByTestId("goal-check-in-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("textbox", { name: /^Measurement/ }).fill(value);
    await sheet.getByLabel("Date").fill(measuredOn);
    await page.getByTestId("goal-check-in-save").click();
    await expect(sheet).toHaveCount(0);
  }
  return page.url();
}

test.describe("GOAL-02 desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures the Goal record, the gallery and Today", async ({ page }) => {
    test.slow();
    const goalUrl = await seedAcceptanceGoal(page);

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      await gotoFixture(page, goalUrl);
      await expect(page.getByTestId("goal-progress")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `desktop-goal-record-${scheme}.png`),
      });

      await gotoFixture(page, "/goals");
      await page.screenshot({
        path: join(OUT, `desktop-goals-gallery-${scheme}.png`),
      });

      await gotoFixture(page, "/today");
      await expect(page.getByTestId("today-goal-progress")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `desktop-today-${scheme}.png`),
        fullPage: true,
      });
    }
  });
});

test.describe("GOAL-02 iPhone", () => {
  test.use({ viewport: IPHONE });

  test("captures the Goal record, the check-in and Today on a phone", async ({
    page,
  }) => {
    test.slow();
    const goalUrl = await seedAcceptanceGoal(page);

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      await gotoFixture(page, goalUrl);
      await expect(page.getByTestId("goal-progress")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `phone-goal-record-${scheme}.png`),
        fullPage: true,
      });

      // The check-in sheet — the interaction this feature has to be good at.
      await page.getByTestId("goal-record-measurement").first().click();
      await expect(page.getByTestId("goal-check-in-sheet")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `phone-goal-check-in-${scheme}.png`),
      });
      await page.keyboard.press("Escape");

      await gotoFixture(page, "/today");
      await expect(page.getByTestId("today-goal-progress")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `phone-today-${scheme}.png`),
        fullPage: true,
      });

      await gotoFixture(page, "/goals");
      await page.screenshot({
        path: join(OUT, `phone-goals-gallery-${scheme}.png`),
        fullPage: true,
      });
    }
  });
});
