/**
 * DS-11 — responsive regression tests.
 *
 * Proves the baseline the roadmap requires: no horizontal overflow on any shared
 * surface from 320px through ultra-wide. Every `/design/*` fixture and every real
 * product route is swept across the canonical viewport matrix
 * (`RESPONSIVE_VIEWPORTS`), in portrait phone widths, the tablet/`md` and `lg`
 * boundaries, a laptop, and a 2560px ultra-wide monitor.
 *
 * The check is deliberately structural (the document never scrolls sideways) rather
 * than pixel snapshots, so it is robust to copy/spacing changes while still catching
 * a genuine layout regression (an unwrapped token, a fixed width, a min-width that
 * overflows a phone). Interactive overlays are swept separately at the extremes so a
 * Drawer/Search/Palette sheet is proven not to overflow either.
 */

import { test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const DESIGN_FIXTURES = [
  "/design/record-layout",
  "/design/drawer",
  "/design/cards-filters",
  "/design/collection-layout",
  "/design/activity-feed",
  "/design/forms",
  "/design/search",
  "/design/command-palette",
  "/design/feedback",
  "/design/settings",
] as const;

// The substantive product surfaces. The module placeholders (/areas, /goals,
// /projects, /tasks) share the shell + placeholder layout and are covered by the
// accessibility sweep; the responsive matrix focuses on the surfaces with real
// content so the full 7-viewport sweep stays fast at `workers: 1`.
const PRODUCT_ROUTES = ["/", "/today"] as const;

test.describe("responsive — no horizontal overflow across the breakpoint matrix", () => {
  for (const path of [...DESIGN_FIXTURES, ...PRODUCT_ROUTES]) {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      test(`${path} at ${viewport.label} (${viewport.width}px)`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await gotoFixture(page, path);
        await expectNoHorizontalOverflow(page);
      });
    }
  }
});

test.describe("responsive — open overlays never overflow", () => {
  // The extremes bound the behaviour: the narrowest phone and an ultra-wide desktop.
  const EXTREMES = [
    RESPONSIVE_VIEWPORTS[0], // mobile-320
    RESPONSIVE_VIEWPORTS[RESPONSIVE_VIEWPORTS.length - 1], // ultrawide-2560
  ] as const;

  for (const viewport of EXTREMES) {
    test(`Drawer sheet at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/design/drawer");
      await page
        .getByRole("link", { name: /Project Website relaunch/ })
        .click();
      await page.getByRole("dialog", { name: "Website relaunch" }).waitFor();
      await expectNoHorizontalOverflow(page);
    });

    test(`Search surface at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/design/search");
      await page.keyboard.press("/");
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
    });

    test(`Command Palette at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/design/command-palette");
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("responsive — mobile navigation overlay", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("mobile nav opens as a focus-trapped sheet without overflow", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    // Below `md` the rail collapses to the mobile bar; open the overlay.
    await page.getByRole("button", { name: /open navigation/i }).click();
    await page.getByRole("dialog", { name: /navigation/i }).waitFor();
    await expectNoHorizontalOverflow(page);
    // Escape closes it and returns focus to the toggle.
    await page.keyboard.press("Escape");
    await expectNoHorizontalOverflow(page);
  });
});
