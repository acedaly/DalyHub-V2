import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-05 — the keyboard workflow, driven end to end against the development-auth
 * server over real (seeded) D1. It proves Today is operable without a mouse:
 * navigate via the Command Palette, rove the task collection with the arrow keys,
 * open/close a task, the shortcut/typing boundary, planning by shortcut, the
 * keyboard-help reference, and the accessibility + responsive baseline with the new
 * overlay states. Mutations touch only the `t-drawer` task (which the seed resets on
 * each server start) and restore it, so the shared journeys stay stable.
 */

const DRAWER_URL = "/today?drawer=task%3At-drawer";

function palette(page: Page) {
  return page.getByRole("combobox", { name: "Search commands and records" });
}

async function openTodayList(page: Page) {
  await gotoFixture(page, "/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
}

test.describe("TODAY-05 — keyboard navigation", () => {
  test("opens Today through the Command Palette", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = palette(page);
    await expect(input).toBeFocused();
    await input.fill("Go to Today");
    const option = page.getByRole("option", { name: /Go to Today/ });
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/today$/);
  });

  test("roves the task collection with the arrow keys", async ({ page }) => {
    await openTodayList(page);
    // The open task collection is ONE tab stop; focus its first task.
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    const first = anytime.getByRole("link").first();
    await first.focus();
    await expect(first).toBeFocused();

    // Arrow Down moves focus to the next task; Arrow Up returns.
    const activeText = () =>
      page.evaluate(() => document.activeElement?.textContent ?? "");
    const firstText = await activeText();
    await page.keyboard.press("ArrowDown");
    await expect.poll(activeText).not.toBe(firstText);
    await page.keyboard.press("ArrowUp");
    await expect.poll(activeText).toBe(firstText);
  });

  test("opens a task with Enter and closes it with Escape, restoring focus", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    const first = anytime.getByRole("link").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Focus returns to the originating task card.
    await expect(first).toBeFocused();
  });

  test("Back closes the Drawer and Forward reopens it", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("TODAY-05 — shortcut boundary", () => {
  test("single-key shortcuts do not fire while typing in a field", async ({
    page,
  }) => {
    await openTodayList(page);
    const capture = page.getByPlaceholder("What needs your attention?");
    await capture.click();
    await capture.type("prep");
    // 'p' and other letters are typed, not swallowed as a plan/complete shortcut,
    // and no Drawer/help overlay opened.
    await expect(capture).toHaveValue("prep");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("TODAY-05 — planning by shortcut", () => {
  test("P plans the open task and Clear restores it", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const planning = dialog.getByRole("group", { name: "Planning" });

    // Normalise to unplanned first.
    const clear = planning.getByRole("button", { name: "Clear" });
    if ((await clear.count()) > 0) {
      await clear.first().click();
      await expect(planning.getByText("Not planned")).toBeVisible();
    }

    // Focus the dialog's close button (not a text field), then press P.
    await dialog.getByRole("button", { name: /close/i }).first().focus();
    await page.keyboard.press("p");
    // The plan is saved: the "Not planned" state is gone and Clear is offered.
    await expect(planning.getByText("Not planned")).toHaveCount(0);
    await expect(planning.getByRole("button", { name: "Clear" })).toBeVisible();

    // Restore: clear the plan so the shared journeys stay stable.
    await planning.getByRole("button", { name: "Clear" }).click();
    await expect(planning.getByText("Not planned")).toBeVisible();
  });
});

test.describe("TODAY-05 — keyboard help & Waiting", () => {
  test("shows the keyboard reference via ?", async ({ page }) => {
    await openTodayList(page);
    await page.locator("body").click();
    await page.keyboard.press("Shift+?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/fully operable from the keyboard/i),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("opens Waiting through the Command Palette", async ({ page }) => {
    await openTodayList(page);
    await page.keyboard.press("Control+k");
    const input = palette(page);
    await input.fill("Open Waiting");
    await expect(
      page.getByRole("option", { name: /Open Waiting/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/today\/waiting$/);
  });
});

test.describe("TODAY-05 — accessibility & responsive", () => {
  test("holds the baseline with the keyboard-help drawer open", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      `/today?drawer=${encodeURIComponent("help:shortcuts")}`,
    );
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("no horizontal overflow at 320px and 2560px on Today", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openTodayList(page);
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expectNoHorizontalOverflow(page);
  });
});
