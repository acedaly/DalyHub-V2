import { test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture, openCollectionControls, taskRows } from "./helpers";

/**
 * DHDS-08 — the motion and interaction grammar, as visual evidence.
 *
 * A motion pass cannot be accepted on green tests alone, and it also cannot be
 * proved by a still. So this capture deliberately photographs the STATES the
 * grammar moves between — a row at rest and the same row with its affordance
 * revealed, a task before and after completion, a section open and closed —
 * because those are the pairs a reviewer can actually judge: if a still of the
 * "after" shows the title in a different place from the "before", the motion
 * between them was wrong however smooth it looked.
 *
 * Two frames are the exception and are taken MID-flight on purpose: the
 * completion crossfade and a panel's entrance, so the intermediate state is on
 * the record rather than only its endpoints.
 *
 * Opt-in, like every capture pass in this repository, so the ordinary gate
 * neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/dhds-08-motion-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "dhds-08-2026-08",
);

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 393, height: 852 };

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
 * Inherited verbatim from the UIX-06 pass, for the reason recorded there: a
 * capture taken mid-rise produces a semi-transparent panel that looks exactly
 * like a real overlay defect and is not one. Evidence that can be mistaken for a
 * bug is worse than no evidence.
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

/**
 * Shoot WITHOUT waiting — the deliberate mid-flight frame.
 *
 * Used only where the intermediate state is the thing being evidenced. The
 * filename says `during`, so it can never be mistaken for a resting state.
 */
async function shootDuring(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** The first task row on the current surface. */
function firstRow(page: Page): Locator {
  return taskRows(page).first();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`DHDS-08 evidence — desktop (${scheme})`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test("the surfaces the grammar governs, at rest", async ({ page }) => {
      for (const [route, name] of [
        ["/today", "today"],
        ["/tasks", "tasks"],
        ["/projects", "projects"],
        ["/goals", "goals"],
        ["/notes", "notes"],
      ] as const) {
        await gotoFixture(page, route);
        await shoot(page, `${scheme}-desktop-${name}`);
      }
    });

    test("a row at rest, and the same row with its affordance revealed", async ({
      page,
    }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      // The pair a reviewer compares: if the title moves between these two
      // frames, the reveal grammar is broken (§26).
      await shoot(page, `${scheme}-desktop-row-rest`);
      await row.hover();
      await shoot(page, `${scheme}-desktop-row-revealed`);
    });

    test("task completion, before / during / after", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      const title = await row.locator(".dh-taskrow__title").innerText();

      await shoot(page, `${scheme}-desktop-completion-before`);
      await row
        .getByRole("checkbox", { name: `Complete ${title}` })
        .check({ noWaitAfter: true });
      // Mid-crossfade: the strike drawing and the ink receding.
      await shootDuring(page, `${scheme}-desktop-completion-during`);
      await shoot(page, `${scheme}-desktop-completion-after`);
    });

    test("a grouped section, open and closed", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const disclosure = page.locator(".dh-taskgroup__disclosure").first();
      if ((await disclosure.count()) === 0) {
        test.skip(true, "this fixture renders no grouped task sections");
      }
      await shoot(page, `${scheme}-desktop-disclosure-open`);
      await disclosure.click();
      await shoot(page, `${scheme}-desktop-disclosure-closed`);
    });

    test("the floating surfaces", async ({ page }) => {
      await gotoFixture(page, "/today");
      await page.keyboard.press("ControlOrMeta+k");
      await page.waitForSelector(".dh-command__panel");
      await shoot(page, `${scheme}-desktop-command-palette`);
      await page.keyboard.press("Escape");

      await gotoFixture(page, "/tasks");
      const controls = await openCollectionControls(page);
      if (!controls.compact) {
        await shoot(page, `${scheme}-desktop-anchored-popover`);
        await page.keyboard.press("Escape");
      }
    });

    test("a panel mid-entrance, and settled", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      const open = row.getByRole("link").first();
      if ((await open.count()) === 0) {
        test.skip(true, "no record link on this row");
      }
      await open.click({ noWaitAfter: true });
      await shootDuring(page, `${scheme}-desktop-panel-during`);
      await page.waitForSelector(".drawer, .dh-inspector", { timeout: 10_000 });
      await shoot(page, `${scheme}-desktop-panel-settled`);
    });

    test("a toast, in its reading position", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      const title = await row.locator(".dh-taskrow__title").innerText();
      await row.getByRole("checkbox", { name: `Complete ${title}` }).check();
      const toast = page.locator(".dh-toast").first();
      await toast.waitFor({ state: "visible", timeout: 10_000 });
      await shoot(page, `${scheme}-desktop-toast`);
    });
  });

  test.describe(`DHDS-08 evidence — phone (${scheme})`, () => {
    test.use({ viewport: PHONE, colorScheme: scheme });

    test("Today and Tasks at 393px", async ({ page }) => {
      for (const [route, name] of [
        ["/today", "today"],
        ["/tasks", "tasks"],
      ] as const) {
        await gotoFixture(page, route);
        await shoot(page, `${scheme}-phone-${name}`);
      }
    });

    test("completion on a phone, before and after", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      const title = await row.locator(".dh-taskrow__title").innerText();
      await shoot(page, `${scheme}-phone-completion-before`);
      await row.getByRole("checkbox", { name: `Complete ${title}` }).check();
      await shoot(page, `${scheme}-phone-completion-after`);
      // The toast must clear the bottom navigation and the home indicator.
      const toast = page.locator(".dh-toast").first();
      if (await toast.isVisible().catch(() => false)) {
        await shoot(page, `${scheme}-phone-toast`);
      }
    });

    test("the bottom sheet and the navigation sheet", async ({ page }) => {
      await gotoFixture(page, "/tasks");
      const controls = await openCollectionControls(page);
      if (controls.compact) {
        await shoot(page, `${scheme}-phone-sheet`);
        await page.keyboard.press("Escape");
      }

      const more = page.getByRole("button", { name: /More/ }).first();
      if ((await more.count()) > 0) {
        await more.click();
        const panel = page.locator(".dh-mobilenav__panel, .dh-sheet").first();
        if (await panel.isVisible().catch(() => false)) {
          await shoot(page, `${scheme}-phone-navigation-sheet`);
        }
      }
    });

    test("contextual actions are available without a hover", async ({
      page,
    }) => {
      await gotoFixture(page, "/tasks");
      const row = firstRow(page);
      await row.scrollIntoViewIfNeeded();
      // §6 — no interaction may become unavailable because a reveal assumed a
      // mouse. On a coarse pointer the affordance is simply drawn.
      await shoot(page, `${scheme}-phone-row-actions`);
    });
  });
}
