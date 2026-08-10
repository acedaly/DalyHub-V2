import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * UIX-06 — the whole-application convergence evidence pass.
 *
 * UIX-01 through UIX-05 each captured the module they redesigned. UIX-06's
 * question is different and cannot be answered from those sets: it is whether
 * THIRTEEN modules, redesigned one at a time over five passes, read as one
 * product. That needs every index, every detail family and the shared overlays
 * captured in ONE run, at the SAME widths, in BOTH appearances — so the sheet
 * can be laid out side by side and the outlier found by eye.
 *
 * Opt-in, like every other capture pass in this repository, so the ordinary gate
 * neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/uix-06-screenshots.spec.ts
 *
 * `SHOT_PREFIX=before` writes the same set under a `before-` prefix; that is how
 * the comparison set in `docs/design/assets/uix-06-2026-08/` was produced.
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-06-2026-08",
);

const PREFIX = process.env.SHOT_PREFIX ? `${process.env.SHOT_PREFIX}-` : "";

const LAPTOP = { width: 1280, height: 900 };
const NARROW = { width: 320, height: 720 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/**
 * Every module's INDEX, in navigation order. This is the list the contact sheet
 * is built from, so it is deliberately the complete set rather than a sample —
 * the whole point is that the odd one out is found by comparison.
 */
const INDEX_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["/today", "today"],
  ["/tasks", "tasks"],
  ["/projects", "projects"],
  ["/areas", "areas"],
  ["/goals", "goals"],
  ["/notes", "notes"],
  ["/diary", "diary"],
  ["/meetings", "meetings"],
  ["/people", "people"],
  ["/assets", "assets"],
  ["/reviews", "reviews"],
  ["/analytics", "analytics"],
  ["/settings", "settings"],
];

/**
 * The DETAIL families. Each is reached through the product rather than by a
 * hard-coded id, because the seeded ids are fixture detail and the navigation
 * itself is part of what is being reviewed.
 */
const DETAIL_ENTRIES: ReadonlyArray<
  readonly [string, string, string /* selector for the first record link */]
> = [
  ["/projects", "project-detail", "a[href^='/projects/']"],
  ["/areas", "area-detail", "a[href^='/areas/']"],
  ["/goals", "goal-detail", "a[href^='/goals/']"],
  ["/notes", "note-detail", "a[href^='/notes/']"],
  ["/meetings", "meeting-detail", "a[href^='/meeting/']"],
  ["/people", "person-detail", "a[href^='/person/']"],
  ["/assets", "asset-detail", "a[href^='/asset/']"],
  ["/reviews", "review-detail", "a[href^='/reviews/']"],
  ["/tasks", "task-detail", "a[href^='/tasks/']"],
];

async function openFirstDetail(page: Page, index: string, selector: string) {
  await gotoFixture(page, index);
  const link = page.locator(selector).first();
  if ((await link.count()) === 0) return false;
  await link.click();
  await page.waitForLoadState("networkidle");
  return true;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`uix-06 desktop ${scheme}`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test(`captures every index at 1280 (${scheme})`, async ({ page }) => {
      for (const [route, name] of INDEX_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-1280-${scheme}`);
      }
    });

    test(`captures every detail family at 1280 (${scheme})`, async ({
      page,
    }) => {
      for (const [index, name, selector] of DETAIL_ENTRIES) {
        if (await openFirstDetail(page, index, selector)) {
          await shoot(page, `${name}-1280-${scheme}`);
        }
      }
    });

    test(`captures the shell surfaces at 1280 (${scheme})`, async ({
      page,
    }) => {
      // The not-found route — a real product surface, and the one most often
      // left on a framework default.
      await page.goto("/no-such-route");
      await page.waitForLoadState("networkidle");
      await shoot(page, `not-found-1280-${scheme}`);

      // Global search, opened from the shell's own control.
      await gotoFixture(page, "/today");
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(400);
      await shoot(page, `command-palette-1280-${scheme}`);
      await page.keyboard.press("Escape");

      // Creation flow — the shared capture surface at desktop width.
      await page.keyboard.press("c");
      await page.waitForTimeout(400);
      await shoot(page, `capture-1280-${scheme}`);
      await page.keyboard.press("Escape");
    });

    test(`captures the shared overlays at 1280 (${scheme})`, async ({
      page,
    }) => {
      await gotoFixture(page, "/tasks");
      // Priority — the select whose option list has clipped before.
      const priority = page
        .getByRole("button", { name: /priority/i })
        .or(page.locator("[data-testid='task-priority-trigger']"))
        .first();
      if (await priority.count()) {
        await priority.click({ trial: false }).catch(() => {});
        await page.waitForTimeout(300);
        await shoot(page, `overlay-priority-1280-${scheme}`);
        await page.keyboard.press("Escape");
      }

      // A representative dialog: the record lifecycle confirmation.
      await gotoFixture(page, "/settings");
      await shoot(page, `settings-detail-1280-${scheme}`);
    });
  });

  test.describe(`uix-06 laptop-hybrid ${scheme}`, () => {
    test.use({ viewport: TABLET, colorScheme: scheme });

    test(`captures the hybrid width at 1024 (${scheme})`, async ({ page }) => {
      for (const [route, name] of INDEX_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-1024-${scheme}`);
      }
    });
  });

  test.describe(`uix-06 phone ${scheme}`, () => {
    test.use({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures every index at 390 (${scheme})`, async ({ page }) => {
      for (const [route, name] of INDEX_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-390-${scheme}`);
      }
    });

    test(`captures the phone detail families at 390 (${scheme})`, async ({
      page,
    }) => {
      for (const [index, name, selector] of DETAIL_ENTRIES) {
        if (await openFirstDetail(page, index, selector)) {
          await shoot(page, `${name}-390-${scheme}`);
        }
      }
    });

    test(`captures the phone overlays at 390 (${scheme})`, async ({ page }) => {
      await gotoFixture(page, "/today");
      const capture = page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "Capture" });
      if (await capture.count()) {
        await capture.click();
        await page.getByTestId("capture-sheet").waitFor();
        await shoot(page, `capture-390-${scheme}`);
        await page.keyboard.press("Escape");
      }

      const more = page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "More" });
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(300);
        await shoot(page, `navigation-390-${scheme}`);
        await page.keyboard.press("Escape");
      }
    });
  });

  test.describe(`uix-06 narrow ${scheme}`, () => {
    test.use({
      viewport: NARROW,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures the 320 stress test (${scheme})`, async ({ page }) => {
      for (const [route, name] of INDEX_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-320-${scheme}`);
      }
    });
  });
}
