/**
 * The August 2026 Material Design 3 UX & interaction audit — evidence capture.
 *
 * Opt-in like every other screenshot pass:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/m3-audit-screenshots.spec.ts --workers=1
 *
 * This pass exists to answer questions the code cannot: what the product
 * actually looks like at the M3 window-size classes, and whether the navigation,
 * density and state treatments the design system DOCUMENTS are the ones a user
 * meets. It asserts almost nothing — it is deliberately evidence, and the audit
 * document reads it. Anything it does assert is an invariant the product already
 * claims elsewhere, so a failure here is a real regression, not a moved goalpost.
 *
 * The widths are M3's own window-size classes rather than DalyHub's breakpoints,
 * because the audit's question is "does the product answer the class correctly",
 * and using the product's own bands to check that would be circular.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3-audit-2026-08",
);

/** M3 window-size classes. */
const COMPACT = { width: 400, height: 860 }; // < 600
const MEDIUM = { width: 700, height: 1000 }; // 600–839
const EXPANDED = { width: 900, height: 1000 }; // 840–1199
const LARGE = { width: 1400, height: 1000 }; // 1200+

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

test.describe("M3 audit — navigation across the window-size classes", () => {
  for (const [name, viewport] of [
    ["compact-400", COMPACT],
    ["medium-700", MEDIUM],
    ["expanded-900", EXPANDED],
    ["large-1400", LARGE],
  ] as const) {
    test(`captures Today at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot(page, `nav-today-${name}`);
    });
  }
});

test.describe("M3 audit — component surfaces", () => {
  test.use({ viewport: LARGE });

  test("captures the settings, forms and feedback surfaces", async ({
    page,
  }) => {
    test.slow();
    await gotoFixture(page, "/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "surface-settings");

    await gotoFixture(page, "/design/forms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "surface-forms");

    await gotoFixture(page, "/design/feedback");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "surface-feedback");

    await gotoFixture(page, "/design/card-family");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "surface-card-family");
  });
});
