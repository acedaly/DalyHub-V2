import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupAssetByTitle, uniqueAssetTitle } from "./assets-fixtures";
import { gotoFixture } from "./helpers";

/**
 * ASSET-03 — the visual evidence for phone-first Asset capture.
 *
 * Deliberately SMALL: enough to judge the item and no more. Nine shots, into the
 * existing product-audit asset convention (`docs/product/assets/<pass>/`), taken
 * against the same seeded development database the journeys run on — nothing here
 * is a mock-up.
 *
 * Opt-in, like every other screenshot pass, so the ordinary E2E gate neither
 * slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/assets-mobile-capture-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "product",
  "assets",
  "asset-03-2026-08",
);

const PHONE = { width: 390, height: 844 };
const bottomNav = "[data-testid='bottom-nav']";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const owned = new Set<string>();

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  for (const title of owned) {
    await cleanupAssetByTitle(title);
  }
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

function typeTrigger(page: Page) {
  return page.locator("button.dh-select-trigger");
}

async function openChooser(page: Page) {
  await page
    .locator(bottomNav)
    .getByRole("button", { name: "Capture" })
    .click();
  const sheet = page.getByTestId("capture-sheet");
  await expect(sheet).toBeVisible();
  const change = sheet.getByTestId("capture-change-type");
  if (await change.isVisible()) await change.click();
  return sheet;
}

async function openAssetCapture(page: Page) {
  const sheet = await openChooser(page);
  await sheet.getByTestId("capture-choose-asset").click();
  await expect(sheet.getByRole("form", { name: "New Asset" })).toBeVisible();
  return sheet;
}

test.describe("ASSET-03 evidence — 390px", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test("01 — the global + offers Asset", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openChooser(page);
    await shoot(page, "01-global-capture-offers-asset");
  });

  test("02 — New Asset before a type is chosen", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page.getByRole("textbox", { name: /^Name/ }).fill("Cub Frontier");
    await shoot(page, "02-new-asset-before-type");
  });

  test("03 — the type picker, grouped", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await typeTrigger(page).click();
    await expect(
      page.getByRole("dialog", { name: "What kind of asset?" }),
    ).toBeVisible();
    await shoot(page, "03-type-picker");
  });

  test("04 — a physical Asset's fields", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page.getByRole("textbox", { name: /^Name/ }).fill("Cub Frontier");
    await typeTrigger(page).click();
    await page
      .getByRole("dialog", { name: "What kind of asset?" })
      .getByRole("button", { name: "Trailer or camper", exact: true })
      .click();
    await page.getByLabel(/Manufacturer/).fill("Cub");
    await page.getByLabel(/^Model/).fill("Frontier");
    await shoot(page, "04-physical-fields");
  });

  test("05 — a documentary Asset's fields", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page
      .getByRole("textbox", { name: /^Name/ })
      .fill("Hilux comprehensive insurance");
    await typeTrigger(page).click();
    await page
      .getByRole("dialog", { name: "What kind of asset?" })
      .getByRole("button", { name: "Insurance", exact: true })
      .click();
    await page.getByLabel(/Issuer or provider/).fill("Ledger Mutual");
    await shoot(page, "05-documentary-fields");
  });

  test("06 — validation", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page.getByText("A name is required").first()).toBeVisible();
    await shoot(page, "06-validation");
  });

  test("07 — the created Asset", async ({ page }) => {
    const title = uniqueAssetTitle("shot-trailer");
    owned.add(title);
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page.getByRole("textbox", { name: /^Name/ }).fill(title);
    await typeTrigger(page).click();
    await page
      .getByRole("dialog", { name: "What kind of asset?" })
      .getByRole("button", { name: "Trailer or camper", exact: true })
      .click();
    await page.getByLabel(/Manufacturer/).fill("Cub");
    await page.getByRole("button", { name: "Create asset" }).click();
    await page.getByTestId("capture-open-record").click();
    await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
    await shoot(page, "07-created-asset");
  });

  test("08 — the type picker in dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await typeTrigger(page).click();
    await expect(
      page.getByRole("dialog", { name: "What kind of asset?" }),
    ).toBeVisible();
    await shoot(page, "08-type-picker-dark");
  });
});

test.describe("ASSET-03 evidence — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("09 — /new/asset is unchanged", async ({ page }) => {
    await gotoFixture(page, "/new/asset");
    await page.getByRole("textbox", { name: /^Name/ }).fill("Cub Frontier");
    const combo = page.getByRole("combobox", { name: /Type/ });
    await combo.click();
    await combo.fill("Trailer");
    await page
      .getByRole("option", { name: "Trailer or camper", exact: true })
      .first()
      .click();
    await expect(page.getByLabel(/Manufacturer/)).toBeVisible();
    await shoot(page, "09-desktop-new-asset");
  });
});
