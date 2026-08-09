import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * EDIT-03 — a Task row's inline editors must show the WHOLE list of choices.
 *
 * The defect, reported against the redesigned Tasks list: opening Priority,
 * Project or Due date showed the value already stored and none of the
 * alternatives. Everything was in the DOM. It was rendered inside the task row,
 * and a task row clips: `.dh-card-swipe` hides its overflow so the swipe tray
 * can slide underneath, and the Project column is a fixed 12rem track that hides
 * its overflow too. A `position: absolute` menu inside that was painted as a
 * 45px sliver — measured before the fix, a 305px priority menu was cut to 45px
 * and squeezed to 64px wide, so "P2 · High" wrapped to "P2 · Hi / gh".
 *
 * Which is why every assertion here is a MEASUREMENT rather than a
 * `toBeVisible()`: Playwright's visibility check passes on a clipped element —
 * it has a box and it is not `display: none` — so the test that would have
 * caught this had to compare the surface's rectangle with the rectangles of the
 * things that clip it. The unit suite covers the DOM contract
 * (`test/unit/inline-edit/inline-overlay.test.tsx`) and the pure geometry
 * (`test/unit/anchored/anchored-placement.test.ts`); this is the part that needs
 * a real layout.
 */

/** The rectangle of a surface, plus whether anything around it cuts into it. */
async function surfaceGeometry(page: Page) {
  return page.evaluate(() => {
    const surface = document.querySelector(".dh-anchored");
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    // Every ancestor that hides its overflow, and whether the surface actually
    // spills past it — which is exactly what the row used to do to the menu.
    const cutBy: string[] = [];
    let ancestor = surface.parentElement;
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
          cutBy.push(String(ancestor.className));
        }
      }
      ancestor = ancestor.parentElement;
    }
    return {
      width: rect.width,
      height: rect.height,
      side: surface.getAttribute("data-side"),
      cutBy,
      scrollsInternally: surface.scrollHeight > surface.clientHeight + 1,
      insideViewport:
        rect.top >= -0.5 &&
        rect.left >= -0.5 &&
        rect.bottom <= window.innerHeight + 0.5 &&
        rect.right <= window.innerWidth + 0.5,
    };
  });
}

/** Assert the open surface is whole, on screen, and cut by nothing. */
async function expectUnclipped(page: Page, minHeight: number) {
  const geometry = await surfaceGeometry(page);
  expect(geometry, "an anchored surface should be open").not.toBeNull();
  expect(geometry?.cutBy, "no ancestor may clip the surface").toEqual([]);
  expect(geometry?.insideViewport, "the surface stays in the viewport").toBe(
    true,
  );
  // The sliver test. The defect painted 45px of a 305px menu.
  expect(geometry?.height ?? 0).toBeGreaterThanOrEqual(minHeight);
}

/** The first task row, and its inline editors. */
function firstRow(page: Page): Locator {
  return page.locator(".dh-card-collection--list .dh-card").first();
}

/**
 * Open a row editor and make sure it STAYS open.
 *
 * The retry is about the list, not about the editor. An accepted change
 * re-groups the row (Overdue → Today → Upcoming), and TASKS-09's revalidation
 * lands a beat after the value does — remounting the row, and with it any
 * editor opened into that window. That is pre-existing list behaviour; here it
 * would only make the assertions race, so the test re-opens rather than
 * asserting on the timing of a re-read it is not testing.
 */
async function openEditor(page: Page, row: Locator, testId: string) {
  const surface = page.locator(".dh-anchored");
  await expect
    .poll(
      async () => {
        if ((await surface.count()) === 0) {
          await row
            .locator(`[data-testid="${testId}"] button`)
            .first()
            .click({ timeout: 5_000 })
            .catch(() => undefined);
        }
        await page.waitForTimeout(250);
        return (
          (await surface.count()) === 1 &&
          (await surface.getAttribute("data-positioned")) === "true"
        );
      },
      { message: `the ${testId} editor should open and stay open` },
    )
    .toBe(true);
}

async function dismiss(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".dh-anchored")).toHaveCount(0);
}

/**
 * Let the list finish reacting to a save before the next editor is opened.
 *
 * An accepted date change re-groups the row (Overdue → Today → Upcoming), so
 * the row — and the editor inside it — is re-mounted a moment after the value
 * lands. Opening the next editor into that window detaches it mid-interaction.
 * This is a property of the LIST, not of the fix under test.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

test.describe("EDIT-03 — inline editors on a Task row, at desktop width", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFixture(page, "/tasks");
  });

  test("Priority offers every priority, unclipped, and changes directly", async ({
    page,
  }) => {
    const row = firstRow(page);
    const title = (await row.locator(".dh-card__title").innerText()).trim();
    const stable = page.locator(".dh-card", { hasText: title }).first();

    await openEditor(page, stable, "task-row-priority");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitemradio")).toHaveText([
      "P1 · Urgent",
      "P2 · High",
      "P3 · Normal",
      "P4 · Low",
      // The unset state is not an option (EDIT-02); clearing is the separated
      // command at the end, offered because this row has a priority to clear.
      "Clear priority",
    ]);
    await expectUnclipped(page, 200);
    // The menu takes focus, so the keyboard can drive it from the first frame.
    await expect(
      menu.locator('[role="menuitemradio"][aria-checked="true"]'),
    ).toBeFocused();

    await menu.getByRole("menuitemradio", { name: "P3 · Normal" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await settle(page);

    // Reopened, the new value is the checked one…
    await openEditor(page, stable, "task-row-priority");
    await expect(
      page.getByRole("menu").locator('[aria-checked="true"]'),
    ).toHaveText("P3 · Normal");

    // …and one value replaces another with no clearing step in between.
    await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await settle(page);
    await openEditor(page, stable, "task-row-priority");
    await expect(
      page.getByRole("menu").locator('[aria-checked="true"]'),
    ).toHaveText("P1 · Urgent");
    await dismiss(page);
  });

  test("Project offers the whole bounded set, scrolls it, and can remove it", async ({
    page,
  }) => {
    const row = firstRow(page);
    const title = (await row.locator(".dh-card__title").innerText()).trim();
    const stable = page.locator(".dh-card", { hasText: title }).first();

    await openEditor(page, stable, "task-row-parent");
    const menu = page.getByRole("menu");
    // Far more than the one the row already shows — the whole point.
    expect(
      await menu.getByRole("menuitemradio").count(),
    ).toBeGreaterThanOrEqual(5);
    await expectUnclipped(page, 200);
    // A list this long cannot fit; it scrolls inside the surface rather than
    // growing the row or running off the page.
    expect((await surfaceGeometry(page))?.scrollsInternally).toBe(true);

    await menu
      .getByRole("menuitemradio", { name: "Conference talk" })
      .first()
      .click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await settle(page);
    await openEditor(page, stable, "task-row-parent");
    await expect(
      page.getByRole("menu").locator('[aria-checked="true"]'),
    ).toContainText("Conference talk");

    // A second Project, chosen directly over the first.
    await page
      .getByRole("menuitemradio", { name: "Kitchen fit-out" })
      .first()
      .click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await settle(page);
    await openEditor(page, stable, "task-row-parent");
    await expect(
      page.getByRole("menu").locator('[aria-checked="true"]'),
    ).toContainText("Kitchen fit-out");

    // …and removing it returns the task to the Inbox.
    await page.getByRole("menuitemradio", { name: "Move to Inbox" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      stable.locator('[data-testid="task-row-parent"]'),
    ).toContainText("Unassigned");
    await settle(page);
    // With nothing to remove, the command is gone rather than dead.
    await openEditor(page, stable, "task-row-parent");
    await expect(
      page.getByRole("menuitemradio", { name: "Move to Inbox" }),
    ).toHaveCount(0);
    await dismiss(page);
  });

  test("Due date exposes the whole date interface and clears", async ({
    page,
  }) => {
    const row = firstRow(page);
    const title = (await row.locator(".dh-card__title").innerText()).trim();
    const stable = page.locator(".dh-card", { hasText: title }).first();

    await openEditor(page, stable, "task-row-due-date");
    const popover = page.getByRole("dialog", { name: "Edit due date" });
    for (const shortcut of ["Today", "Tomorrow", "Next week"]) {
      await expect(
        popover.getByRole("button", { name: shortcut }),
      ).toBeVisible();
    }
    await expect(popover.locator('input[type="date"]')).toBeVisible();
    await expect(popover.getByRole("button", { name: "Clear" })).toBeVisible();
    await expectUnclipped(page, 120);

    await popover.getByRole("button", { name: "Today" }).click();
    await expect(
      stable.locator('[data-testid="task-row-due-date"]'),
    ).toContainText("Today");
    await settle(page);

    // An arbitrary date, through the platform's own picker input.
    await openEditor(page, stable, "task-row-due-date");
    await page.locator('.dh-anchored input[type="date"]').fill("2026-12-25");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      stable.locator('[data-testid="task-row-due-date"]'),
    ).toContainText("Dec");
    await settle(page);

    await openEditor(page, stable, "task-row-due-date");
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(
      stable.locator('[data-testid="task-row-due-date"]'),
    ).toContainText("No due date");
  });

  test("repositions rather than overflowing, wherever the row sits", async ({
    page,
  }) => {
    const editors = page.locator('[data-testid="task-row-priority"]');
    const count = Math.min(await editors.count(), 40);

    /** Open the editor on the row nearest a given y, and report its placement. */
    const openNear = async (wanted: number) => {
      for (let index = 0; index < count; index += 1) {
        const box = await editors.nth(index).boundingBox();
        if (box && Math.abs(box.y - wanted) < 60) {
          await editors.nth(index).locator("button").first().click();
          await expect(page.locator(".dh-anchored")).toHaveAttribute(
            "data-positioned",
            "true",
          );
          return surfaceGeometry(page);
        }
      }
      return null;
    };

    // Top of the list: the menu has room below and takes it.
    const top = await openNear(360);
    expect(top?.side).toBe("below");
    expect(top?.insideViewport).toBe(true);
    await dismiss(page);

    // Near the bottom of the viewport: it flips above rather than running off.
    const bottom = await openNear(700);
    expect(bottom?.side).toBe("above");
    expect(bottom?.insideViewport).toBe(true);
    expect(bottom?.cutBy).toEqual([]);
    await dismiss(page);

    // And the page never scrolls sideways because of any of it.
    await expectNoHorizontalOverflow(page);
  });

  test("an open menu is free of WCAG 2.2 AA violations", async ({ page }) => {
    await openEditor(page, firstRow(page), "task-row-priority");
    await expectNoAxeViolations(page, { include: ".dh-anchored" });
    await dismiss(page);
  });
});

test.describe("EDIT-03 — the phone presentation", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("a Task row's due date opens the shared sheet, not a tiny menu", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await firstRow(page)
      .locator('[data-testid="task-row-due-date"] button')
      .first()
      .click();

    const sheet = page.getByRole("dialog", { name: "Edit due date" });
    await expect(sheet).toBeVisible();
    // The clipping that broke the desktop menu breaks a `position: fixed` sheet
    // too, because the swipe card is TRANSFORMED and so becomes the containing
    // block for its fixed descendants. A sheet laid out inside a 45px row is
    // the same defect wearing a different hat, so its width is asserted.
    const box = await sheet.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    for (const shortcut of ["Today", "Tomorrow", "Next week"]) {
      await expect(sheet.getByRole("button", { name: shortcut })).toBeVisible();
    }
    await expect(sheet.locator('input[type="date"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a Task record's priority opens the shared sheet with every option", async ({
    page,
  }) => {
    await gotoFixture(page, "/today?drawer=task%3At-drawer");
    await page.locator('[data-testid="task-priority-edit"] button').click();

    const sheet = page.getByRole("dialog", { name: "Priority" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".dh-sheet-option")).toHaveText([
      "P1 · Urgent",
      "P2 · High",
      "P3 · Normal",
      "P4 · Low",
    ]);
    await expect(
      sheet.getByRole("button", { name: "Clear priority" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
