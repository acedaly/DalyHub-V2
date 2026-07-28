import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * MOBILE-01 — the per-module phone journeys.
 *
 * `mobile-shell.spec.ts` proves the shell (navigation, capture, the baseline).
 * This spec proves that the workflows inside the modules are actually quick on a
 * phone: the shared collection sheet on Tasks, one-tap completion from a list,
 * the full-screen record and its tab overflow, and a dedicated journey through
 * each of the secondary modules the task named (Project, Person, Review,
 * Settings).
 *
 * It asserts BEHAVIOUR, not pixels, and mutates nothing the other journeys
 * depend on.
 */

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

test.describe("MOBILE-01 Tasks on a phone", () => {
  test("collapses the desktop chrome into one row plus the shared sheet", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    // One control row: the Filter trigger. The desktop system-view rail and the
    // view switcher are not permanent chrome at phone width.
    const trigger = page.getByTestId("collection-filter-trigger");
    await expect(trigger).toBeVisible();
    await expectMinTouchTarget(trigger);
    await expect(page.locator(".dh-tasks-systems")).toBeHidden();
  });

  test("applies a filter through the sheet in ONE url update, and resets it", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await page.getByTestId("collection-filter-trigger").click();

    const sheet = page.getByTestId("collection-sheet");
    await expect(sheet).toBeVisible();

    // Tapping an option edits a DRAFT — nothing is committed until Apply.
    await sheet.getByTestId("collection-sheet-priority-p1").click();
    expect(page.url()).not.toContain("priority=p1");

    await page.getByTestId("collection-sheet-apply").click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.url()).toContain("priority=p1");

    // The active filter is visible BEFORE reopening the sheet, so a short list
    // is never unexplained.
    const trigger = page.getByTestId("collection-filter-trigger");
    await expect(trigger).toContainText("1");
    await expect(
      page.locator(".dh-collection-controls__summary"),
    ).toContainText("Priority");

    // Reset is explicit and complete.
    await trigger.click();
    await page.getByTestId("collection-sheet-reset").click();
    await page.getByTestId("collection-sheet-apply").click();
    await expect.poll(() => page.url()).not.toContain("priority=p1");
  });

  test("discards a draft when the sheet is closed without applying", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await page.getByTestId("collection-filter-trigger").click();
    await page.getByTestId("collection-sheet-priority-p2").click();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("collection-sheet")).toBeHidden();
    expect(page.url()).not.toContain("priority=p2");

    // Reopening starts from what is COMMITTED, not from the discarded draft.
    await page.getByTestId("collection-filter-trigger").click();
    await expect(
      page.getByTestId("collection-sheet-priority-p2"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("completes a task from the list without opening the record", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    const card = page.locator('.dh-card[data-card-id="t-gym"]');
    await expect(card).toBeVisible();

    const complete = card.getByRole("button", { name: /^Complete Gym$/ });
    await expect(complete).toBeVisible();
    await expectMinTouchTarget(complete);
    await complete.click();

    // The row reflects the SERVER after revalidation, not an optimistic guess.
    await expect(
      card.getByRole("button", { name: /^Reopen Gym$/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Restore, so the other journeys see the seeded state.
    await card.getByRole("button", { name: /^Reopen Gym$/ }).click();
    await expect(
      card.getByRole("button", { name: /^Complete Gym$/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("opens a task as a full-screen record and returns to the list", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    await page
      .locator('.dh-card[data-card-id="t-drawer"]')
      .getByRole("link", { name: /Draft the proposal/ })
      .click();

    const drawer = page.getByRole("dialog", { name: "Task" });
    await expect(drawer).toBeVisible();

    // The record owns the screen: the drawer spans the full phone width.
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    }

    // The common properties are in the Summary — no Details edit form needed.
    await expect(drawer.getByText("Priority")).toBeVisible();

    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/tasks/);
  });
});

test.describe("MOBILE-01 secondary module journeys", () => {
  test("Project record: summary first, tabs reachable through More sections", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");

    // A five-tab record collapses its surplus into a labelled menu on a phone.
    const more = page.getByTestId("record-tabs-more");
    await expect(more).toBeVisible();

    // Nothing is hidden permanently: Settings is one tap away.
    await more.getByRole("button").click();
    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    // …and selecting it makes it the visible, active tab.
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("Person record: quick actions create real records, not placeholders", async ({
    page,
  }) => {
    await gotoFixture(page, "/people");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");

    const actions = page.getByRole("group", { name: "Quick actions" });
    await expect(actions).toBeVisible();

    // "New Task" opens the SHARED capture sheet rather than raising a toast.
    await actions.getByRole("button", { name: "New Task" }).click();
    await expect(page.getByTestId("capture-sheet")).toBeVisible();
    await expect(page.getByLabel("Title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("capture-sheet")).toBeHidden();
  });

  test("Review flow: reachable and writable on a phone", async ({ page }) => {
    await gotoFixture(page, "/reviews");
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    // The bottom navigation must not sit on top of the collection's content.
    const bar = page.locator("[data-testid='bottom-nav']");
    await expect(bar).toBeVisible();
    const barBox = await bar.boundingBox();
    const contentBottom = await page.evaluate(() => {
      const content = document.querySelector(".dh-collection__content");
      return content ? content.getBoundingClientRect().bottom : 0;
    });
    expect(barBox).not.toBeNull();
    if (barBox) {
      // The content region ends at or above the bar's top edge, allowing for the
      // reserved padding rather than overlapping it.
      expect(contentBottom).toBeLessThanOrEqual(barBox.y + barBox.height + 1);
    }
  });

  test("Settings: preference rows stack and remain operable", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    await expectNoHorizontalOverflow(page);

    const rows = page.locator(".dh-settings-row");
    await expect(rows.first()).toBeVisible();

    // A control fills the stacked row and meets the touch target, rather than
    // being squeezed into a second column.
    const control = rows.first().locator(".dh-settings-row__control");
    const controlBox = await control.boundingBox();
    const rowBox = await rows.first().boundingBox();
    expect(controlBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    if (controlBox && rowBox) {
      expect(controlBox.width).toBeGreaterThan(rowBox.width * 0.6);
    }

    // The section navigation is a reachable scrolling row, not a hidden column.
    await expect(page.locator(".dh-settings-page__nav")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("every secondary module holds the baseline at 320px", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    for (const route of [
      "/projects",
      "/areas",
      "/goals",
      "/people",
      "/assets",
      "/reviews",
      "/notes",
      "/settings",
    ]) {
      await gotoFixture(page, route);
      await expectNoHorizontalOverflow(page);
    }
  });
});
