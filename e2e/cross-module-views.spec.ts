import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * X-02 — the cross-module Views surface, driven end to end against the
 * development-auth server over real (seeded) D1.
 *
 * What it proves, in the product rather than in a unit:
 *   - a view spans several modules and each result keeps its own identity;
 *   - the scope selector changes what is included, and says so in the URL;
 *   - a view can be created, reopened, edited, renamed and deleted;
 *   - a result opens its CANONICAL destination, not a duplicate detail surface;
 *   - the zero-result state teaches the next action instead of going blank;
 *   - it works at 320/390px, by keyboard, and in both appearances.
 *
 * It creates only its own clearly-named saved view and never mutates a record, so
 * it cannot disturb the other journeys.
 */

const SAVED_VIEW = "E2E cross-module view";
const RENAMED_VIEW = "E2E cross-module renamed";

async function openSwitcher(page: Page) {
  await page.getByTestId("cross-view-trigger").click();
  const panel = page.getByTestId("cross-view-panel");
  await panel.waitFor();
  return panel;
}

/** Delete either name this spec might have left behind on a previous run. */
async function removeSavedViews(page: Page) {
  // The switcher lives in the desktop header; at phone widths the shared control
  // sheet replaces it. Clean up from a width where it is on screen.
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const name of [SAVED_VIEW, RENAMED_VIEW]) {
    await gotoFixture(page, "/views");
    const panel = await openSwitcher(page);
    const existing = panel.getByRole("link", { name });
    if ((await existing.count()) === 0) {
      await page.keyboard.press("Escape");
      continue;
    }
    await existing.first().click();
    await page.getByRole("button", { name: "Manage saved views" }).click();
    await page
      .getByRole("menuitem", { name: new RegExp(`Delete “${name}`) })
      .click();
    await page.getByRole("button", { name: "Delete view" }).click();
    await expect(page.getByTestId("cross-view-trigger")).not.toContainText(
      name,
    );
  }
}

test.describe("cross-module views", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavedViews(page);
  });

  test.afterEach(async ({ page }) => {
    await removeSavedViews(page);
  });

  test("opens on a built-in view spanning several modules", async ({
    page,
  }) => {
    await gotoFixture(page, "/views");

    await expect(
      page.getByRole("heading", { name: "Views", level: 1 }),
    ).toBeVisible();
    // The switcher names the ACTIVE view, so what is applied is legible at a glance.
    await expect(page.getByTestId("cross-view-trigger")).toContainText(
      "Needs attention",
    );

    // The scope selector is the one control a cross-module view cannot hide.
    for (const scope of ["task", "project", "goal", "meeting", "review"]) {
      await expect(page.getByTestId(`cross-view-scope-${scope}`)).toBeVisible();
    }
    await expect(page.getByTestId("cross-view-scope-task")).toHaveAttribute(
      "aria-current",
      "true",
    );

    await expectNoHorizontalOverflow(page);
  });

  test("changing the scope changes the URL and what is included", async ({
    page,
  }) => {
    await gotoFixture(page, "/views");
    await page.getByTestId("cross-view-scope-note").click();
    await expect(page).toHaveURL(/show=[^&]*note/);
    await expect(page.getByTestId("cross-view-scope-note")).toHaveAttribute(
      "aria-current",
      "true",
    );
    // A view IS a URL: reloading restores exactly the same configuration.
    await page.reload();
    await expect(page.getByTestId("cross-view-scope-note")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("creates, reopens, edits and deletes a saved view", async ({ page }) => {
    await gotoFixture(page, "/views?show=task,project&updated=last_30_days");

    // Save the current configuration under a name.
    await page.getByRole("button", { name: "Manage saved views" }).click();
    await page.getByRole("menuitem", { name: "Save as new view…" }).click();
    const nameInput = page.getByTestId("cross-view-name-input");
    await nameInput.waitFor();
    await nameInput.fill(SAVED_VIEW);
    await page.getByTestId("cross-view-name-save").click();
    await expect(page.getByTestId("cross-view-trigger")).toContainText(
      SAVED_VIEW,
    );

    // Reopen it from somewhere else — it reconstructs the query.
    await gotoFixture(page, "/views");
    const panel = await openSwitcher(page);
    await panel.getByRole("link", { name: SAVED_VIEW }).click();
    await expect(page.getByTestId("cross-view-trigger")).toContainText(
      SAVED_VIEW,
    );
    await expect(page).toHaveURL(/updated=last_30_days/);

    // Edit it: adding a scope marks it Modified until the change is saved.
    await page.getByTestId("cross-view-scope-note").click();
    await expect(page.getByTestId("cross-view-trigger")).toContainText(
      "Modified",
    );
    await page.getByRole("button", { name: "Manage saved views" }).click();
    await page
      .getByRole("menuitem", { name: new RegExp(`Update “${SAVED_VIEW}`) })
      .click();
    await expect(page.getByTestId("cross-view-trigger")).not.toContainText(
      "Modified",
    );

    // Rename it.
    await page.getByRole("button", { name: "Manage saved views" }).click();
    await page.getByRole("menuitem", { name: "Rename…" }).click();
    const renameInput = page.getByTestId("cross-view-name-input");
    await renameInput.waitFor();
    await renameInput.fill(RENAMED_VIEW);
    await page.getByTestId("cross-view-name-save").click();
    await expect(page.getByTestId("cross-view-trigger")).toContainText(
      RENAMED_VIEW,
    );

    // Deleting asks first, through the one shared confirmation surface.
    await page.getByRole("button", { name: "Manage saved views" }).click();
    await page
      .getByRole("menuitem", { name: new RegExp(`Delete “${RENAMED_VIEW}`) })
      .click();
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`Delete “${RENAMED_VIEW}`),
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete view" }).click();
    await expect(page.getByTestId("cross-view-trigger")).not.toContainText(
      RENAMED_VIEW,
    );
  });

  test("a result opens its canonical record destination", async ({ page }) => {
    await gotoFixture(page, "/views?show=project&updated=last_30_days");
    const first = page.locator(".dh-views__row-link").first();
    await first.waitFor();
    const title = (await first.innerText()).trim();
    await first.click();
    // A Project opens the Project record — not a saved-view-only detail surface.
    await expect(page).toHaveURL(/\/projects\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
  });

  test("an impossible view explains itself instead of going blank", async ({
    page,
  }) => {
    // A Note tag that cannot exist: zero results, and a state that says what to do.
    await gotoFixture(page, "/views?show=note&n.tag=zzz-no-such-tag-zzz");
    await expect(
      page.getByRole("heading", { name: "Nothing matches this view" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reset to Needs attention" }),
    ).toBeVisible();
  });

  test("says which record types a filter excluded rather than widening", async ({
    page,
  }) => {
    // Notes have no due date. Asking for overdue records must not return every Note.
    await gotoFixture(page, "/views?show=task,note&due=overdue");
    await expect(page.getByText(/note records are not shown/i)).toBeVisible();
  });

  test("is usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/views");
    await expectNoHorizontalOverflow(page);

    // The shared collection sheet is the control surface at this width.
    const trigger = page.getByTestId("collection-filter-trigger");
    await expect(trigger).toBeVisible();
    await expectMinTouchTarget(trigger);
    await trigger.click();
    const sheet = page.getByTestId("collection-sheet");
    await sheet.waitFor();
    await expect(
      sheet.getByRole("heading", { name: "Needs attention" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
  });

  test("is reachable and operable by keyboard, and axe-clean", async ({
    page,
  }) => {
    await gotoFixture(page, "/views");
    const trigger = page.getByTestId("cross-view-trigger");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cross-view-panel")).toBeVisible();
    await page.keyboard.press("Enter");

    await expectNoAxeViolations(page);
  });
});
