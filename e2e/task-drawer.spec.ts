import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-02 — the Task Drawer, driven end to end against the development-auth server
 * over real (seeded) D1. Role-based and non-brittle: it opens a real task from
 * Today, exercises the DS-03 URL/history contract, edits + saves + cancels through
 * DS-06 forms, completes + reopens, shows real relationships + activity, and holds
 * the accessibility + responsive baseline. It mutates only the dedicated
 * `t-drawer` task so the Today/Search journeys stay stable.
 */

const DRAWER_URL = "/today?drawer=task%3At-drawer";

test.describe("TODAY-02 — desktop", () => {
  test("opens a task from Today and updates the Drawer URL state", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("link", { name: "Draft the proposal" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
    // The open stack lives in the URL (DS-03).
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    // Real fields render.
    await expect(dialog.getByText("High")).toBeVisible();
    await expect(dialog.getByText("1 Aug 2026")).toBeVisible();
  });

  test("shows the real area relationship in the Links tab", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Links" }).click();
    const relationships = dialog.getByRole("region", { name: "Relationships" });
    await expect(relationships.getByText("DalyHub V2")).toBeVisible();
  });

  test("edits and saves, and the result persists after reload", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit details" }).click();

    const description = dialog.getByRole("textbox", { name: "Description" });
    await description.fill("Reviewed and ready to draft.");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    // Back in the read view, the saved description renders (through the shared
    // Markdown pipeline).
    await expect(
      dialog.getByText("Reviewed and ready to draft."),
    ).toBeVisible();

    // Persisted: a hard reload of the deep link shows the saved value.
    await gotoFixture(page, DRAWER_URL);
    await expect(
      page.getByRole("dialog").getByText("Reviewed and ready to draft."),
    ).toBeVisible();
  });

  test("cancels an edit without saving", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit details" }).click();
    const title = dialog.getByRole("textbox", { name: /Title/ });
    await title.fill("A discarded title");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // The read view returns and the discarded edit is not shown.
    await expect(
      dialog.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
    await expect(dialog.getByText("A discarded title")).toHaveCount(0);
  });

  test("completes and reopens the task", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    // Wait for the record body to load before toggling completion.
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
    const complete = dialog.getByRole("checkbox");
    // Normalise to a known open state first (another journey's real completion may
    // have left this task complete — completion is persistent and shared now).
    if (await complete.isChecked()) {
      await complete.uncheck();
      await expect(complete).not.toBeChecked();
    }
    // Complete, then reopen — reconciled with the persisted server result.
    await complete.check();
    await expect(complete).toBeChecked();
    await complete.uncheck();
    await expect(complete).not.toBeChecked();
  });

  test("records activity after a mutation", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    // Make a mutation so there is at least one event.
    await dialog.getByRole("button", { name: "Edit details" }).click();
    await dialog
      .getByRole("textbox", { name: "Description" })
      .fill("Activity check.");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByText("Activity check.")).toBeVisible();

    await dialog.getByRole("tab", { name: "Activity" }).click();
    // The shared Timeline (role=feed) renders the task's real activity.
    await expect(
      dialog.getByRole("feed", { name: "Task activity" }),
    ).toBeVisible();
    await expect(dialog.getByRole("article").first()).toBeVisible();
  });

  test("closes on Escape and restores focus to the opener", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const opener = page.getByRole("link", { name: "Draft the proposal" });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("Back closes the Drawer and Forward reopens it", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("link", { name: "Draft the proposal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("directly loading a valid task Drawer URL works", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
  });

  test("shows the calm not-found for an invalid task id", async ({ page }) => {
    await gotoFixture(page, "/today?drawer=task%3Amissing-task");
    await expect(page.getByText("We couldn't find that task")).toBeVisible();
  });

  test("has no horizontal overflow with the Drawer open", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("meets the 44px touch target on the completion control", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    // The completion control's touch target is its label (checkbox + text),
    // sized to the 44px token — not the bare native checkbox glyph.
    const control = page
      .getByRole("dialog")
      .locator("label.dh-task-drawer__completion");
    await expectMinTouchTarget(control);
  });
});

test.describe("TODAY-02 — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens as a full-height sheet with no horizontal overflow", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("TODAY-02 — accessibility (axe)", () => {
  test("passes axe with the Task Drawer open (light)", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe("dark", () => {
    test.use({ colorScheme: "dark" });
    test("passes axe with the Task Drawer open (dark)", async ({ page }) => {
      await gotoFixture(page, DRAWER_URL);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
});
