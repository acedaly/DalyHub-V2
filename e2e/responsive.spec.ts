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

// The substantive product surfaces. The remaining module placeholder (/tasks)
// shares the shell + placeholder layout and is covered by the accessibility
// sweep; the responsive matrix focuses on the surfaces with real content so the
// full 7-viewport sweep stays fast at `workers: 1`.
const PRODUCT_ROUTES = [
  "/",
  "/today",
  // AREA-01 — real Areas collection + record tabs.
  "/areas",
  "/areas/a-dh",
  "/areas/a-dh?tab=projects",
  "/areas/a-dh?tab=activity",
  // AREA-03 — the real Goals collection (the Alignment view) + a real Goal
  // record with the derived Alignment Summary panel.
  "/goals",
  "/goals/g-launch",
  "/goals/g-launch?tab=activity",
  // PROJ-06 — the complete Projects collection + record surface across the
  // canonical matrix: collection filters/cards, default Tasks tab, Key links,
  // Activity Timeline and Settings.
  "/projects",
  "/projects/pr-website",
  "/projects/pr-website?tasks=all",
  "/projects/pr-website?tab=links",
  "/projects/pr-website?tab=activity",
  // PROJ-05 Slice 4 — the Settings tab, the Archived collection and a bare
  // archived record across the full breakpoint matrix.
  "/projects/pr-settings?tab=settings",
  "/projects?state=archived",
  "/projects/pr-archived-demo",
] as const;

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

    // PROJ-05 Slice 4 — the Project Settings archive/restore confirmation
    // dialogs at the viewport extremes.
    test(`Project Settings archive dialog at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects/pr-settings?tab=settings");
      await page.getByRole("button", { name: "Archive project…" }).click();
      await page
        .getByRole("dialog", { name: "Archive this project?" })
        .waitFor();
      await expectNoHorizontalOverflow(page);
      // Cancel — never actually archive `pr-settings` from a responsive scan.
      await page.keyboard.press("Escape");
    });

    test(`Project Settings restore dialog at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects/pr-archived-demo?tab=settings");
      await page.getByRole("button", { name: "Restore project…" }).click();
      await page
        .getByRole("dialog", { name: "Restore this project?" })
        .waitFor();
      await expectNoHorizontalOverflow(page);
      // Cancel — `pr-archived-demo` stays permanently archived for other scans.
      await page.keyboard.press("Escape");
    });

    test(`Projects new-project sheet at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects");
      await page.getByRole("link", { name: "New project" }).first().click();
      await page.getByRole("dialog", { name: "New project" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });

    test(`Areas new-area sheet at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/areas");
      await page.getByRole("link", { name: "New Area" }).first().click();
      await page.getByRole("dialog", { name: "New Area" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });

    test(`Area rename sheet at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/areas/a-dh");
      await page.getByRole("button", { name: "Rename" }).click();
      await page.getByRole("dialog", { name: "Rename Area" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });

    // AREA-04 — the New Goal sheet (opened from the Area record's Goals tab)
    // and the Goal record's Edit details sheet (target date + definition of
    // done), at the viewport extremes.
    test(`Areas new-goal sheet at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/areas/a-dh?tab=goals");
      await page.getByRole("link", { name: "New Goal" }).first().click();
      await page.getByRole("dialog", { name: "New Goal" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });

    test(`Goal edit-details sheet at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/goals/g-launch");
      await page.getByRole("button", { name: "Edit details" }).click();
      await page.getByRole("dialog", { name: "Goal details" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });

    test(`Project task Drawer at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects/pr-website");
      await page
        .getByRole("link", { name: "Open Design the homepage" })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
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
