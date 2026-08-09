/**
 * Shell cleanup — the global capture control is the one authority for routine
 * creation, and the page-level duplicates of it are gone.
 *
 * The rule the whole suite below encodes is a single question asked of every
 * create button in the product:
 *
 *   does this action supply CONTEXT the global capture control cannot, or create
 *   the page's OWN primary entity — or is it simply a second door onto the same
 *   room?
 *
 * Only the second kind was removed. That is why this file asserts absence and
 * presence in the same breath: a spec that only proved buttons were gone would
 * pass just as happily if creation had been broken.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  globalCaptureControl,
  expectNoHorizontalOverflow,
  gotoFixture,
  todayDayPanel,
} from "./helpers";

/** The global capture control — the floating action button in the app shell. */
function captureControl(page: Page) {
  return globalCaptureControl(page);
}

/** The pane header of the current collection, where a duplicate used to live. */
function paneHeader(page: Page) {
  return page.locator(".dh-pane-header").first();
}

test.describe("the global capture control", () => {
  test("is available throughout the authenticated shell, with a name and a target", async ({
    page,
  }) => {
    for (const path of [
      "/today",
      "/tasks",
      "/notes",
      "/meetings",
      "/settings",
    ]) {
      await gotoFixture(page, path);
      const fab = captureControl(page);
      await expect(fab).toBeVisible();
      await expect(fab).toHaveAccessibleName(/capture/i);
      await expectMinTouchTarget(fab);
    }
  });

  test("opens by KEYBOARD, offers one entry per type, and has no duplicates", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const fab = captureControl(page);
    await fab.focus();
    await expect(fab).toBeFocused();
    await page.keyboard.press("Enter");

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();

    // It may open on the type remembered for the session; return to the chooser.
    const changeType = sheet.getByTestId("capture-change-type");
    if (await changeType.isVisible()) {
      await changeType.click();
    }

    // Exactly the four routine record types plus Asset (ASSET-03), once each.
    for (const type of ["task", "note", "meeting", "diary", "asset"]) {
      await expect(sheet.getByTestId(`capture-choose-${type}`)).toHaveCount(1);
    }
    await expect(
      sheet.getByRole("group", { name: "Capture type" }).getByRole("button"),
    ).toHaveCount(5);
  });

  test("opens a creation flow, and returns focus to the trigger on Escape", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const fab = captureControl(page);
    await fab.focus();
    await page.keyboard.press("Enter");

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();
    const changeType = sheet.getByTestId("capture-change-type");
    if (await changeType.isVisible()) {
      await changeType.click();
    }
    await sheet.getByTestId("capture-choose-task").click();

    // Focus lands INSIDE the opened creation surface, on the first field.
    await expect(sheet.getByLabel("Title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // ...and comes back to the control that opened it.
    await expect(fab).toBeFocused();
  });

  /**
   * CAPTURE-02 — at phone widths the button is not "above the bar", it is GONE.
   *
   * This assertion used to prove the floating button cleared the navigation bar
   * beneath it, which was the best that could be said while both existed. The
   * two were still the same global action twice, a thumb's width apart, in the
   * same corner (DEBT-96). The bar's Capture slot now owns it outright, and the
   * full compact-width contract — one affordance, still opening the same flow —
   * lives in `global-capture.spec.ts`.
   */
  test("is not shown at 320px, where the bottom bar owns Capture", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/today");

    await expect(captureControl(page)).toBeHidden();
    await expect(
      page.locator("[data-testid='bottom-nav']").getByRole("button", {
        name: "Capture",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("removed duplicates — the page header no longer repeats capture", () => {
  test("Today has no pane-header Quick capture button", async ({ page }) => {
    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("button", { name: "Quick capture", exact: true }),
    ).toHaveCount(0);
    // The Today redesign went further than removing the header duplicate: the
    // screen's own capture WIDGET is gone too, so the global control is the only
    // way to capture from here. That is the same rule this file exists to hold —
    // one authority for routine creation — reaching its conclusion, so the
    // assertion is that nothing capture-shaped survives on the page rather than
    // that the widget the button used to focus is still there.
    await expect(page.getByTestId("today-capture-task")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Capture" })).toBeVisible();
  });

  test("Tasks has no header New task, and keeps Review Inbox", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await expect(
      paneHeader(page).getByRole("button", { name: /New task/ }),
    ).toHaveCount(0);
    await expect(
      paneHeader(page).getByRole("link", { name: /New task/ }),
    ).toHaveCount(0);
    // Review Inbox is not a creation control — it is the way into triage, and
    // nothing in the capture menu does it.
    await expect(
      paneHeader(page).getByRole("link", { name: "Review Inbox" }),
    ).toBeVisible();
    // The header did not collapse or leave a gap behind it.
    await expect(
      paneHeader(page).getByRole("heading", { name: "Tasks" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Notes has no header New Note", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await expect(
      paneHeader(page).getByRole("button", { name: /New Note/ }),
    ).toHaveCount(0);
    await expect(
      paneHeader(page).getByRole("heading", { name: "Notes" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Meetings has no header New meeting", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await expect(
      paneHeader(page).getByRole("link", { name: /New meeting/ }),
    ).toHaveCount(0);
    await expect(
      paneHeader(page).getByRole("heading", { name: "Meetings" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the removed headers stay balanced at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    for (const path of ["/tasks", "/notes", "/meetings"]) {
      await gotoFixture(page, path);
      await expect(paneHeader(page)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    // Today is not in that list because it has no pane header at all any more:
    // the redesign made the greeting block the page's own header. Its equivalent
    // is asserted on its own terms, so the width check still covers the screen.
    await gotoFixture(page, "/today");
    await expect(todayDayPanel(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("retained creation — contextual and primary-entity actions stay", () => {
  test("Areas keeps New Area — the page's own primary entity", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas");
    await expect(
      page.getByRole("link", { name: "New Area" }).first(),
    ).toBeVisible();
  });

  test("Projects keeps New Project — the page's own primary entity", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await expect(
      page.getByRole("link", { name: "New Project" }).first(),
    ).toBeVisible();
  });

  test("People keeps New Person — an entity the capture menu does not offer", async ({
    page,
  }) => {
    await gotoFixture(page, "/people");
    await expect(
      page.getByRole("link", { name: "New Person" }).first(),
    ).toBeVisible();
  });

  test("Diary keeps New Diary entry — it captures on the day being VIEWED", async ({
    page,
  }) => {
    // The one create button in this sweep that looks like a duplicate and is not:
    // it backdates to the selected day, which the global capture deliberately
    // does not do.
    await gotoFixture(page, "/diary");
    await expect(
      page.getByRole("button", { name: "New Diary entry" }).first(),
    ).toBeVisible();
  });

  test("an EMPTY collection still teaches the next action", async ({
    page,
  }) => {
    // Removing a header button must never produce a dead end. A filtered-to-empty
    // Notes list is the cheapest way to reach an empty collection deterministically
    // without mutating the seeded workspace.
    await gotoFixture(page, "/notes?q=zzz-no-such-note-zzz");
    const empty = page.locator(".dh-empty-state").first();
    await expect(empty).toBeVisible();
  });
});
