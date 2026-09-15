import { test } from "@playwright/test";

/**
 * DS-11 / V3-E2E-01 — the responsive gate that runs on EVERY pull request.
 *
 * The boundary widths, on the surfaces an owner lives in, plus the `md` swap
 * over the dense grids and the overlays at the narrowest phone. ~50 tests and
 * under three minutes, against the 549 tests and 28.5 minutes the full matrix
 * costs.
 *
 * The full matrix has NOT been deleted and has NOT been thinned:
 * `responsive-desktop.spec.ts` and `responsive-phone.spec.ts` still sweep all 50
 * routes across all ten viewports plus the POLISH-01 audit band, under the same
 * titles, and the nightly suite runs them. This file is the fast half of that
 * pair, not a replacement for it.
 *
 * MEASURED before the split: 108 of the gate's other spec files already assert
 * `expectNoHorizontalOverflow` over 94 distinct routes, so the overflow contract
 * was never concentrated in the matrix files. See `e2e/responsive-matrix.ts` for
 * why these widths and not others.
 *
 * The check is deliberately structural (the document never scrolls sideways)
 * rather than pixel snapshots, so it is robust to copy and spacing changes while
 * still catching a genuine layout regression.
 */

import {
  DENSE_GRID_ROUTES,
  OVERLAY_SCENARIOS,
  PR_BOUNDARY_VIEWPORTS,
  PR_CORE_ROUTES,
  PR_MD_VIEWPORT,
  expectRouteFitsViewport,
} from "./responsive-matrix";

test.describe("responsive (PR tier) — the boundary widths", () => {
  for (const path of PR_CORE_ROUTES) {
    for (const viewport of PR_BOUNDARY_VIEWPORTS) {
      test(`${path} at ${viewport.label} (${viewport.width}px)`, async ({
        page,
      }) => {
        await expectRouteFitsViewport(page, path, viewport);
      });
    }
  }
});

test.describe("responsive (PR tier) — the md swap, over the dense grids", () => {
  for (const path of DENSE_GRID_ROUTES) {
    test(`${path} at ${PR_MD_VIEWPORT.width}px`, async ({ page }) => {
      await expectRouteFitsViewport(page, path, PR_MD_VIEWPORT);
    });
  }
});

test.describe("responsive (PR tier) — open overlays at the narrowest phone", () => {
  const viewport = PR_BOUNDARY_VIEWPORTS[0];

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
