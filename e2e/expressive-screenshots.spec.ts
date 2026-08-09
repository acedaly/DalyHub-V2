import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * M3X — the Material 3 Expressive screenshot pass.
 *
 * Captures every surface the Expressive work touches, at the widths the brief
 * names and in BOTH appearances, into `docs/design/assets/m3x-2026-08/`. Like
 * every other screenshot pass in this repository it is **opt-in**, so the
 * ordinary gate neither slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/expressive-screenshots.spec.ts
 *
 * `SHOT_PREFIX=before` captures the same set under a `before-` prefix, which is
 * how the audit's evidence set was produced.
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3x-2026-08",
);

const PREFIX = process.env.SHOT_PREFIX ? `${process.env.SHOT_PREFIX}-` : "";

const LAPTOP = { width: 1280, height: 900 };
const WIDE = { width: 1440, height: 950 };
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

/** The desktop surfaces, at one width and one appearance. */
const DESKTOP_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["/today", "today"],
  ["/tasks", "tasks"],
  ["/projects", "projects"],
  ["/goals", "goals"],
  ["/areas", "areas"],
  ["/notes", "notes"],
  ["/meetings", "meetings"],
  ["/diary", "diary"],
  ["/reviews", "analytics"],
  ["/settings", "settings"],
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`desktop ${scheme}`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test(`captures the desktop surfaces at 1280 (${scheme})`, async ({
      page,
    }) => {
      for (const [route, name] of DESKTOP_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-1280-${scheme}`);
      }
    });
  });

  test.describe(`wide ${scheme}`, () => {
    test.use({ viewport: WIDE, colorScheme: scheme });

    test(`captures the wide surfaces at 1440 (${scheme})`, async ({ page }) => {
      for (const route of ["/today", "/projects", "/goals"] as const) {
        await gotoFixture(page, route);
        await shoot(page, `${route.slice(1)}-1440-${scheme}`);
      }
      // The Notes DIRECTORY, then the editor it opens — the two surfaces the
      // available width matters most for.
      await gotoFixture(page, "/notes");
      await shoot(page, `notes-directory-1440-${scheme}`);
      const firstNote = page.locator(".dh-card__open").first();
      if (await firstNote.count()) {
        await firstNote.click();
        await page.waitForLoadState("networkidle");
      }
      await shoot(page, `notes-editor-1440-${scheme}`);
    });
  });

  test.describe(`phone ${scheme}`, () => {
    test.use({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures the phone surfaces at 390 (${scheme})`, async ({ page }) => {
      for (const [route, name] of DESKTOP_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-390-${scheme}`);
      }

      // Quick capture, from the bottom bar.
      await gotoFixture(page, "/today");
      await page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "Capture" })
        .click();
      await page.getByTestId("capture-sheet").waitFor();
      await shoot(page, `quick-capture-390-${scheme}`);
      await page.keyboard.press("Escape");

      // The complete navigation sheet.
      await page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "More" })
        .click();
      await page.waitForTimeout(300);
      await shoot(page, `navigation-390-${scheme}`);
    });
  });
}
