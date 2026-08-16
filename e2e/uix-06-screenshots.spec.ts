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

/**
 * Shoot, once every entry animation has finished.
 *
 * The BEFORE run caught the command palette MID-RISE and produced a
 * semi-transparent panel with Today legible through it — which looks exactly
 * like a real dark-mode overlay defect and is not one (`.dh-command__panel` is
 * opaque `surface-raised`). Evidence that can be mistaken for a bug is worse
 * than no evidence, so the capture waits for the animations rather than for a
 * guessed number of milliseconds.
 */
async function shoot(page: Page, name: string) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
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
 * The DETAIL families.
 *
 * The record's URL is DISCOVERED from its collection rather than hard-coded,
 * because the seeded ids are fixture detail — but the capture then navigates to
 * it directly rather than clicking. Clicking looked like the more faithful
 * option and was not: several of these collections open a record through a
 * drawer or an overlay anchored to the row, so "click the first link and shoot"
 * produced a screenshot of the INDEX filed under the detail's name, which is
 * worse than no evidence.
 *
 * The pattern excludes each collection's own view routes (`/meetings/upcoming`,
 * `/assets/recent`) and its create route, so what is captured is a record.
 */
const DETAIL_ENTRIES: ReadonlyArray<readonly [string, string, RegExp]> = [
  ["/projects", "project-detail", /^\/projects\/[^/?]+$/],
  ["/areas", "area-detail", /^\/areas\/[^/?]+$/],
  ["/goals", "goal-detail", /^\/goals\/[^/?]+$/],
  ["/notes", "note-detail", /^\/notes\/[^/?]+$/],
  ["/meetings", "meeting-detail", /^\/meeting\/[^/?]+$/],
  ["/people", "person-detail", /^\/person\/[^/?]+$/],
  ["/assets", "asset-detail", /^\/asset\/[^/?]+$/],
  ["/reviews", "review-detail", /^\/reviews\/(?!new$)[^/?]+$/],
];

/** Collection routes that are VIEWS of the collection, never a record. */
const NOT_A_RECORD =
  /\/(new|create|recent|archived|expiring|service-due|upcoming|saved)$/;

async function openFirstDetail(page: Page, index: string, pattern: RegExp) {
  await gotoFixture(page, index);
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll("main a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter(Boolean);
  });
  const target = href.find((h) => pattern.test(h) && !NOT_A_RECORD.test(h));
  if (!target) return false;
  await gotoFixture(page, target);
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
      for (const [index, name, pattern] of DETAIL_ENTRIES) {
        if (await openFirstDetail(page, index, pattern)) {
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
      for (const [index, name, pattern] of DETAIL_ENTRIES) {
        if (await openFirstDetail(page, index, pattern)) {
          await shoot(page, `${name}-390-${scheme}`);
        }
      }
    });

    test(`captures the phone overlays at 390 (${scheme})`, async ({ page }) => {
      await gotoFixture(page, "/today");
      const capture = page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "Add", exact: true });
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
