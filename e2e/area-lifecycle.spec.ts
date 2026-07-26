import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * AREA-05 — the Area archive & safe-deletion lifecycle, driven end to end against
 * the development-auth server over real (seeded) D1. Proves the two distinct
 * lifecycle actions are wired to the trusted repository/route boundary:
 *
 *   1. Archive an Area and confirm it leaves the active collection; open it
 *      directly and restore it.
 *   2. Attempt deletion with child records and see the grouped blockers (no
 *      delete affordance — no bypass).
 *   3. Delete a genuinely empty Area behind an exact-title confirmation, and land
 *      back on `/areas`.
 *   4. Cancel a deletion and confirm focus returns to the exact Delete opener.
 *   5. Verify the Settings surface holds no 320px overflow and meets touch-target
 *      minimums on a phone.
 *   6. Verify Back/Forward behaviour around archive/restore.
 *
 * Mutates only the dedicated `a-e2e-*` Areas; their state is reset in
 * `seed-tasks.sql` before every run. Semantic locators only — no `.first()` /
 * `.nth()` / arbitrary waits.
 */

test.describe("AREA-05 — Area archive & safe deletion", () => {
  test("archives an Area out of the active collection, then restores it directly", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-e2e-archive");
    await expect(
      page.getByRole("heading", { name: "Archive Lifecycle Area" }),
    ).toBeVisible();

    // Archive from the lifecycle Settings tab.
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Archive area…" }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this Area?",
    });
    await expect(archiveDialog).toBeVisible();
    await archiveDialog.getByRole("button", { name: "Archive area" }).click();
    await expect(
      page.getByRole("group", { name: "Area archived" }),
    ).toBeVisible();

    // The record now labels itself archived (text, not colour alone).
    await expect(page.getByText("This Area is archived.")).toBeVisible();

    // It has left the active Areas collection…
    await gotoFixture(page, "/areas");
    await expect(
      page.getByRole("link", { name: /Archive Lifecycle Area/ }),
    ).toHaveCount(0);

    // …but stays readable directly by its canonical URL.
    await gotoFixture(page, "/areas/a-e2e-archive");
    await expect(
      page.getByRole("heading", { name: "Archive Lifecycle Area" }),
    ).toBeVisible();

    // Restore it.
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Restore area…" }).click();
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this Area?",
    });
    await restoreDialog.getByRole("button", { name: "Restore area" }).click();
    await expect(
      page.getByRole("group", { name: "Area restored" }),
    ).toBeVisible();

    // It is back in the active collection.
    await gotoFixture(page, "/areas");
    await expect(
      page.getByRole("link", { name: /Archive Lifecycle Area/ }),
    ).toBeVisible();
  });

  test("blocks permanent deletion of an Area with children and lists the grouped blockers", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-e2e-blocked");
    await page.getByRole("tab", { name: "Settings" }).click();

    // The danger section explains the block and offers NO delete button.
    await expect(page.getByText(/still contains records/)).toBeVisible();
    await expect(page.getByRole("link", { name: /1 Goal/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete area…" }),
    ).toHaveCount(0);
  });

  test("permanently deletes an empty Area behind an exact-title confirmation", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-e2e-empty");
    await page.getByRole("tab", { name: "Settings" }).click();

    await page.getByRole("button", { name: "Delete area…" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Delete this Area permanently?",
    });
    await expect(dialog).toBeVisible();

    const confirm = dialog.getByRole("button", {
      name: "Delete area permanently",
    });
    await expect(confirm).toBeDisabled();

    // The exact Area title unlocks the confirmation.
    await dialog.getByRole("textbox").fill("Empty Delete Area");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Success feedback, and a redirect back to the collection.
    await expect(
      page.getByRole("group", { name: "Area deleted" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/areas$/);
    await expect(
      page.getByRole("link", { name: /Empty Delete Area/ }),
    ).toHaveCount(0);
  });

  test("cancelling a deletion restores focus to the exact Delete opener", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-e2e-cancel");
    await page.getByRole("tab", { name: "Settings" }).click();

    const opener = page.getByRole("button", { name: "Delete area…" });
    await opener.click();
    const dialog = page.getByRole("dialog", {
      name: "Delete this Area permanently?",
    });
    await expect(dialog).toBeVisible();

    // Escape cancels and returns focus to the exact opener.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // The Area was not deleted.
    await gotoFixture(page, "/areas");
    await expect(
      page.getByRole("link", { name: /Cancel Delete Area/ }),
    ).toBeVisible();
  });

  test("holds no 320px overflow and meets touch targets on the lifecycle Settings tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoFixture(page, "/areas/a-e2e-blocked");
    const settingsTab = page.getByRole("tab", { name: "Settings" });
    await expectMinTouchTarget(settingsTab);
    await settingsTab.click();
    await expect(
      page.getByRole("region", { name: "Area settings" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("supports Back and Forward around archive and restore", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-e2e-archive");
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Archive area…" }).click();
    await page
      .getByRole("dialog", { name: "Archive this Area?" })
      .getByRole("button", { name: "Archive area" })
      .click();
    await expect(
      page.getByRole("group", { name: "Area archived" }),
    ).toBeVisible();

    // Navigate away to the collection, then Back to the archived record, then
    // Forward again — the record stays readable and correctly labelled.
    await gotoFixture(page, "/areas");
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Archive Lifecycle Area" }),
    ).toBeVisible();
    await expect(page.getByText("This Area is archived.")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/areas$/);

    // Restore so the fixture is left active for a re-run within the same DB.
    await gotoFixture(page, "/areas/a-e2e-archive");
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Restore area…" }).click();
    await page
      .getByRole("dialog", { name: "Restore this Area?" })
      .getByRole("button", { name: "Restore area" })
      .click();
    await expect(
      page.getByRole("group", { name: "Area restored" }),
    ).toBeVisible();
  });
});
