/**
 * Selectable Area and Project icons, proven in a real browser against real D1.
 *
 * The kernel and unit suites already cover the vocabulary, the repository and the
 * boundary validator. What only a browser can prove is the part an owner
 * actually experiences: that a choice made in the picker SURVIVES — through the
 * save, through a full page reload, and back out onto the record it belongs to.
 * A picker that appears to work and forgets on refresh is the failure mode worth
 * a browser for.
 *
 * The seed carries a deliberately PARTIAL set of icons (`e2e/seed-tasks.sql`):
 * `a-health` and `pr-website` have one, `a-dh` and `pr-launch` do not. That is
 * what lets the fallback and the persisted path both be asserted here rather
 * than one at the expense of the other.
 *
 * Mutations are confined to `a-dh` and restored at the end of the test that makes
 * them, so the shared-D1 suite is left exactly as it was found.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  gotoFixture,
} from "./helpers";

const AREA_WITH_ICON = "/areas/a-health";
const AREA_WITHOUT_ICON = "/areas/a-dh";
const PROJECT_WITH_ICON = "/projects/pr-website";
const PROJECT_WITHOUT_ICON = "/projects/pr-launch";

/** The record header's icon element, whatever glyph it currently resolves to. */
function headerIcon(page: Page) {
  return page.locator(".record-type__icon .dh-entity-icon").first();
}

async function openSettingsTab(page: Page, path: string) {
  await gotoFixture(page, `${path}?tab=settings`);
  await expect(page.getByRole("region", { name: "Appearance" })).toBeVisible();
}

test.describe("ICON-01 — a persisted icon reaches the record", () => {
  test("an Area with a chosen icon renders it; one without renders the default", async ({
    page,
  }) => {
    await gotoFixture(page, AREA_WITH_ICON);
    // `data-icon-key` is how `RecordIcon` reports a RESOLVED choice. Asserting
    // the attribute rather than the SVG path keeps this about persistence: the
    // glyph may be redrawn without the stored data changing, and this test is
    // about the data.
    await expect(headerIcon(page)).toHaveAttribute("data-icon-key", "shield");

    await gotoFixture(page, AREA_WITHOUT_ICON);
    // No choice: the element is still there and still identifies its entity,
    // it simply carries no key. A missing icon is never an empty box.
    await expect(headerIcon(page)).toBeVisible();
    await expect(headerIcon(page)).not.toHaveAttribute("data-icon-key", /./);
  });

  test("a Project with a chosen icon renders it; one without renders the default", async ({
    page,
  }) => {
    await gotoFixture(page, PROJECT_WITH_ICON);
    await expect(headerIcon(page)).toHaveAttribute("data-icon-key", "travel");

    await gotoFixture(page, PROJECT_WITHOUT_ICON);
    await expect(headerIcon(page)).toBeVisible();
    await expect(headerIcon(page)).not.toHaveAttribute("data-icon-key", /./);
  });
});

test.describe("ICON-02 — choosing, reloading and resetting", () => {
  test("choose an icon, reload, then reset it to the default", async ({
    page,
  }) => {
    await openSettingsTab(page, AREA_WITHOUT_ICON);

    const trigger = page.getByRole("button", { name: /^Icon/ });
    await expect(trigger).toContainText("Default icon");
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Choose an icon" });
    await expect(dialog).toBeVisible();
    // Focus lands in the search field, not on the first of thirty-four glyphs:
    // a keyboard user should be able to narrow before they navigate.
    await expect(
      dialog.getByRole("searchbox", { name: "Search icons" }),
    ).toBeFocused();

    // Staged, not live: picking does not save.
    await dialog.getByRole("button", { name: "Travel", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Travel", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toContainText("Travel");

    // THE ASSERTION THIS SPEC EXISTS FOR: a full reload, not a revalidation.
    // Anything held only in React state dies here.
    await page.reload();
    await expect(page.getByRole("button", { name: /^Icon/ })).toContainText(
      "Travel",
    );
    await expect(headerIcon(page)).toHaveAttribute("data-icon-key", "travel");

    // Reset to default, and prove THAT survives a reload too — clearing is a
    // real stored value (null), not merely the absence of a save.
    await page.getByRole("button", { name: /^Icon/ }).click();
    const reopened = page.getByRole("dialog", { name: "Choose an icon" });
    await reopened.getByRole("button", { name: "Use the default" }).click();
    await reopened.getByRole("button", { name: "Apply" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Icon/ })).toContainText(
      "Default icon",
    );
    await expect(headerIcon(page)).not.toHaveAttribute("data-icon-key", /./);
  });

  test("Cancel discards the staged choice and Escape restores focus", async ({
    page,
  }) => {
    await openSettingsTab(page, AREA_WITHOUT_ICON);
    const trigger = page.getByRole("button", { name: /^Icon/ });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Choose an icon" });
    await dialog.getByRole("button", { name: "Property", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Nothing was saved, and nothing is remembered: reopening starts from the
    // stored value, not from the discarded draft.
    await expect(trigger).toContainText("Default icon");
    await trigger.click();
    await expect(
      page
        .getByRole("dialog", { name: "Choose an icon" })
        .getByRole("button", { name: "Property", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    // Escape closes the topmost surface and returns focus to what opened it.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Choose an icon" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("search narrows the grid, and reports when nothing matches", async ({
    page,
  }) => {
    await openSettingsTab(page, PROJECT_WITHOUT_ICON);
    await page.getByRole("button", { name: /^Icon/ }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an icon" });
    const search = dialog.getByRole("searchbox", { name: "Search icons" });

    // A synonym the label does not contain — the reason `searchTerms` exists.
    await search.fill("car");
    await expect(
      dialog.getByRole("button", { name: "Vehicle", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Folder", exact: true }),
    ).toHaveCount(0);

    await search.fill("zzzznothing");
    await expect(dialog.getByText(/No icons match/)).toBeVisible();

    await page.keyboard.press("Escape");
  });
});

test.describe("ICON-03 — the picker meets the shared baseline", () => {
  test("is axe-clean and meets touch targets", async ({ page }) => {
    await openSettingsTab(page, AREA_WITHOUT_ICON);
    await page.getByRole("button", { name: /^Icon/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Choose an icon" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Travel", exact: true }),
    );
    await page.keyboard.press("Escape");
  });

  test("has no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openSettingsTab(page, AREA_WITHOUT_ICON);
    await page.getByRole("button", { name: /^Icon/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Choose an icon" }),
    ).toBeVisible();

    // The grid's `minmax(min(5.5rem, 100%), 1fr)` is what makes this pass: a
    // bare 5.5rem floor cannot shrink and pushes the sheet sideways.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
    await page.keyboard.press("Escape");
  });
});
