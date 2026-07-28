import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * DS-12 / PX-04 — "how do I remove this?" has ONE answer, driven end to end.
 *
 * The point of the consistency pass is that the answer does not depend on which
 * record you are looking at, so these run the SAME interaction against several
 * different entities: open the record's overflow (⋯), find lifecycle actions
 * worded from the one identity map, in the same slot, with friction scaled to
 * reversibility. It also covers, end to end, the capability that did not exist at
 * all before PX-04: removing a Goal, undoing it, and restoring it durably.
 */

async function openOverflow(page: Page) {
  const trigger = page.getByRole("button", { name: /^More actions for / });
  await trigger.first().click();
  await page.getByRole("menu").waitFor();
}

test.describe("the shared record overflow", () => {
  test("every record carries lifecycle actions in the same slot, worded the same way", async ({
    page,
  }) => {
    // A Project archives (its removal concept), and says so in the shared words.
    await gotoFixture(page, "/projects/pr-website");
    await openOverflow(page);
    await expect(
      page.getByRole("menuitem", { name: "Archive Project" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // An Area offers the same slot, with its own noun and the guarded delete.
    await gotoFixture(page, "/areas/a-dh");
    await openOverflow(page);
    await expect(
      page.getByRole("menuitem", { name: "Archive Area" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Delete Area permanently" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // A Goal — which had no removal path at all before PX-04 — offers the
    // reversible form, because its removal is undoable.
    await gotoFixture(page, "/goals/g-e2e-lifecycle");
    await openOverflow(page);
    await expect(
      page.getByRole("menuitem", { name: "Delete Goal" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("is keyboard-complete: open, navigate, and Escape back to the trigger", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");
    const trigger = page.getByRole("button", { name: /^More actions for / });
    await trigger.first().focus();
    await page.keyboard.press("ArrowDown");

    const menu = page.getByRole("menu");
    await menu.waitFor();
    await expect(page.getByRole("menuitem").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger.first()).toBeFocused();
    // Escape acted on the menu only — the record is still on screen.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("PX-04 — reversible removal, end to end", () => {
  test("a Goal can be deleted, undone, deleted again and restored from the Deleted view", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-e2e-lifecycle");
    const title = (
      await page.getByRole("heading", { level: 1 }).textContent()
    )?.trim();
    expect(title).toBeTruthy();

    await openOverflow(page);
    await page.getByRole("menuitem", { name: "Delete Goal" }).click();

    // It leaves for the collection, and the Undo toast is the immediate recovery.
    await expect(page).toHaveURL(/\/goals$/);
    const toasts = page.getByRole("region", { name: "Notifications" });
    await expect(toasts.getByText(`"${title}" deleted`)).toBeVisible();
    await toasts.getByRole("button", { name: /Undo/i }).click();
    await expect(toasts.getByText(`"${title}" restored`)).toBeVisible();

    // Delete again, and this time take the durable path back.
    await gotoFixture(page, "/goals/g-e2e-lifecycle");
    await openOverflow(page);
    await page.getByRole("menuitem", { name: "Delete Goal" }).click();
    await expect(page).toHaveURL(/\/goals$/);

    await page.getByRole("link", { name: "Deleted" }).click();
    await expect(page).toHaveURL(/state=deleted/);
    const row = page.getByRole("article").filter({ hasText: title! });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Restore" }).click();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText(`"${title}" restored`),
    ).toBeVisible();
  });
});
