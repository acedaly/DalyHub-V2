/**
 * The entity-icon picker's approval-gate capture.
 *
 * Opt-in exactly like the other screenshot passes (`CAPTURE_SCREENSHOTS=1`), so
 * the ordinary CI gate neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       e2e/icon-picker-screenshots.spec.ts --workers=1
 *
 * It captures the states the gate asks for, and deliberately captures the
 * AWKWARD ones as well as the flattering ones — 320px, the no-results message,
 * the reset-to-default state. A gate that only shows a picker at 1440px with a
 * neat 6x6 grid is not evidence about the picker, it is evidence about 1440px.
 *
 * Appearance is emulated rather than stored: DalyHub ships one generated
 * light/dark pair selected by `prefers-color-scheme` (ADR-074).
 *
 * Every capture that MUTATES is confined to Areas/Projects the icon spec already
 * owns, and nothing here leaves a record in a different state than it found it —
 * the picker is cancelled rather than applied wherever a capture only needs the
 * surface to be visible.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3-polish-2026-08",
  "icon-picker",
);

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 720 };

const AREA_WITH_ICON = "/areas/a-health";
const AREA_PLAIN = "/areas/a-dh";
const PROJECT_WITH_ICON = "/projects/pr-website";
const PROJECT_PLAIN = "/projects/pr-launch";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shot(page: Page, name: string) {
  // `animations: "disabled"` matters more than it looks: the sheet scales and
  // fades in, and the first attempt at this capture caught it mid-transition —
  // a semi-transparent panel with the page showing through, which is evidence
  // about the animation rather than about the picker.
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

/** Open the record's Settings tab and its icon picker. */
async function openPicker(page: Page, path: string) {
  await gotoFixture(page, `${path}?tab=settings`);
  await expect(page.getByRole("region", { name: "Appearance" })).toBeVisible();
  await page.getByRole("button", { name: /^Icon/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose an icon" }),
  ).toBeVisible();
  return page.getByRole("dialog", { name: "Choose an icon" });
}

test.describe("icon picker — desktop light", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light" });

  test("captures the Area and Project picker states", async ({ page }) => {
    // The Area picker, opened from a record with no icon: the default state an
    // owner meets first.
    const areaDialog = await openPicker(page, AREA_PLAIN);
    await shot(page, "area-picker-desktop-light");

    // A selected option: the check badge, the heavier border and the tinted
    // plane together, which is the "never colour alone" claim made visible.
    await areaDialog
      .getByRole("button", { name: "Travel", exact: true })
      .click();
    await shot(page, "area-picker-selected-desktop-light");

    // Reset to default — the staged preview returns to the entity glyph and
    // says what "default" means rather than just clearing.
    await areaDialog.getByRole("button", { name: "Use the default" }).click();
    await shot(page, "area-picker-reset-desktop-light");

    // Search with results, then with none.
    const search = areaDialog.getByRole("searchbox", { name: "Search icons" });
    await search.fill("car");
    await expect(
      areaDialog.getByRole("button", { name: "Vehicle", exact: true }),
    ).toBeVisible();
    await shot(page, "area-picker-search-results-desktop-light");

    await search.fill("zzzznothing");
    await expect(areaDialog.getByText(/No icons match/)).toBeVisible();
    await shot(page, "area-picker-search-empty-desktop-light");

    // Leave the Area exactly as found.
    await areaDialog.getByRole("button", { name: "Cancel" }).click();

    // The Project picker.
    await openPicker(page, PROJECT_PLAIN);
    await shot(page, "project-picker-desktop-light");
    await page.keyboard.press("Escape");

    // The EDIT state: a record that already has an icon shows it in the field
    // and pre-selects it in the grid.
    const editDialog = await openPicker(page, PROJECT_WITH_ICON);
    await expect(
      editDialog.getByRole("button", { name: "Travel", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await shot(page, "project-picker-existing-selection-desktop-light");
    await page.keyboard.press("Escape");
  });

  test("captures the create forms carrying the picker", async ({ page }) => {
    await gotoFixture(page, "/areas?drawer=new");
    const areaForm = page.getByRole("dialog");
    if ((await areaForm.count()) > 0) {
      await shot(page, "area-create-form-desktop-light");
    }
    await gotoFixture(page, "/projects?drawer=new");
    const projectForm = page.getByRole("dialog");
    if ((await projectForm.count()) > 0) {
      await shot(page, "project-create-form-desktop-light");
    }
  });

  test("captures records rendering a persisted icon", async ({ page }) => {
    await gotoFixture(page, AREA_WITH_ICON);
    await shot(page, "area-record-persisted-icon-desktop-light");
    await gotoFixture(page, PROJECT_WITH_ICON);
    await shot(page, "project-record-persisted-icon-desktop-light");
  });
});

test.describe("icon picker — desktop dark", () => {
  test.use({ viewport: DESKTOP, colorScheme: "dark" });

  test("captures the picker and a selected option", async ({ page }) => {
    const dialog = await openPicker(page, AREA_PLAIN);
    await shot(page, "area-picker-desktop-dark");
    await dialog.getByRole("button", { name: "Safety", exact: true }).click();
    await shot(page, "area-picker-selected-desktop-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("icon picker — mobile", () => {
  test.use({ viewport: MOBILE, colorScheme: "light" });

  test("captures the phone sheet for both entities", async ({ page }) => {
    await openPicker(page, AREA_PLAIN);
    await shot(page, "area-picker-mobile-390-light");
    await page.keyboard.press("Escape");

    await openPicker(page, PROJECT_PLAIN);
    await shot(page, "project-picker-mobile-390-light");
    await page.keyboard.press("Escape");
  });
});

test.describe("icon picker — mobile dark", () => {
  test.use({ viewport: MOBILE, colorScheme: "dark" });

  test("captures the phone sheet in the dark appearance", async ({ page }) => {
    await openPicker(page, AREA_PLAIN);
    await shot(page, "area-picker-mobile-390-dark");
    await page.keyboard.press("Escape");
  });
});

test.describe("icon picker — 320px", () => {
  test.use({ viewport: NARROW, colorScheme: "light" });

  test("captures the narrowest supported width", async ({ page }) => {
    await openPicker(page, AREA_PLAIN);
    // Captured WITH the overflow assertion, so the image and the invariant are
    // produced by the same run rather than by two that could disagree.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
    await shot(page, "area-picker-320");
    await page.keyboard.press("Escape");
  });
});
