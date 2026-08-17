import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  globalCaptureControl,
  gotoFixture,
} from "./helpers";

/**
 * The keyboard workflow around Today, driven end to end against the
 * development-auth server over real (seeded) D1.
 *
 * ── What this file used to cover, and why it is smaller ──────────────────────
 * It used to prove a roving multi-select collection: arrow keys across the
 * planning sections, one composite tab stop, Space to select, "Go to <section>"
 * commands carrying a `today-nav` param through the drawer stack. The Today
 * redesign replaced that collection with plain rows — a checkbox completes, a
 * title opens the record — so the native tab order and the browser's own
 * checkbox and link semantics are now the whole story, and there is nothing
 * bespoke left to assert.
 *
 * What survives is what still exists: the palette route onto Today, the
 * shortcut/typing boundary, the per-task shortcuts an OPEN task record owns
 * (including the ownership rule when help is stacked above it), the keyboard
 * reference, and the accessibility + responsive baseline. Mutations touch only
 * the `t-drawer` task (which the seed resets on each server start) and restore
 * it, so the shared journeys stay stable.
 */

const DRAWER_URL = "/today?drawer=task%3At-drawer";

function palette(page: Page) {
  return page.getByRole("combobox", { name: "Search commands and records" });
}

function feedbackLive(page: Page) {
  return page.locator(".dh-feedback-live");
}

async function openToday(page: Page) {
  await gotoFixture(page, "/today");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^Good (morning|afternoon|evening)/,
    }),
  ).toBeVisible();
}

test.describe("reaching Today from the keyboard", () => {
  test("opens Today through the Command Palette", async ({ page }) => {
    // `gotoFixture`, not a bare settle: the first interaction here is a GLOBAL
    // SHORTCUT, and a keypress is one-shot — pressed before React attaches the
    // dispatcher it is swallowed with nothing to retry. Same reasoning as
    // `command-palette.spec.ts`.
    await gotoFixture(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeFocused();
    await input.fill("Go to Today");
    const option = page.getByRole("option", { name: /Go to Today/ });
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/today$/);
  });

  test("opens Waiting through the Command Palette", async ({ page }) => {
    await openToday(page);
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await input.fill("Open Waiting");
    await expect(
      page.getByRole("option", { name: /Open Waiting/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/today\/waiting$/);
  });
});

test.describe("the day is operable from the keyboard", () => {
  test("Tab reaches a task's checkbox and its title, and Enter opens the record", async ({
    page,
  }) => {
    await openToday(page);
    const row = page.locator(".dh-today__timeline .dh-taskrow").first();
    if ((await row.count()) === 0) {
      test.skip(true, "nothing on the day in the shared dev workspace");
    }

    // Plain rows: the checkbox and the title are two ordinary controls, both in
    // the natural tab order. No roving model, no composite widget.
    const checkbox = row.getByRole("checkbox").first();
    const title = row.locator(".dh-taskrow__title").first();
    await checkbox.focus();
    await expect(checkbox).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(title).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Focus returns to where it was, so the owner never loses their place.
    await expect(title).toBeFocused();
  });

  test("Back closes the Drawer and Forward reopens it", async ({ page }) => {
    await openToday(page);
    const title = page
      .locator(".dh-today__timeline .dh-taskrow__title")
      .first();
    if ((await title.count()) === 0) {
      test.skip(true, "nothing on the day in the shared dev workspace");
    }
    await title.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("the shortcut boundary", () => {
  test("single-key shortcuts do not fire while typing in a field", async ({
    page,
  }) => {
    // The field the owner types into from Today is the GLOBAL capture sheet's
    // title — Today has no field of its own. The rule under test ("letters reach
    // the field, they do not fire task shortcuts") is unchanged.
    await openToday(page);
    await globalCaptureControl(page).click();
    await page
      .getByRole("group", { name: "Capture type" })
      .getByRole("button", { name: /Task/ })
      .click();
    const capture = page.getByLabel("Title");
    await expect(capture).toBeFocused();
    await capture.pressSequentially("prep");

    // 'p' and the rest are typed, not swallowed as plan/complete shortcuts…
    await expect(capture).toHaveValue("prep");
    // …and nothing behind the sheet was completed or replanned. Scoped to the
    // live region: an unscoped text match would also pick up unrelated history.
    await expect(
      feedbackLive(page).filter({ hasText: /Task completed/i }),
    ).toHaveCount(0);
    await expect(
      feedbackLive(page).filter({ hasText: /Plan updated|tasks planned/i }),
    ).toHaveCount(0);

    await page.keyboard.press("Escape");
  });
});

test.describe("an open task record owns its shortcuts", () => {
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
    //
    // Located generically rather than by name: the drawer names itself from the
    // titles the DAY carries, so a task that is not on today (this one has no
    // dates) opens as "Task" until its record loads. The record's own heading —
    // asserted below — is the real title either way.
    await gotoFixture(page, DRAWER_URL);
    const taskDialog = page.getByRole("dialog");
    await expect(
      taskDialog.getByRole("heading", { name: "Draft the proposal" }).first(),
    ).toBeVisible();
    const planning = taskDialog.getByRole("group", { name: "Planning" });
    const clear = planning.getByRole("button", { name: "Clear" });
    if ((await clear.count()) > 0) {
      await clear.first().click();
      await expect(planning.getByText("Not planned")).toBeVisible();
    }
    /*
     * CONTROL-01 §4 (#189) promoted completion out of the drawer body and onto
     * the record header, as "Complete task" / "Reopen task" — a lifecycle act
     * beside the status chip that says the current state in words, rather than
     * a checkbox inside the record. `task-drawer.spec.ts` was updated with that
     * change and this journey was not, so `getByRole("checkbox")` matched
     * nothing here and every assertion about the task's state below was
     * asserting on an element that does not exist.
     *
     * The claim is unchanged — the task behind the stacked help drawer must not
     * be completed by a keystroke — and reads off the control that ships: while
     * the task is open, the header offers "Complete task".
     */
    const stillOpen = taskDialog.getByRole("button", { name: "Complete task" });
    await expect(stillOpen).toBeVisible();

    // Stack the keyboard-help drawer ABOVE the task drawer (the task drawer
    // stays mounted but is no longer the interactive top).
    await page.keyboard.press("Shift+?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();

    // Press the task shortcuts: they must NOT reach the task behind help.
    await page.keyboard.press("c");
    await page.keyboard.press("p");
    await page.keyboard.press("Shift+P");
    await expect(
      feedbackLive(page).filter({ hasText: /Task completed/i }),
    ).toHaveCount(0);
    // The target task itself, asserted directly rather than only through the
    // absence of feedback: it is still open behind the stacked help drawer.
    await expect(stillOpen).toBeVisible();

    // Close help → the task drawer is the top again; it was left untouched.
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(planning.getByText("Not planned")).toBeVisible();
    await expect(stillOpen).toBeVisible();

    // Now that it is top again, its shortcuts work: P plans it.
    await taskDialog.getByRole("button", { name: /close/i }).first().focus();
    await page.keyboard.press("p");
    await expect(planning.getByText("Not planned")).toHaveCount(0);

    // Restore test data.
    await planning.getByRole("button", { name: "Clear" }).click();
    await expect(planning.getByText("Not planned")).toBeVisible();
  });
});

test.describe("the keyboard reference", () => {
  test("shows the reference via ?, hosted in Today's Drawer", async ({
    page,
  }) => {
    await openToday(page);
    await page.locator("body").click();
    await page.keyboard.press("Shift+?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/fully operable from the keyboard/i),
    ).toBeVisible();
    // The task shortcuts are documented where they actually work: with a task
    // open, not "on Today".
    await expect(dialog.getByText("With a task open")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("accessibility & responsive", () => {
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
    await openToday(page);
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expectNoHorizontalOverflow(page);
  });
});
