import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture, taskRows, waitForInteractive } from "./helpers";

/**
 * DHDS-10 — inline manipulation, as visual evidence.
 *
 * The phase's acceptance test (§48) is a question about a STILL: *looking at a
 * populated task list at rest, does this still look like a beautifully composed
 * task list, or like a row of dropdown controls?* No assertion can answer that,
 * so the frames are the evidence — and the pairs are the argument. Every
 * surface here is photographed twice, at rest and engaged with, because the
 * whole thesis is the difference between them: information at rest,
 * manipulability on engagement.
 *
 * It also photographs the two things a still proves better than a test: that a
 * choice OPENS whole, anchored to the value it belongs to; and that a phone
 * gets a real sheet rather than a squeezed popover.
 *
 * Both appearances, because a hover wash and a caret at 65% are exactly the
 * kind of restraint that survives light and fails dark.
 *
 * Opt-in, like every capture pass in this repository, so the ordinary gate
 * neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/dhds-10-inline-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "dhds-10-2026-08",
);

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 393, height: 852 };

/** A flat, recently-updated list, so the same rows lead every frame. */
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
 * Inherited from the DHDS-08 and DHDS-09 passes for the reason recorded there:
 * a capture taken mid-rise produces a semi-transparent panel that looks exactly
 * like a real overlay defect and is not one. Evidence that can be mistaken for
 * a bug is worse than no evidence.
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

async function openRowEditor(page: Page, testId: string) {
  const row = taskRows(page).first();
  await row.hover();
  await row.getByTestId(testId).getByRole("button").click();
  // Either surface may be what a field opens; wait for whichever appears.
  await page
    .locator('[role="menu"], [role="dialog"]')
    .first()
    .waitFor()
    .catch(() => undefined);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`DHDS-10 evidence — ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`the Task list, at rest and engaged with (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, TASKS);
      await waitForInteractive(page);

      // §48. Nothing on this frame may look like a control.
      await shoot(page, `tasks-rest-${scheme}`);

      await taskRows(page).nth(2).hover();
      await shoot(page, `tasks-hover-${scheme}`);

      await taskRows(page).nth(2).getByTestId("task-row-priority").focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await shoot(page, `tasks-focus-${scheme}`);
    });

    test(`each contextual choice, anchored to the value it belongs to (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, TASKS);
      await waitForInteractive(page);

      await openRowEditor(page, "task-row-due-date");
      await shoot(page, `choice-date-${scheme}`);
      await page.keyboard.press("Escape");

      await openRowEditor(page, "task-row-priority");
      await shoot(page, `choice-priority-${scheme}`);
      await page.keyboard.press("Escape");

      await openRowEditor(page, "task-row-parent");
      await shoot(page, `choice-project-menu-${scheme}`);
      // The escape hatch: a searchable picker over the row, not a record.
      await page
        .getByRole("menuitem", { name: /Search all Projects and Areas/ })
        .click();
      await page.getByRole("combobox").fill("a");
      await shoot(page, `choice-project-picker-${scheme}`);
      await page.keyboard.press("Escape");
    });

    test(`inline title editing, in place (${scheme})`, async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, TASKS);
      await waitForInteractive(page);

      const row = taskRows(page).first();
      const title = (await row.getByTestId("task-row-open").innerText()).trim();
      await row.hover();
      await row
        .getByRole("button", { name: `More actions for ${title}` })
        .click();
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await shoot(page, `title-editing-${scheme}`);
      await page.keyboard.press("Escape");
    });

    test(`Today, manipulated without leaving it (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, "/today");
      await waitForInteractive(page);
      await shoot(page, `today-rest-${scheme}`);

      const row = taskRows(page).first();
      await row.hover();
      await shoot(page, `today-hover-${scheme}`);
      await row.getByTestId("task-row-priority").getByRole("button").click();
      await shoot(page, `today-choice-${scheme}`);
      await page.keyboard.press("Escape");
    });

    test(`a record's own metadata is a control (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);

      await gotoFixture(page, "/projects/pr-rc-kitchen");
      await waitForInteractive(page);
      await shoot(page, `project-record-rest-${scheme}`);
      await page.getByTestId("project-status-edit").getByRole("button").click();
      await shoot(page, `project-status-choice-${scheme}`);
      await page.keyboard.press("Escape");

      await gotoFixture(page, "/asset/as-rc-ute");
      await waitForInteractive(page);
      await shoot(page, `asset-record-rest-${scheme}`);
      await page.getByTestId("asset-area-edit").getByRole("button").click();
      await shoot(page, `asset-area-choice-${scheme}`);
      await page.keyboard.press("Escape");

      await gotoFixture(page, "/projects?view=table");
      await waitForInteractive(page);
      await shoot(page, `projects-table-rest-${scheme}`);
    });

    /*
     * The phone frames are SPLIT, and each one gets its own context.
     *
     * One test doing six navigations at 393px runs past the suite's 30s
     * per-test budget — which is right for a journey and wrong for a capture,
     * where the work is loading six different surfaces rather than proving one
     * thing. Splitting keeps each frame inside the budget and makes a failure
     * name the frame it lost.
     */
    test(`the phone: a Task row and its date sheet (${scheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: PHONE,
        colorScheme: scheme,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await gotoFixture(page, TASKS);
      await waitForInteractive(page);
      await shoot(page, `phone-tasks-rest-${scheme}`);

      /*
       * The first row that actually SHOWS a date.
       *
       * A phone drops the trigger for an unused dimension entirely
       * (`task-list.css`: "an UNUSED dimension is BLANK on a phone, not a
       * placeholder"), so asking the first row for its date editor asks a row
       * that may legitimately have none.
       */
      await page
        .locator('[data-testid="task-row-due-date"] button:visible')
        .first()
        .click();
      await shoot(page, `phone-date-sheet-${scheme}`);
      await context.close();
    });

    test(`the phone: a Project choice sheet and a title in place (${scheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: PHONE,
        colorScheme: scheme,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await gotoFixture(page, TASKS);
      await waitForInteractive(page);

      /*
       * A row that HAS a Project, because a phone drops the trigger for one
       * that has none (`task-list.css`: an unused dimension is blank on a
       * phone, and a zero-width invisible button would float a 44px hit area
       * over its neighbour).
       */
      await page
        .locator('[data-testid="task-row-parent"] button:visible')
        .first()
        .click();
      await shoot(page, `phone-project-sheet-${scheme}`);
      await page.keyboard.press("Escape");

      // Inline title editing beside the software keyboard's own space: the
      // editor must not push the row off the screen or overflow it sideways.
      const row = taskRows(page).first();
      const title = (await row.getByTestId("task-row-open").innerText()).trim();
      await row
        .getByRole("button", { name: `More actions for ${title}` })
        .click();
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await shoot(page, `phone-title-editing-${scheme}`);
      await context.close();
    });

    test(`the phone: a NON-Task record's metadata sheet (${scheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: PHONE,
        colorScheme: scheme,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await gotoFixture(page, "/asset/as-rc-ute");
      await waitForInteractive(page);
      await shoot(page, `phone-asset-rest-${scheme}`);
      await page.getByTestId("asset-status-edit").getByRole("button").click();
      await shoot(page, `phone-asset-status-sheet-${scheme}`);
      await context.close();
    });
  });
}
