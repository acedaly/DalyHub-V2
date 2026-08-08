/**
 * ASSET-03 — phone-first capture of a NEW Asset (real Worker + local D1).
 *
 * The question this suite answers is the item's own definition of done: can the
 * owner take out a phone and, from anywhere in DalyHub, tap `+`, choose Asset,
 * name it, choose the right kind, and have a valid canonical Asset — without
 * fighting the interface?
 *
 * So it drives the real global capture surface at phone widths: the chooser now
 * offering Asset, the grouped type sheet, the progressive reveal for two very
 * different kinds of Asset (a trailer and an insurance policy), validation,
 * cancel-without-mutation, keyboard operation, axe, the 320–430px matrix, and a
 * desktop regression that the `/new/asset` page is untouched.
 *
 * Records are created through the UI and removed by the module's own fixture
 * cleanup, so the suite depends on no seeded Asset.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupAllAssetFixtures,
  cleanupAssetByTitle,
  uniqueAssetTitle,
} from "./assets-fixtures";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const PHONE = { width: 390, height: 844 };
const bottomNav = "[data-testid='bottom-nav']";

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

/** Open the shared capture sheet from the phone bottom bar, on the chooser. */
async function openCaptureChooser(page: Page) {
  await page
    .locator(bottomNav)
    .getByRole("button", { name: "Capture" })
    .click();
  const sheet = page.getByTestId("capture-sheet");
  await expect(sheet).toBeVisible();
  const changeType = sheet.getByTestId("capture-change-type");
  if (await changeType.isVisible()) {
    await changeType.click();
  }
  return sheet;
}

/** Global `+` → Asset: the whole point of the item. */
async function openAssetCapture(page: Page) {
  const sheet = await openCaptureChooser(page);
  await sheet.getByTestId("capture-choose-asset").click();
  await expect(sheet.getByRole("form", { name: "New Asset" })).toBeVisible();
  return sheet;
}

/**
 * The compact Type control. Addressed by its class rather than by name because
 * after a failed submit the error summary offers its OWN "Type: …" jump button,
 * and both are legitimately named for the field.
 */
function typeTrigger(page: Page) {
  return page.locator("button.dh-select-trigger");
}

/** Choose a type in the compact presentation — the trigger plus the sheet. */
async function chooseTypeOnPhone(page: Page, label: string) {
  await typeTrigger(page).click();
  const typeSheet = page.getByRole("dialog", { name: "What kind of asset?" });
  await expect(typeSheet).toBeVisible();
  await typeSheet.getByRole("button", { name: label, exact: true }).click();
  await expect(typeSheet).toBeHidden();
  await expect(typeTrigger(page)).toHaveAccessibleName(`Type ${label}`);
}

test.describe("phone capture", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test("global + offers Asset, and captures a physical Asset in seconds", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const chooser = await openCaptureChooser(page);

    // The gap ASSET-03 closed: Asset is offered beside the routine record types.
    const assetChoice = chooser.getByTestId("capture-choose-asset");
    await expect(assetChoice).toBeVisible();
    await expect(assetChoice).toContainText("Asset");
    await expectMinTouchTarget(assetChoice);
    await assetChoice.click();

    // Focus lands on the field being captured, not on the Close button.
    const name = page.getByRole("textbox", { name: /^Name/ });
    await expect(name).toBeFocused();

    const title = uniqueAssetTitle("phone-trailer");
    owned.add(title);
    await name.fill(title);

    // Nothing type-specific is on screen until a kind is chosen.
    await expect(page.getByLabel(/Manufacturer/)).toHaveCount(0);
    await chooseTypeOnPhone(page, "Trailer or camper");

    // The physical field set — and only it.
    await expect(page.getByLabel(/Manufacturer/)).toBeVisible();
    await expect(page.getByLabel(/Serial number/)).toBeVisible();
    await expect(page.getByLabel(/Issuer or provider/)).toHaveCount(0);

    await page.getByLabel(/Manufacturer/).fill("Cub");
    await page.getByLabel(/^Model/).fill("Frontier");
    await page.getByLabel(/Location/).fill("Carport");
    await expectNoHorizontalOverflow(page);

    const create = page.getByRole("button", { name: "Create asset" });
    await expectMinTouchTarget(create);
    await create.click();

    // The shared post-capture confirmation, then the real canonical record.
    await expect(page.getByTestId("capture-result")).toBeVisible();
    await page.getByTestId("capture-open-record").click();
    await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Trailer or camper").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("captures a documentary Asset — an insurance policy, not a thing", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);

    const title = uniqueAssetTitle("phone-insurance");
    owned.add(title);
    await page.getByRole("textbox", { name: /^Name/ }).fill(title);
    await chooseTypeOnPhone(page, "Insurance");

    // A different kind of Asset asks for entirely different facts.
    await expect(page.getByLabel(/Issuer or provider/)).toBeVisible();
    await expect(page.getByLabel(/Renewal or expiry date/)).toBeVisible();
    await expect(page.getByLabel(/Serial number/)).toHaveCount(0);

    await page.getByLabel(/Issuer or provider/).fill("Ledger Mutual");
    await page.getByLabel(/Reference number/).fill("POL-99812");
    await page.getByLabel(/^Link/).fill("https://insurer.example/p/99812");
    await page.getByRole("button", { name: "Create asset" }).click();

    await expect(page.getByTestId("capture-result")).toBeVisible();
    await page.getByTestId("capture-open-record").click();
    await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // The captured facts landed in the canonical detail slice — the same one the
    // record's own Details tab edits.
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("textbox", { name: /^Issuer or provider/ }).first(),
    ).toHaveValue("Ledger Mutual");
    await expect(
      page.getByRole("textbox", { name: /^Reference number/ }).first(),
    ).toHaveValue("POL-99812");
  });

  test("switching type reveals the right fields and submits only those", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);

    const title = uniqueAssetTitle("phone-switch");
    owned.add(title);
    await page.getByRole("textbox", { name: /^Name/ }).fill(title);

    await chooseTypeOnPhone(page, "Vehicle");
    await page.getByLabel(/Manufacturer/).fill("Toyota");
    await page.getByLabel(/Serial number/).fill("VIN-SHOULD-NOT-PERSIST");

    // Changed their mind. The whole list is offered again — no clearing first.
    await chooseTypeOnPhone(page, "Licence");
    await expect(page.getByLabel(/Serial number/)).toHaveCount(0);
    await expect(page.getByLabel(/Issuer or provider/)).toBeVisible();
    await page.getByLabel(/Issuer or provider/).fill("Transport Authority");

    await page.getByRole("button", { name: "Create asset" }).click();
    await page.getByTestId("capture-open-record").click();
    await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);

    // The record is a Licence with an issuer, and carries no serial number it
    // was never asked for — the trailer fields were typed, then made irrelevant.
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("textbox", { name: /^Issuer or provider/ }).first(),
    ).toHaveValue("Transport Authority");
    await expect(
      page.getByRole("textbox", { name: /^Serial number/ }).first(),
    ).toHaveValue("");
    await expect(page.getByText("VIN-SHOULD-NOT-PERSIST")).toHaveCount(0);
  });

  test("says what is missing, keeps the words, and stays open", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const sheet = await openAssetCapture(page);

    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(sheet).toBeVisible();
    await expect(page.getByText("A name is required").first()).toBeVisible();
    await expect(page.getByText("Choose a type").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Recoverable: naming it and choosing a type is all it takes.
    const title = uniqueAssetTitle("phone-validation");
    owned.add(title);
    await page.getByRole("textbox", { name: /^Name/ }).fill(title);
    await chooseTypeOnPhone(page, "Tool");
    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page.getByTestId("capture-result")).toBeVisible();
  });

  test("cancelling captures nothing and restores focus to the opener", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await page.getByRole("textbox", { name: /^Name/ }).fill("Never created");
    await chooseTypeOnPhone(page, "Tool");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("capture-sheet")).toBeHidden();
    await expect(
      page.locator(bottomNav).getByRole("button", { name: "Capture" }),
    ).toBeFocused();

    // Nothing was written: the collection has no such Asset.
    await gotoFixture(page, "/assets");
    await expect(page.getByText("Never created")).toHaveCount(0);
  });

  test("Escape in the type sheet closes only the type sheet", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const sheet = await openAssetCapture(page);
    await typeTrigger(page).click();
    await expect(
      page.getByRole("dialog", { name: "What kind of asset?" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "What kind of asset?" }),
    ).toBeHidden();
    // The capture surface itself survives — one Escape, one surface.
    await expect(sheet).toBeVisible();
    await expect(typeTrigger(page)).toBeFocused();
  });

  test("the whole capture is operable by keyboard", async ({ page }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);

    const title = uniqueAssetTitle("phone-keyboard");
    owned.add(title);
    await page.keyboard.type(title);

    // Tab from Name to the Type trigger, open it with the keyboard, and pick.
    await page.keyboard.press("Tab");
    await expect(typeTrigger(page)).toBeFocused();
    await page.keyboard.press("Enter");
    const typeSheet = page.getByRole("dialog", { name: "What kind of asset?" });
    await expect(typeSheet).toBeVisible();
    await typeSheet
      .getByRole("button", { name: "Appliance", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(typeSheet).toBeHidden();
    // Focus comes back to the control that opened the sheet, not to the top.
    await expect(typeTrigger(page)).toBeFocused();
    await expect(typeTrigger(page)).toHaveAccessibleName("Type Appliance");

    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page.getByTestId("capture-result")).toBeVisible();
  });

  test("the type sheet is grouped, worded and thumb-sized", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await openAssetCapture(page);
    await typeTrigger(page).click();
    const typeSheet = page.getByRole("dialog", { name: "What kind of asset?" });

    // Grouping is presentation: four headings over the same thirteen types.
    await expect(typeSheet.getByRole("heading", { level: 3 })).toHaveCount(4);
    await expect(
      typeSheet.getByRole("button", { name: "Vehicle" }),
    ).toBeVisible();
    await expect(
      typeSheet.getByRole("button", { name: "Trailer or camper" }),
    ).toBeVisible();
    await expectMinTouchTarget(
      typeSheet.getByRole("button", { name: "Trailer or camper" }),
    );
    // Long labels wrap; they never push the page sideways.
    await expectNoHorizontalOverflow(page);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`Asset capture passes axe (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/today");
      await openAssetCapture(page);
      await expectNoAxeViolations(page, {
        include: "[data-testid='capture-sheet']",
      });

      await typeTrigger(page).click();
      await expect(
        page.getByRole("dialog", { name: "What kind of asset?" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("the phone width matrix", () => {
  for (const width of [320, 375, 390, 430]) {
    test(`Asset capture fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await gotoFixture(page, "/today");
      await openAssetCapture(page);
      await expectNoHorizontalOverflow(page);

      await page
        .getByRole("textbox", { name: /^Name/ })
        .fill(
          "A deliberately long asset name that must wrap rather than widen",
        );
      await chooseTypeOnPhone(page, "Trailer or camper");
      await expectNoHorizontalOverflow(page);

      // The commitment stays reachable and thumb-sized at every width.
      const create = page.getByRole("button", { name: "Create asset" });
      await expectMinTouchTarget(create);
      await expect(create).toBeInViewport();
    });
  }
});

test.describe("desktop is untouched", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the /new/asset page still creates through the combobox", async ({
    page,
  }) => {
    const title = uniqueAssetTitle("desktop-regression");
    owned.add(title);

    await gotoFixture(page, "/assets");
    await page.getByRole("link", { name: "New Asset" }).first().click();
    await expect(page).toHaveURL(/\/new\/asset$/);

    await page.getByRole("textbox", { name: /^Name/ }).fill(title);
    // The desktop presentation is still the DS-16 combobox, with type-to-filter.
    const combo = page.getByRole("combobox", { name: /Type/ });
    await combo.click();
    await combo.fill("Trailer");
    await page
      .getByRole("option", { name: "Trailer or camper", exact: true })
      .first()
      .click();
    await expect(page.getByLabel(/Manufacturer/)).toBeVisible();

    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("capture offers Asset on the desktop surface too", async ({ page }) => {
    await gotoFixture(page, "/today");
    const fab = page.locator("button.dh-fab");
    await fab.click();
    const sheet = page.getByTestId("capture-sheet");
    const changeType = sheet.getByTestId("capture-change-type");
    if (await changeType.isVisible()) {
      await changeType.click();
    }
    await sheet.getByTestId("capture-choose-asset").click();
    // One control, two presentations: the wide viewport keeps the combobox.
    await expect(sheet.getByRole("combobox", { name: "Type" })).toBeVisible();
  });
});
