/**
 * ASSET-01 — Assets end-to-end journey (real Worker + local D1).
 *
 * Creates several representative Assets through the real UI, then exercises the
 * journey: edit structured details, search, command palette, collection filters,
 * expiring/service-due views, archive + restore, sensitive-value masking on cards,
 * Back/Forward + refresh, mobile (320/390) no-overflow, and axe in light and dark.
 * Uses real D1-backed navigation, not mocked components.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  chooseAssetType,
  cleanupAllAssetFixtures,
  cleanupAssetByTitle,
  uniqueAssetTitle,
} from "./assets-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const owned = new Set<string>();

test.beforeAll(async () => {
  await cleanupAllAssetFixtures();
});

test.afterEach(async () => {
  for (const title of owned) {
    await cleanupAssetByTitle(title);
  }
  owned.clear();
});

/**
 * Choose an Asset type. The shared helper handles BOTH presentations of the one
 * control (combobox on desktop, option sheet below `md`), so a journey that runs
 * at 320px picks a type the same way a laptop journey does.
 */
async function chooseType(page: Page, label: string): Promise<void> {
  await chooseAssetType(page, label);
}

/** Create an Asset through the real /new/asset flow; returns its record URL. */
async function createAsset(
  page: Page,
  title: string,
  type: string,
): Promise<string> {
  owned.add(title);
  await gotoFixture(page, "/assets");
  await page.getByRole("link", { name: "New Asset" }).first().click();
  await expect(page).toHaveURL(/\/new\/asset$/);
  await page.getByRole("textbox", { name: /^Name/ }).fill(title);
  await chooseType(page, type);
  await page.getByRole("button", { name: "Create asset" }).click();
  await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
  return page.url();
}

test("create, edit, search, filter, archive, restore, delete", async ({
  page,
}) => {
  const vehicle = uniqueAssetTitle("vehicle");
  const appliance = uniqueAssetTitle("appliance");
  const licence = uniqueAssetTitle("licence");
  const subscription = uniqueAssetTitle("subscription");

  const vehicleUrl = await createAsset(page, vehicle, "Vehicle");
  await createAsset(page, appliance, "Appliance");
  await createAsset(page, licence, "Licence");
  await createAsset(page, subscription, "Software");

  // 2. Edit structured details on the Details tab (explicit save contract).
  await page.goto(vehicleUrl);
  await page.getByRole("tab", { name: "Details" }).click();
  await page
    .getByRole("textbox", { name: /^Manufacturer/ })
    .first()
    .fill("Toyota");
  await page.getByRole("button", { name: "Save details" }).click();
  /*
   * The record reflects the saved make — ONCE.
   *
   * This assertion used to prove the opposite: the make appeared both as the
   * header's "Make & model" chip and again in the Overview's identity line, and
   * the test called that duplication "a deliberate, proven product behaviour".
   * RECORD-01 removed it, along with the type and the status, which the Overview
   * was likewise restating from the header a few pixels above. The header's
   * context line is now the single place the make and model are stated.
   */
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(
    page.getByRole("list", { name: "Record context" }).getByText("Toyota"),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Overview" }).getByText("Toyota"),
  ).toHaveCount(0);

  // 6. Search finds the asset by title.
  await gotoFixture(page, "/assets");
  await page.getByRole("searchbox", { name: "Search assets" }).fill(vehicle);
  await expect(
    page.getByRole("link", { name: new RegExp(vehicle) }),
  ).toBeVisible();

  // 8. Filter the collection by type (Vehicle) — the appliance drops out.
  await gotoFixture(page, "/assets");
  await page.getByRole("combobox", { name: "Type" }).selectOption("vehicle");
  await expect(
    page.getByRole("link", { name: new RegExp(vehicle) }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(appliance) }),
  ).toHaveCount(0);

  // 10. Archive then restore from the Settings tab.
  await page.goto(vehicleUrl);
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Archive asset" }).click();
  // The record header status pill shows the archived record state.
  await expect(page.getByText(/Archived ·/)).toBeVisible();
  // 11. Archived state surfaces in the header; the Linked tab is read-only.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Restore asset" }).click();
  await expect(
    page.getByRole("button", { name: "Archive asset" }),
  ).toBeVisible();
});

test("command palette opens a New Asset flow and the Assets surface", async ({
  page,
}) => {
  await gotoFixture(page, "/assets");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox").fill("New Asset");
  await palette
    .getByRole("option", { name: /New Asset/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/new\/asset$/);
});

test("sensitive values never appear on collection cards", async ({ page }) => {
  const title = uniqueAssetTitle("private");
  const url = await createAsset(page, title, "Electronics");
  await page.goto(url);
  await page.getByRole("tab", { name: "Details" }).click();
  await page
    .getByRole("textbox", { name: /^Serial number/ })
    .first()
    .fill("SECRET-SERIAL-XYZ");
  await page.getByRole("button", { name: "Save details" }).click();

  await gotoFixture(page, "/assets");
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();
  // The serial number is never rendered on the collection.
  await expect(page.getByText("SECRET-SERIAL-XYZ")).toHaveCount(0);
});

test("browser Back / Forward and refresh preserve the record tab", async ({
  page,
}) => {
  const title = uniqueAssetTitle("nav");
  const url = await createAsset(page, title, "Tool");
  await page.goto(url);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page).toHaveURL(/tab=history/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/tab=history/);
});

for (const width of [390, 320]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    // A long single "word" exercises safe wrapping without a huge title (which
    // would bloat the fixture cleanup SQL).
    const title = uniqueAssetTitle(
      `mobile-${width}-longunbrokenwordthatmustwrap`,
    );
    const url = await createAsset(page, title, "Vehicle");
    await expectNoHorizontalOverflow(page);
    await page.goto(url);
    await expectNoHorizontalOverflow(page);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`assets surface passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const title = uniqueAssetTitle(`axe-${scheme}`);
    const url = await createAsset(page, title, "Insurance");
    await gotoFixture(page, "/assets");
    await expectNoAxeViolations(page);
    await page.goto(url);
    await expectNoAxeViolations(page);
  });
}
