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

  test("is a single composite tab stop: Tab leaves it, Shift+Tab returns", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    const first = anytime.getByRole("link").first();
    await first.focus();
    await expect(first).toBeFocused();

    // Exactly one element inside the collection is tabbable.
    const tabbableCount = () =>
      page.evaluate(() => {
        const list = document.querySelector("[data-today-tasklist]");
        return list ? list.querySelectorAll('[tabindex="0"]').length : -1;
      });
    expect(await tabbableCount()).toBe(1);

    // Tab moves focus OUT of the collection (it never stops on a card's checkbox or
    // quick-action button), and Shift+Tab brings it back to the focused task.
    await page.keyboard.press("Tab");
    const insideAfterTab = await page.evaluate(() => {
      const list = document.querySelector("[data-today-tasklist]");
      return list ? list.contains(document.activeElement) : true;
    });
    expect(insideAfterTab).toBe(false);
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
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

  test("a task shortcut does not fire behind the keyboard-help Drawer", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    const firstLink = anytime.getByRole("link").first();
    const title = ((await firstLink.textContent()) ?? "").trim();
    await firstLink.focus();

    // Open the keyboard-help Drawer, then press the task shortcuts.
    await page.keyboard.press("Shift+?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await page.keyboard.press("c");
    await page.keyboard.press("p");
    await page.keyboard.press("Shift+P");

    // The stale task was NOT completed or replanned — no such feedback appears.
    await expect(page.getByText(/Task completed/i)).toHaveCount(0);
    await expect(page.getByText(/Plan updated|tasks planned/i)).toHaveCount(0);

    // Close the Drawer; the task is unchanged and still in its open section.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeHidden();
    await expect(anytime.getByRole("link", { name: title })).toBeVisible();
  });
});

test.describe("TODAY-05 — section navigation", () => {
  test("Go to Anytime establishes the first Anytime task as the roving target", async ({
    page,
  }) => {
    await openTodayList(page);
    await page.keyboard.press("Control+k");
    const input = palette(page);
    await input.fill("Go to Anytime");
    await expect(
      page.getByRole("option", { name: /Go to Anytime/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    // The first Anytime task is now the collection's single tab stop (roving target),
    // so tabbing into the collection lands there and arrow navigation continues from
    // Anytime — established as the navigation context, not the previous section.
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    await expect(anytime.getByRole("link").first()).toHaveAttribute(
      "tabindex",
      "0",
    );
    // It is the ONLY tab stop in the collection (a single composite widget).
    await expect(
      page.locator('[data-today-tasklist] [tabindex="0"]'),
    ).toHaveCount(1);
  });

  test("Go to Anytime survives palette close + focus restoration from a focused task", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });
    // Focus a NON-first Anytime task, then open the palette FROM it (its card becomes
    // the palette opener, the element focus is restored to on close).
    const opener = anytime.getByRole("link").nth(1);
    await opener.focus();
    await expect(opener).toBeFocused();

    await page.keyboard.press("Control+k");
    const input = palette(page);
    await input.fill("Go to Anytime");
    await expect(
      page.getByRole("option", { name: /Go to Anytime/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    // The palette closes automatically (a navigate command).
    await expect(input).toBeHidden();
    // Despite the palette restoring focus to its opener, the post-navigation effect
    // wins: the FIRST Anytime task is the roving target AND holds focus.
    const first = anytime.getByRole("link").first();
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(first).toBeFocused();

    // Arrow navigation continues from Anytime, not the originally-focused task.
    await page.keyboard.press("ArrowDown");
    await expect(anytime.getByRole("link").nth(1)).toBeFocused();
  });

  test("Go to Anytime from inside a task drawer closes the stack, cleans the URL, and Back reopens it", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });

    // Open a task drawer the real way: focus a task and activate it, so the Drawer
    // provider pushes its own history entry (the token Back/Forward relies on).
    const firstLink = anytime.getByRole("link").first();
    const title = ((await firstLink.textContent()) ?? "").trim();
    await firstLink.focus();
    await page.keyboard.press("Enter");
    const taskDialog = page.getByRole("dialog", { name: title });
    await expect(taskDialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=/);

    // Run "Go to Anytime" from INSIDE the open drawer.
    await page.keyboard.press("Control+k");
    const input = palette(page);
    await input.fill("Go to Anytime");
    await expect(
      page.getByRole("option", { name: /Go to Anytime/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    // Navigating closes the palette AND the whole drawer stack — no manual close.
    await expect(input).toBeHidden();
    await expect(page.getByRole("dialog")).toBeHidden();

    // The URL carries no drawer param (stack removed) and no lingering today-nav
    // (the post-navigation effect cleaned it via replace).
    await expect(page).not.toHaveURL(/drawer=/);
    await expect(page).not.toHaveURL(/today-nav=/);

    // Focus landed on the first Anytime task, which is the collection's ONLY tab stop.
    await expect(firstLink).toBeFocused();
    await expect(firstLink).toHaveAttribute("tabindex", "0");
    await expect(
      page.locator('[data-today-tasklist] [tabindex="0"]'),
    ).toHaveCount(1);

    // Back reopens the SAME task drawer (the provider's history entry was preserved).
    // The dialog is labelled by its title, and its chrome heading names the task — a
    // level-2 heading so it does not clash with the record's own content title.
    await page.goBack();
    const reopened = page.getByRole("dialog", { name: title });
    await expect(reopened).toBeVisible();
    await expect(
      reopened.getByRole("heading", { level: 2, name: title }),
    ).toBeVisible();
    await expect(page).toHaveURL(/drawer=/);

    // Forward returns to Today with the drawer closed and the heading present.
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });

  test("Go to Anytime from a STACKED drawer removes every drawer param and Back restores a drawer", async ({
    page,
  }) => {
    await openTodayList(page);
    const anytime = page.getByRole("list", { name: "Anytime tasks" });

    // Open a task drawer (provider push), then stack the keyboard-help drawer above it
    // (also a provider push) — the URL now carries TWO drawer params.
    const firstLink = anytime.getByRole("link").first();
    const title = ((await firstLink.textContent()) ?? "").trim();
    await firstLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();

    await page.keyboard.press("Shift+?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/drawer=.*drawer=/);

    // Run the section command from the top of the stack. Open the palette and wait for
    // it to take focus over the modal drawer, then activate the option by click (a
    // deterministic run that does not depend on the highlighted row).
    await page.keyboard.press("Control+k");
    const input = palette(page);
    await expect(input).toBeFocused();
    await input.fill("Go to Anytime");
    const option = page.getByRole("option", { name: /Go to Anytime/ });
    await expect(option).toBeVisible();
    await option.click();

    // The ENTIRE stack is gone — no drawer param survives — and the palette is closed.
    await expect(input).toBeHidden();
    await expect(page).not.toHaveURL(/drawer=/);
    await expect(page).not.toHaveURL(/today-nav=/);
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeHidden();
    await expect(page.getByRole("dialog", { name: title })).toBeHidden();

    // Back re-enters the drawer stack (its history entries were left intact).
    await page.goBack();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await expect(page).toHaveURL(/drawer=/);
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

  test("a lower task drawer does not own shortcuts when help is stacked above it", async ({
    page,
  }) => {
    // Open the task drawer and normalise it to unplanned + not completed.
    await gotoFixture(page, DRAWER_URL);
    const taskDialog = page.getByRole("dialog", { name: "Draft the proposal" });
    const planning = taskDialog.getByRole("group", { name: "Planning" });
    const clear = planning.getByRole("button", { name: "Clear" });
    if ((await clear.count()) > 0) {
      await clear.first().click();
      await expect(planning.getByText("Not planned")).toBeVisible();
    }
    const completion = taskDialog.getByRole("checkbox");
    await expect(completion).not.toBeChecked();

    // Stack the keyboard-help drawer ABOVE the task drawer (the task drawer stays
    // mounted but is no longer the interactive top).
    await page.keyboard.press("Shift+?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();

    // Press the task shortcuts: they must NOT reach the hidden task behind help.
    await page.keyboard.press("c");
    await page.keyboard.press("p");
    await page.keyboard.press("Shift+P");
    await expect(page.getByText(/Task completed/i)).toHaveCount(0);

    // Close help → the task drawer is the top again; it was left untouched.
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(planning.getByText("Not planned")).toBeVisible();
    await expect(completion).not.toBeChecked();

    // Now that it is top again, its shortcuts work: P plans it.
    await taskDialog.getByRole("button", { name: /close/i }).first().focus();
    await page.keyboard.press("p");
    await expect(planning.getByText("Not planned")).toHaveCount(0);

    // Restore test data.
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
