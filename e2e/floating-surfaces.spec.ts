import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  globalCaptureControl,
  gotoFixture,
  taskRow,
  taskRows,
} from "./helpers";

/**
 * DHDS-09 — contextual choice, in a real browser.
 *
 * The measure of this phase is not that a `Popover` component exists. It is
 * whether the owner can change the thing in front of them without leaving the
 * place they are working, so the journeys below are written as that sentence:
 *
 *     click a value → choose a replacement → keep working
 *
 * and each one PROVES THE CHANGE SURVIVED A RELOAD, because a contextual editor
 * that paints a value it never persisted is worse than one that asks for a form.
 *
 * The unit suite owns the DOM contract (`test/unit/floating/`) and the geometry
 * is pure arithmetic (`test/unit/anchored/anchored-placement.test.ts`). What
 * needs a real engine is here: that the surfaces are ON SCREEN and whole, that
 * the keyboard alone can drive them, that a phone gets a sheet rather than a
 * squeezed popover, and that focus lands somewhere sensible afterwards.
 *
 * No arbitrary sleeps. Every wait is on a state the product actually reaches.
 */

const PHONE = { width: 393, height: 852 };

/**
 * The write a row's inline editor publishes, whichever route it posts to.
 *
 * This spec's own header sets the rule — *"No arbitrary sleeps. Every wait is
 * on a state the product actually reaches"* — and two of the three "changes in
 * place, and it persists" journeys already keep it by asserting the optimistic
 * paint before they reload. The priority journey reloaded straight after the
 * click, so on a loaded runner the navigation could beat the POST, the server
 * never saw the change, and the reloaded row had no Priority 1 mark:
 * `element(s) not found`, which reads like a missing glyph rather than a lost
 * write.
 *
 * Waiting on the RESPONSE rather than on the repainted row is the shape
 * DEBT-203 asks for and the one `today-task-convergence.spec.ts` already uses —
 * an optimistic paint is exactly the thing that cannot distinguish a landed
 * write from one still in flight.
 */
function taskWriteLanded(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/tasks\/(bulk|[^/]+)(?:\.data)?$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The one anchored overlay layer — every menu, popover and picker is in it. */
function surface(page: Page): Locator {
  return page.locator(".dh-anchored");
}

/**
 * A task of this spec's own, captured through the product's quick-add.
 *
 * The journeys below overwrite a priority, a Project and a due date and cannot
 * put back what they replace, so they must not operate on a shared fixture row.
 * Each test captures its own, and completes it afterwards so it leaves no stray
 * Inbox row for the next journey to count. The pattern (and the reasons for
 * every part of it) is `inline-editor-overlay.spec.ts`'s.
 */
const PROBE_VIEW = "/tasks?group=none&sort=updated&completed=hide";

async function clearProbes(page: Page, title: string) {
  const checkbox = page.getByRole("checkbox", { name: `Complete ${title}` });
  await expect
    .poll(
      async () => {
        const remaining = await checkbox.count();
        if (remaining === 0) return 0;
        await checkbox.first().click();
        await page.waitForLoadState("networkidle");
        return await checkbox.count();
      },
      { message: `no "${title}" probe should survive`, timeout: 30_000 },
    )
    .toBe(0);
}

async function captureProbe(page: Page, suffix: string): Promise<string> {
  const title = `DHDS-09 probe ${suffix}`;
  await clearProbes(page, title);
  const quickAdd = page.getByRole("textbox", { name: "Task title" });
  await quickAdd.fill(title);
  await quickAdd.press("Enter");
  await expect(taskRow(page, title).first()).toBeVisible();
  await expect(taskRow(page, title)).toHaveCount(1);
  return title;
}

/**
 * Open a row's contextual editor and make sure it STAYS open.
 *
 * The retry is about the list rather than about the editor: an accepted change
 * re-groups a row and the revalidation lands a beat after the value does,
 * remounting any editor opened into that window. That is pre-existing list
 * behaviour, and re-opening is honest about what is being measured here.
 */
async function openRowEditor(page: Page, row: Locator, testId: string) {
  await expect
    .poll(
      async () => {
        if ((await surface(page).count()) === 0) {
          await row
            .locator(`[data-testid="${testId}"] button`)
            .first()
            .click({ timeout: 5_000 })
            .catch(() => undefined);
        }
        return (
          (await surface(page).count()) === 1 &&
          (await surface(page).getAttribute("data-positioned")) === "true"
        );
      },
      { message: `the ${testId} editor should open and stay open` },
    )
    .toBe(true);
}

/** Every ancestor that clips the open surface — the defect this system removes. */
async function clippedBy(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const element = document.querySelector(".dh-anchored");
    if (!element) return ["<no surface>"];
    const rect = element.getBoundingClientRect();
    const cut: string[] = [];
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const box = ancestor.getBoundingClientRect();
        if (
          rect.bottom > box.bottom + 1 ||
          rect.top < box.top - 1 ||
          rect.right > box.right + 1 ||
          rect.left < box.left - 1
        ) {
          cut.push(String(ancestor.className));
        }
      }
      ancestor = ancestor.parentElement;
    }
    return cut;
  });
}

test.describe("DHDS-09 — a Task's metadata changes in place", () => {
  test("a due date is one press, and it persists", async ({ page }) => {
    await gotoFixture(page, PROBE_VIEW);
    const title = await captureProbe(page, "due");
    const row = taskRow(page, title).first();

    await openRowEditor(page, row, "task-row-due-date");

    // The surface is the product's own: presets first, then the month.
    const popover = page.getByRole("dialog", { name: "Edit due date" });
    await expect(popover).toBeVisible();
    await expect(clippedBy(page)).resolves.toEqual([]);

    await popover.getByRole("button", { name: "Tomorrow" }).click();

    // The row says so immediately — the write is optimistic and the words are
    // the ones a list is scanned by.
    await expect(row).toContainText("Tomorrow");

    // …and the SERVER agrees. A reload is the only assertion that separates a
    // painted value from a persisted one.
    await page.reload();
    await expect(taskRow(page, title).first()).toContainText("Tomorrow");

    await clearProbes(page, title);
  });

  test("a priority is chosen from the canonical four, and it persists", async ({
    page,
  }) => {
    await gotoFixture(page, PROBE_VIEW);
    const title = await captureProbe(page, "priority");
    const row = taskRow(page, title).first();

    await openRowEditor(page, row, "task-row-priority");

    const menu = page.getByRole("menu", { name: "Priority" });
    await expect(menu).toBeVisible();
    // FOUR options, named the same way here as everywhere else in the product.
    await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
    await expect(menu.getByRole("menuitemradio")).toHaveText([
      "Priority 1",
      "Priority 2",
      "Priority 3",
      "Priority 4",
    ]);
    // A captured task stores no priority, and `null` IS Priority 4 — so the
    // menu opens with Priority 4 announced as the current one rather than with
    // nothing checked.
    await expect(
      menu.getByRole("menuitemradio", { name: "Priority 4" }),
    ).toHaveAttribute("aria-checked", "true");

    // Registered BEFORE the click that causes it, so the wait cannot miss a
    // write that lands fast.
    const priorityWritten = taskWriteLanded(page);
    await menu.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await priorityWritten;

    await page.reload();
    await expect(
      taskRow(page, title).first().getByRole("img", { name: "Priority 1" }),
    ).toBeVisible();

    await clearProbes(page, title);
  });

  test("a Project is SEARCHED for, chosen, and persists", async ({ page }) => {
    await gotoFixture(page, PROBE_VIEW);
    const title = await captureProbe(page, "project");
    const row = taskRow(page, title).first();

    await openRowEditor(page, row, "task-row-parent");
    const menu = page.getByRole("menu", { name: "Project or Area" });
    await expect(menu).toBeVisible();

    // Typing filters the bounded candidate list — the menu pattern's own
    // typeahead, which is what makes a fifty-item list usable without a second
    // control (the searchable picker is one row further down, for what is NOT
    // in the list).
    const options = menu.getByRole("menuitemradio");
    await expect(options.first()).toBeVisible();
    /*
     * The option's accessible NAME, not its text.
     *
     * A parent option's row carries a supporting line ("Project" / "Area") as
     * well as the record's name, and the shared option row deliberately keeps
     * that line OUT of the accessible name — the label alone names the choice.
     * The row behind the menu shows the name, so the name is what this compares.
     */
    const chosen = (await options.first().getAttribute("aria-label")) ?? "";
    expect(chosen.length).toBeGreaterThan(0);
    await options.first().click();

    await expect(row).toContainText(chosen);
    await page.reload();
    await expect(taskRow(page, title).first()).toContainText(chosen);

    await clearProbes(page, title);
  });
});

test.describe("DHDS-09 — the keyboard drives every surface", () => {
  test("a priority is set without the mouse, and focus comes back", async ({
    page,
  }) => {
    await gotoFixture(page, PROBE_VIEW);
    const title = await captureProbe(page, "keyboard");
    const row = taskRow(page, title).first();

    const trigger = row
      .locator('[data-testid="task-row-priority"] button')
      .first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const menu = page.getByRole("menu", { name: "Priority" });
    await expect(menu).toBeVisible();

    // The menu opens ON the current value and arrows from there.
    await expect(
      menu.getByRole("menuitemradio", { name: "Priority 4" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitemradio", { name: "Priority 1" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(menu).toBeHidden();
    // AGENTS.md §15 — no lost focus. The control the owner was standing on is
    // where they are put back.
    await expect(trigger).toBeFocused();

    await page.reload();
    await expect(
      taskRow(page, title).first().getByRole("img", { name: "Priority 1" }),
    ).toBeVisible();

    await clearProbes(page, title);
  });

  test("Escape closes only the surface, and returns focus", async ({
    page,
  }) => {
    await gotoFixture(page, PROBE_VIEW);
    const row = taskRows(page).first();
    const trigger = row
      .locator('[data-testid="task-row-priority"] button')
      .first();

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Priority" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Priority" })).toBeHidden();
    await expect(trigger).toBeFocused();
    // The page behind it is untouched — Escape reached the topmost layer and
    // stopped there.
    await expect(page).toHaveURL(new RegExp("/tasks"));
  });
});

test.describe("DHDS-09 — Quick Capture keeps its metadata in context", () => {
  test("a captured Task carries the date and priority chosen on the capture surface", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await globalCaptureControl(page).click();

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();
    const changeType = sheet.getByTestId("capture-change-type");
    if (await changeType.isVisible()) await changeType.click();
    await sheet.getByTestId("capture-choose-task").click();

    const title = `DHDS-09 capture probe`;
    const titleField = sheet.getByLabel("Title");
    await titleField.fill(title);

    // The metadata is a LINE under the title, and each value opens the same
    // surface the Task row opens — not a stacked form.
    await sheet.getByTestId("capture-task-due").getByRole("button").click();
    const datePopover = page.getByRole("dialog", {
      name: "Choose a due date",
    });
    await expect(datePopover).toBeVisible();
    await datePopover.getByRole("button", { name: "Tomorrow" }).click();
    await expect(sheet.getByTestId("capture-task-due")).toContainText(
      "Tomorrow",
    );

    await sheet
      .getByTestId("capture-task-priority")
      .getByRole("button")
      .click();
    const priorityMenu = page.getByRole("menu", { name: "Priority" });
    await expect(priorityMenu).toBeVisible();
    await priorityMenu
      .getByRole("menuitemradio", { name: "Priority 1" })
      .click();

    // The capture sheet's own header Save, which submits the panel's form by id.
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("capture-result")).toBeVisible();

    // The record the server created carries what was chosen on the surface.
    await gotoFixture(page, PROBE_VIEW);
    const row = taskRow(page, title).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Tomorrow");
    await expect(row.getByRole("img", { name: "Priority 1" })).toBeVisible();

    await clearProbes(page, title);
  });
});

test.describe("DHDS-09 — a phone gets a sheet, not a squeezed popover", () => {
  test.use({ viewport: PHONE });

  test("the row's priority opens the shared bottom sheet, full width", async ({
    page,
  }) => {
    await gotoFixture(page, PROBE_VIEW);
    const row = taskRows(page).first();
    await row
      .locator('[data-testid="task-row-priority"] button')
      .first()
      .click();

    const sheet = page.locator(".dh-sheet").first();
    await expect(sheet).toBeVisible();

    // The same roles as the desktop menu — one field, one accessibility
    // contract, two containers.
    const menu = sheet.getByRole("menu", { name: "Priority" });
    await expect(menu.getByRole("menuitemradio")).toHaveCount(4);

    // It is the width of the phone rather than a 208px box floating in the list,
    // and every row clears the 44px target floor.
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox!.width).toBeGreaterThan(PHONE.width * 0.9);
    for (const option of await menu.getByRole("menuitemradio").all()) {
      const box = await option.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // And nothing overflows the document sideways.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("DHDS-09 — the surfaces are whole, wherever the trigger is", () => {
  test("an editor near the bottom of the window still shows every option", async ({
    page,
  }) => {
    await gotoFixture(page, PROBE_VIEW);
    const height = page.viewportSize()!.height;

    // Find a row low in the window — the case an absolutely-positioned box got
    // wrong, and the one the shared solver flips for.
    const rows = await taskRows(page).all();
    let lowest: Locator | null = null;
    for (const row of rows) {
      const box = await row.boundingBox();
      if (box && box.y > height - 220 && box.y < height - 40) lowest = row;
    }
    test.skip(lowest === null, "no row sits near the bottom of this viewport");

    await lowest!
      .locator('[data-testid="task-row-priority"] button')
      .first()
      .click();

    const open = surface(page);
    await expect(open).toHaveAttribute("data-positioned", "true");
    await expect(clippedBy(page)).resolves.toEqual([]);

    const box = await open.boundingBox();
    // Inside the viewport, with the shared margin — never flush against an edge.
    expect(box!.y).toBeGreaterThanOrEqual(8);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height - 8);
    // All four options are drawn, not a sliver of the one already set.
    await expect(page.getByRole("menuitemradio")).toHaveCount(4);
  });
});
