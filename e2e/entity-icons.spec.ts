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
 *
 * ── The control is the IDENTITY picker (HARDEN-05) ──────────────────────────
 * IDENTITY-01 replaced the icon-only control with `EntityIdentityPicker`, which
 * chooses a COLOUR and an icon together — "there is no `AreaIdentityPicker` and
 * no `ProjectIdentityPicker`, because there is one identity", in its own words.
 * So the trigger is named "Identity" and reads "Default icon, Automatic", the
 * sheet is "Choose an identity", and resetting is "Use the defaults" (plural:
 * it clears both halves). Every assertion below is the same claim about the
 * same stored choice, made against the control that ships — the icon half is
 * still what is chosen, saved, reloaded and reset.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  gotoFixture,
} from "./helpers";
import { d1Execute } from "./d1";

const AREA_WITH_ICON = "/areas/a-health";
const AREA_WITHOUT_ICON = "/areas/a-dh";
const PROJECT_WITH_ICON = "/projects/pr-website";
const PROJECT_WITHOUT_ICON = "/projects/pr-launch";

const WORKSPACE_ID = "local-dev-workspace";

/**
 * ESTABLISH the "no identity yet" precondition rather than assume it (DEBT-173).
 *
 * `a-dh` is a SHARED seeded Area, and this file's `AREA_WITHOUT_ICON` claim is a
 * claim about it. `identity.spec.ts` chooses an identity for the same Area — it
 * restores it at the end, but a test that fails before its cleanup leaves the
 * icon behind for good, and the two files are nine partitions apart. That is
 * exactly how this file went red on `Received "heart"` and
 * `Received "Wellbeing, Emerald"` on a re-derived split, with nothing about the
 * product changed: one record, two beliefs, and whichever spec ran first won.
 *
 * A precondition a spec owns is a precondition a spec sets. This heals whatever
 * the last run left, before anything is asserted, and it is idempotent — the
 * same shape `identity.spec.ts:268` adopted for its own Goal.
 */
function clearSharedAreaIdentity(): void {
  d1Execute(
    `UPDATE area_details SET icon_key = NULL, colour_slot = NULL ` +
      `WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id = 'a-dh';`,
  );
}

/** The record header's icon element, whatever glyph it currently resolves to. */
function headerIcon(page: Page) {
  return page.locator(".record-type__icon .dh-entity-icon").first();
}

async function openSettingsTab(page: Page, path: string) {
  await gotoFixture(page, `${path}?tab=settings`);
  await expect(page.getByRole("region", { name: "Appearance" })).toBeVisible();
}

/*
 * Before every test, and after the file, `a-dh` carries no identity. Both ends
 * matter: the first heals whatever a previous run or a sibling spec left, and
 * the second leaves the shared workspace as this file found it.
 */
test.beforeEach(() => clearSharedAreaIdentity());
test.afterAll(() => clearSharedAreaIdentity());

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

    const trigger = page.getByRole("button", { name: /^Identity/ });
    await expect(trigger).toContainText("Default icon");
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Choose an identity" });
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
    await expect(page.getByRole("button", { name: /^Identity/ })).toContainText(
      "Travel",
    );
    await expect(headerIcon(page)).toHaveAttribute("data-icon-key", "travel");

    // Reset to default, and prove THAT survives a reload too — clearing is a
    // real stored value (null), not merely the absence of a save.
    await page.getByRole("button", { name: /^Identity/ }).click();
    const reopened = page.getByRole("dialog", { name: "Choose an identity" });
    await reopened.getByRole("button", { name: "Use the defaults" }).click();
    await reopened.getByRole("button", { name: "Apply" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Identity/ })).toContainText(
      "Default icon",
    );
    await expect(headerIcon(page)).not.toHaveAttribute("data-icon-key", /./);
  });

  test("Cancel discards the staged choice and Escape restores focus", async ({
    page,
  }) => {
    await openSettingsTab(page, AREA_WITHOUT_ICON);
    const trigger = page.getByRole("button", { name: /^Identity/ });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Choose an identity" });
    await dialog.getByRole("button", { name: "Property", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Nothing was saved, and nothing is remembered: reopening starts from the
    // stored value, not from the discarded draft.
    await expect(trigger).toContainText("Default icon");
    await trigger.click();
    await expect(
      page
        .getByRole("dialog", { name: "Choose an identity" })
        .getByRole("button", { name: "Property", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    // Escape closes the topmost surface and returns focus to what opened it.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Choose an identity" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("search narrows the grid, and reports when nothing matches", async ({
    page,
  }) => {
    await openSettingsTab(page, PROJECT_WITHOUT_ICON);
    await page.getByRole("button", { name: /^Identity/ }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an identity" });
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
    await page.getByRole("button", { name: /^Identity/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Choose an identity" }),
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
    await page.getByRole("button", { name: /^Identity/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Choose an identity" }),
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
