import { test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { globalCaptureControl, gotoFixture, taskRows } from "./helpers";

/**
 * DHDS-09 — the floating surfaces, as visual evidence.
 *
 * A convergence pass is exactly the kind of change a green test suite cannot
 * accept on its own: every assertion can pass while the six surfaces still look
 * like six products. So this capture photographs the surfaces SIDE BY SIDE in
 * the same run, at the same width, in both appearances — a menu, a picker, a
 * popover, a dialog and the phone sheet — because the question a reviewer is
 * being asked is "do these belong to one product", and that is a question about
 * a set rather than about any one frame.
 *
 * It also photographs the two things a still is uniquely good at proving:
 * that an open surface is WHOLE (nothing clipped it) and that it is anchored to
 * the control that opened it (the trigger is visibly lit beside it).
 *
 * Opt-in, like every capture pass in this repository, so the ordinary gate
 * neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/dhds-09-floating-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "dhds-09-2026-08",
);

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 393, height: 852 };
const NARROW = { width: 320, height: 720 };

/** A flat, recently-updated list, so the probe rows are at the top. */
const TASKS = "/tasks?group=none&sort=updated&completed=hide";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/**
 * Shoot, once every entry animation has finished.
 *
 * Inherited from the DHDS-08 pass for the reason recorded there: a capture taken
 * mid-rise produces a semi-transparent panel that looks exactly like a real
 * overlay defect and is not one. Evidence that can be mistaken for a bug is
 * worse than no evidence.
 */
async function shoot(page: Page, name: string) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

function firstRow(page: Page): Locator {
  return taskRows(page).first();
}

/** Open one of a task row's contextual editors and let it settle. */
async function openRowEditor(page: Page, testId: string) {
  await firstRow(page)
    .locator(`[data-testid="${testId}"] button`)
    .first()
    .click();
  await page
    .locator('.dh-anchored[data-positioned="true"]')
    .first()
    .waitFor({ state: "visible" });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`DHDS-09 evidence — desktop (${scheme})`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test("the three anchored surfaces, on the same list", async ({ page }) => {
      await gotoFixture(page, TASKS);

      // A MENU — a closed set of values, chosen as a command.
      await openRowEditor(page, "task-row-priority");
      await shoot(page, `desktop-${scheme}-menu-priority`);
      await page.keyboard.press("Escape");

      // A POPOVER — presets, a month grid and two commands. Not a list.
      await openRowEditor(page, "task-row-due-date");
      await shoot(page, `desktop-${scheme}-popover-date`);
      await page.keyboard.press("Escape");

      // The parent MENU, whose last row hands off to the searchable picker.
      await openRowEditor(page, "task-row-parent");
      await shoot(page, `desktop-${scheme}-menu-parent`);
      await page.keyboard.press("Escape");
    });

    test("the overflow menu, portalled out of the row that clips it", async ({
      page,
    }) => {
      await gotoFixture(page, TASKS);
      const row = firstRow(page);
      await row.hover();
      await row.getByRole("button", { name: /More actions for/ }).click();
      await page.getByRole("menu").first().waitFor({ state: "visible" });
      await shoot(page, `desktop-${scheme}-menu-overflow`);
    });

    test("the collection's filter and sort surface", async ({ page }) => {
      await gotoFixture(page, TASKS);
      await page.getByTestId("collection-filter-trigger").click();
      await page.getByRole("menu").first().waitFor({ state: "visible" });
      await shoot(page, `desktop-${scheme}-popover-controls`);
    });

    test("a collection whose sort was three different controls", async ({
      page,
    }) => {
      for (const [route, subject] of [
        ["/meetings", "meetings"],
        ["/reviews", "reviews"],
        ["/people", "people"],
      ] as const) {
        await gotoFixture(page, route);
        const trigger = page.getByRole("button", { name: `Sort ${subject}` });
        if ((await trigger.count()) === 0) continue;
        await trigger.first().click();
        await page.getByRole("menu").first().waitFor({ state: "visible" });
        await shoot(page, `desktop-${scheme}-sort-${subject}`);
        await page.keyboard.press("Escape");
      }
    });

    test("Quick Capture's contextual metadata line", async ({ page }) => {
      await gotoFixture(page, "/today");
      await globalCaptureControl(page).click();
      const sheet = page.getByTestId("capture-sheet");
      await sheet.waitFor({ state: "visible" });
      const changeType = sheet.getByTestId("capture-change-type");
      if (await changeType.isVisible()) await changeType.click();
      await sheet.getByTestId("capture-choose-task").click();
      await sheet.getByLabel("Title").fill("Prepare the OPPO brief");
      await shoot(page, `desktop-${scheme}-capture-metadata`);

      // …and one of its pickers open over it, which is the nesting rule in a
      // still: a popover inside a sheet, with the sheet still legible behind.
      await sheet.getByTestId("capture-task-due").getByRole("button").click();
      await page
        .getByRole("dialog", { name: "Choose a due date" })
        .waitFor({ state: "visible" });
      await shoot(page, `desktop-${scheme}-capture-date-open`);
    });

    test("the searchable picker, and its empty result", async ({ page }) => {
      await gotoFixture(page, "/today");
      await globalCaptureControl(page).click();
      const sheet = page.getByTestId("capture-sheet");
      await sheet.waitFor({ state: "visible" });
      const changeType = sheet.getByTestId("capture-change-type");
      if (await changeType.isVisible()) await changeType.click();
      await sheet.getByTestId("capture-choose-task").click();

      const parent = sheet.getByTestId("capture-task-parent");
      if ((await parent.count()) === 0) return;
      await parent.getByRole("button").first().click();
      const picker = page.getByRole("dialog", {
        name: "Choose project or area",
      });
      await picker.waitFor({ state: "visible" });
      await shoot(page, `desktop-${scheme}-picker-parent`);

      // The empty state names what was searched for, rather than "No results".
      await picker.getByRole("combobox").fill("Training");
      await shoot(page, `desktop-${scheme}-picker-empty`);
    });

    test("a dialog, which is the one surface that interrupts", async ({
      page,
    }) => {
      await gotoFixture(page, "/projects");
      const card = page.locator("article.dh-pcard, li .dh-pcard").first();
      if ((await card.count()) === 0) return;
      await card.hover();
      await card.getByRole("button", { name: /More actions for/ }).click();
      const remove = page.getByRole("menuitem", { name: /^Delete/ });
      if ((await remove.count()) === 0) {
        await page.keyboard.press("Escape");
        return;
      }
      await remove.first().click();
      await page
        .getByRole("dialog")
        .first()
        .waitFor({ state: "visible" })
        .catch(() => undefined);
      await shoot(page, `desktop-${scheme}-dialog-confirm`);
    });
  });

  test.describe(`DHDS-09 evidence — phone (${scheme})`, () => {
    test.use({ viewport: PHONE, colorScheme: scheme });

    test("every anchored surface becomes a bottom sheet", async ({ page }) => {
      await gotoFixture(page, TASKS);

      await firstRow(page)
        .locator('[data-testid="task-row-priority"] button')
        .first()
        .click();
      await page.locator(".dh-sheet").first().waitFor({ state: "visible" });
      await shoot(page, `phone-${scheme}-sheet-priority`);
      await page.keyboard.press("Escape");

      await firstRow(page)
        .locator('[data-testid="task-row-due-date"] button')
        .first()
        .click();
      await page.locator(".dh-sheet").first().waitFor({ state: "visible" });
      await shoot(page, `phone-${scheme}-sheet-date`);
    });

    test("Quick Capture, one-handed", async ({ page }) => {
      await gotoFixture(page, "/today");
      const add = page
        .locator(".dh-bottomnav")
        .getByRole("button", { name: "Add", exact: true });
      if ((await add.count()) === 0) return;
      await add.click();
      const sheet = page.getByTestId("capture-sheet");
      await sheet.waitFor({ state: "visible" });
      const changeType = sheet.getByTestId("capture-change-type");
      if (await changeType.isVisible()) await changeType.click();
      await sheet.getByTestId("capture-choose-task").click();
      await sheet.getByLabel("Title").fill("Prepare the OPPO brief");
      await shoot(page, `phone-${scheme}-capture-metadata`);
    });
  });
}

test.describe("DHDS-09 evidence — the narrowest supported viewport", () => {
  test.use({ viewport: NARROW });

  test("a sheet at 320px keeps its content and overflows nothing", async ({
    page,
  }) => {
    await gotoFixture(page, TASKS);
    await firstRow(page)
      .locator('[data-testid="task-row-priority"] button')
      .first()
      .click();
    await page.locator(".dh-sheet").first().waitFor({ state: "visible" });
    await shoot(page, "narrow-320-sheet-priority");
  });
});
