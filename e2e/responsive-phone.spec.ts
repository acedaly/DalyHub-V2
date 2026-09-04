/**
 * DS-11 — responsive regression tests, PHONE tier.
 *
 * Proves the baseline the roadmap requires: no horizontal overflow on any shared
 * surface at the phone widths — 320, 375, 390 and 430 portrait plus the 844×390
 * landscape orientation, where HEIGHT is the binding dimension. Every
 * `/design/*` fixture and every real product route is swept across those
 * viewports, the open-overlay sweep runs at the narrow extreme, and the mobile
 * navigation sheet — a phone-only surface — is proven here.
 *
 * The check is deliberately structural (the document never scrolls sideways)
 * rather than pixel snapshots, so it is robust to copy/spacing changes while
 * still catching a genuine layout regression (an unwrapped token, a fixed width,
 * a min-width that overflows a phone).
 *
 * ── Why this file is one of two (V2.8 CONV-03, DEBT-205) ─────────────────────
 * Until CONV-03 this and `responsive-desktop.spec.ts` were a single
 * `responsive.spec.ts` of 519 tests and 1471.6 s — bigger than a partition's
 * share of the gate, so the packer had to give it two EXCLUSIVE partitions and
 * divide it with `--shard`, stranding 536 s of capacity no other partition could
 * reach. Two real files are packed like any other file. The routes, the
 * scenarios and every test title are shared and unchanged — see
 * `e2e/responsive-matrix.ts`.
 */

import { test } from "@playwright/test";

import {
  PHONE_VIEWPORTS,
  expectNoHorizontalOverflow,
  gotoFixture,
  mobileNavigationOpener,
} from "./helpers";
import {
  DESIGN_FIXTURES,
  OVERLAY_SCENARIOS,
  PRODUCT_ROUTES,
  expectRouteFitsViewport,
} from "./responsive-matrix";

test.describe("responsive — no horizontal overflow across the breakpoint matrix", () => {
  for (const path of [...DESIGN_FIXTURES, ...PRODUCT_ROUTES]) {
    for (const viewport of PHONE_VIEWPORTS) {
      test(`${path} at ${viewport.label} (${viewport.width}px)`, async ({
        page,
      }) => {
        await expectRouteFitsViewport(page, path, viewport);
      });
    }
  }
});

test.describe("responsive — open overlays never overflow", () => {
  // The extremes bound the behaviour: the narrowest phone is this file's, the
  // ultra-wide desktop is `responsive-desktop.spec.ts`'s.
  const viewport = PHONE_VIEWPORTS[0];

  for (const scenario of OVERLAY_SCENARIOS) {
    test(`${scenario.title} at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await scenario.run(page);
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
    await mobileNavigationOpener(page).click();
    await page.getByRole("dialog", { name: /navigation/i }).waitFor();
    await expectNoHorizontalOverflow(page);
    // Escape closes it and returns focus to the toggle.
    await page.keyboard.press("Escape");
    await expectNoHorizontalOverflow(page);
  });
});
