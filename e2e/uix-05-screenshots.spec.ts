/**
 * UIX-05 — the People / Assets / Reviews / Analytics / Settings screenshot matrix.
 *
 * The same comparative shape as `uix-01`/`uix-02`/`uix-03`: ONE spec captures the
 * whole matrix and writes it under a `before-` prefix or none, chosen by an
 * environment variable, so nothing between a `before-` and its pair differs
 * except the product.
 *
 *     node e2e/today-fixtures.mjs modules
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test \
 *       e2e/uix-05-screenshots.spec.ts        # on the base commit
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       e2e/uix-05-screenshots.spec.ts        # on this branch
 *
 * The `modules` scenario is the dataset because the standard dev seed contains no
 * People, Assets or Reviews at all — it only knows how to CLEAN them up after the
 * journey specs. Without a fixture the five surfaces this pass redesigned would
 * all photograph as their empty states, which is the one thing a redesign's
 * evidence must not be.
 *
 * The phone contexts declare `isMobile`/`hasTouch` because a desktop Chromium
 * narrowed to 390px still answers `(hover: hover)` — without it this photographs
 * the mouse layout at phone width and files it under the phone.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-05-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

const LAPTOP = { width: 1280, height: 1000 };
const WIDE = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  // The identity marks, progress bars and chart fills all animate their first
  // paint; a screenshot taken mid-transition is evidence of nothing.
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/**
 * The surfaces, and the one route each is photographed at.
 *
 * `/analytics` does not exist before this pass, so its `before-` capture is the
 * shell's own not-found surface. That is the honest baseline for "this module did
 * not exist" and is exactly what the comparison should show.
 */
const SURFACES = [
  { path: "/people", name: "people" },
  { path: "/assets", name: "assets" },
  { path: "/reviews", name: "reviews" },
  { path: "/analytics", name: "analytics" },
  { path: "/settings", name: "settings" },
] as const;

/* -------------------------------------------------------------------------- */
/* Desktop                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("desktop 1280 — light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  for (const surface of SURFACES) {
    test(`${surface.name} 1280 light`, async ({ page }) => {
      await gotoFixture(page, surface.path);
      await shoot(page, `${surface.name}-1280-light`);
    });
  }

  // The People circle rail and the catch-up filter are the collection's own
  // lens, so one capture shows the rail doing its job rather than only its
  // default state.
  test("people circle 1280 light", async ({ page }) => {
    await gotoFixture(page, "/people?circle=personal");
    await shoot(page, "people-circle-1280-light");
  });

  // The longest Analytics range, so the trend has a shape rather than a week of
  // daily points.
  test("analytics quarter 1280 light", async ({ page }) => {
    await gotoFixture(page, "/analytics?range=quarter");
    await shoot(page, "analytics-quarter-1280-light");
  });

  // A Settings section, not just the index — the grouped rail beside content.
  test("settings section 1280 light", async ({ page }) => {
    await gotoFixture(page, "/settings?section=date-time");
    await shoot(page, "settings-section-1280-light");
  });
});

test.describe("desktop 1440 — light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  for (const surface of SURFACES) {
    test(`${surface.name} 1440 light`, async ({ page }) => {
      await gotoFixture(page, surface.path);
      await shoot(page, `${surface.name}-1440-light`);
    });
  }
});

test.describe("desktop 1280 — dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  for (const surface of SURFACES) {
    test(`${surface.name} 1280 dark`, async ({ page }) => {
      await gotoFixture(page, surface.path);
      await shoot(page, `${surface.name}-1280-dark`);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Phone                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("phone 390 — light", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  for (const surface of SURFACES) {
    test(`${surface.name} 390 light`, async ({ page }) => {
      await gotoFixture(page, surface.path);
      await shoot(page, `${surface.name}-390-light`);
    });
  }

  /*
   * The Settings phone composition is TWO screens, and the second one is the
   * half a single capture of `/settings` cannot show.
   */
  test("settings section 390 light", async ({ page }) => {
    await gotoFixture(page, "/settings?section=general");
    await shoot(page, "settings-section-390-light");
  });
});

test.describe("phone 390 — dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  for (const surface of SURFACES) {
    test(`${surface.name} 390 dark`, async ({ page }) => {
      await gotoFixture(page, surface.path);
      await shoot(page, `${surface.name}-390-dark`);
    });
  }
});
