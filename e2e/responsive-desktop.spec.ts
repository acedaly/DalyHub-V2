/**
 * DS-11 — responsive regression tests, TABLET / DESKTOP / WIDE tier.
 *
 * Proves the baseline the roadmap requires: no horizontal overflow on any shared
 * surface from the tablet/`md` boundary through an ultra-wide monitor — 768,
 * 1024, 1280, 1440 and 2560. Every `/design/*` fixture and every real product
 * route is swept across those viewports; the POLISH-01 audit band (820, 900 and
 * 1100 — the laptop/tablet widths the canonical matrix steps over) is swept over
 * the dense grids it was measured on; and the open-overlay sweep runs at the
 * wide extreme.
 *
 * The check is deliberately structural (the document never scrolls sideways)
 * rather than pixel snapshots, so it is robust to copy/spacing changes while
 * still catching a genuine layout regression (an unwrapped token, a fixed width,
 * a min-width that overflows a column).
 *
 * ── Why this file is one of two (V2.8 CONV-03, DEBT-205) ─────────────────────
 * Until CONV-03 this and `responsive-phone.spec.ts` were a single
 * `responsive.spec.ts` of 519 tests and 1471.6 s — bigger than a partition's
 * share of the gate, so the packer had to give it two EXCLUSIVE partitions and
 * divide it with `--shard`, stranding 536 s of capacity no other partition could
 * reach. Two real files are packed like any other file. The routes, the
 * scenarios and every test title are shared and unchanged — see
 * `e2e/responsive-matrix.ts`.
 */

import { test } from "@playwright/test";

import { WIDE_VIEWPORTS } from "./helpers";
import {
  AUDIT_WIDTHS,
  DENSE_GRID_ROUTES,
  DESIGN_FIXTURES,
  OVERLAY_SCENARIOS,
  PRODUCT_ROUTES,
  expectRouteFitsViewport,
} from "./responsive-matrix";

test.describe("responsive — no horizontal overflow across the breakpoint matrix", () => {
  for (const path of [...DESIGN_FIXTURES, ...PRODUCT_ROUTES]) {
    for (const viewport of WIDE_VIEWPORTS) {
      test(`${path} at ${viewport.label} (${viewport.width}px)`, async ({
        page,
      }) => {
        await expectRouteFitsViewport(page, path, viewport);
      });
    }
  }
});

test.describe("responsive — the laptop/tablet band the audit measured", () => {
  for (const path of DENSE_GRID_ROUTES) {
    for (const viewport of AUDIT_WIDTHS) {
      test(`${path} at ${viewport.width}px`, async ({ page }) => {
        await expectRouteFitsViewport(page, path, viewport);
      });
    }
  }
});

test.describe("responsive — open overlays never overflow", () => {
  // The extremes bound the behaviour: the ultra-wide desktop is this file's, the
  // narrowest phone is `responsive-phone.spec.ts`'s.
  const viewport = WIDE_VIEWPORTS[WIDE_VIEWPORTS.length - 1];

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
