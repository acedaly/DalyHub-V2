import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * THEME-02 — the Modern Light / Modern Dark visual QA pass.
 *
 * Captures the surfaces the milestone is judged on, in BOTH halves of the pair, at
 * a desktop and a phone viewport, into the existing product-audit asset convention
 * so a reviewer can compare the two themes without running the app. Every shot is
 * taken against the same seeded development database the journeys run on, through
 * the real routes — nothing here is a mock or a staged screen.
 *
 * The theme is stored through the product's OWN preferences action, so what these
 * images show is the theme an owner would actually get, resolved server-side on the
 * first byte, rather than a class toggled by the test.
 *
 * Opt-in, exactly like the MOBILE-01 and TASKS-03 passes: skipped unless
 * `CAPTURE_SCREENSHOTS=1`, so the ordinary gate neither slows down nor writes into
 * the repository. Run it with:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/theme-02-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "theme-02-2026-08",
);

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const THEMES = [
  { id: "modern-light", slug: "light" },
  { id: "modern-dark", slug: "dark" },
] as const;

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Store the owner's theme through the real, validated preferences action. */
async function useTheme(page: Page, themeId: string): Promise<void> {
  const response = await page.request.post("/preferences/theme", {
    form: { theme: themeId },
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

/** The surfaces the visual-QA brief names, by the route that renders them. */
const DESKTOP_SURFACES = [
  { path: "/today", name: "today" },
  { path: "/tasks", name: "tasks" },
  { path: "/projects/pr-website", name: "project-detail" },
  { path: "/settings?section=appearance", name: "settings" },
] as const;

const PHONE_SURFACES = [
  { path: "/today", name: "today" },
  { path: "/tasks", name: "tasks" },
] as const;

test.describe("desktop", () => {
  test.use({ viewport: DESKTOP });

  for (const theme of THEMES) {
    test(`captures the desktop surfaces in ${theme.id}`, async ({ page }) => {
      test.slow();
      await useTheme(page, theme.id);

      for (const surface of DESKTOP_SURFACES) {
        await gotoFixture(page, surface.path);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme.id,
        );
        await shoot(page, `${surface.name}-desktop-${theme.slug}`);
      }
    });
  }
});

test.describe("phone", () => {
  test.use({ viewport: PHONE });

  for (const theme of THEMES) {
    test(`captures the phone surfaces in ${theme.id}`, async ({ page }) => {
      test.slow();
      await useTheme(page, theme.id);

      for (const surface of PHONE_SURFACES) {
        await gotoFixture(page, surface.path);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme.id,
        );
        await shoot(page, `${surface.name}-mobile-${theme.slug}`);
      }
    });
  }
});

test.describe("overlays", () => {
  test.use({ viewport: DESKTOP });

  for (const theme of THEMES) {
    test(`captures a floating surface in ${theme.id}`, async ({ page }) => {
      // Menus, palettes and dialogs are the surfaces a theme most often forgets,
      // because they are painted on an elevated surface rather than the page.
      await useTheme(page, theme.id);
      await gotoFixture(page, "/today");
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog")).toBeVisible();
      await shoot(page, `command-palette-desktop-${theme.slug}`);
    });
  }
});

test.afterAll(async ({ request }) => {
  // Leave the stored preference as the shipped default, so a capture run cannot
  // change the appearance the rest of the suite runs under.
  await request.post("/preferences/theme", {
    form: { theme: "system" },
    maxRedirects: 0,
  });
});
