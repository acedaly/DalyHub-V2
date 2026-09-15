/**
 * DS-11 / V3-E2E-01 — the EXHAUSTIVE accessibility matrix. NIGHTLY, not on PRs.
 *
 * Every shared `/design/*` fixture and every real product route, scanned with
 * axe in BOTH appearances: 61 routes, 122 tests, ~11 minutes. It is the sweep
 * `accessibility.spec.ts` used to carry, under the same test titles and over the
 * same lists (`e2e/accessibility-matrix.ts`), so nothing it proved before the
 * split stopped being proved — only how often.
 *
 * Why it is not on the PR gate: MEASURED before the split, 93 of the gate's
 * other spec files already run axe over 75 distinct routes, and this file
 * re-proved on 61 routes what a module's own spec proves on the route the change
 * actually touched. The PR gate keeps a representative subset plus every
 * open-overlay scan (see `accessibility.spec.ts`); this is the safety net that
 * catches the route nobody thought to touch.
 *
 * It is listed in `e2e/partitions.json` under `tiers.nightly`, which is what
 * keeps it out of the PR matrix and in the nightly workflow.
 */

import { test } from "@playwright/test";

import { DESIGN_FIXTURES, PRODUCT_ROUTES } from "./accessibility-matrix";
import { expectNoAxeViolations, gotoFixture } from "./helpers";

test.describe("automated accessibility — resting surfaces (light)", () => {
  for (const path of [...DESIGN_FIXTURES, ...PRODUCT_ROUTES]) {
    test(`no WCAG 2.2 AA violations at ${path}`, async ({ page }) => {
      await gotoFixture(page, path);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("automated accessibility — resting surfaces (dark)", () => {
  test.use({ colorScheme: "dark" });

  for (const path of [...DESIGN_FIXTURES, ...PRODUCT_ROUTES]) {
    test(`no WCAG 2.2 AA violations at ${path} (dark)`, async ({ page }) => {
      await gotoFixture(page, path);
      await expectNoAxeViolations(page);
    });
  }
});
