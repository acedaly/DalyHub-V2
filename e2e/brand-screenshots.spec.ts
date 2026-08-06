/**
 * BRAND-01 — the branding review pass.
 *
 * The approved identity is a visual decision, so the deliverable a reviewer
 * actually judges is a set of images, not a diff of coordinates. This captures
 * exactly the surfaces the brief asks to see:
 *
 *   - the desktop sidebar in Daly Light and in Daly Dark;
 *   - the phone top bar and the phone navigation sheet;
 *   - the branded full-lockup surface (About);
 *   - the app icon at 16, 32, 48, 180, 192 and 512 px;
 *   - the Apple full-bleed icon;
 *   - the maskable icon under circle, rounded-square and squircle masks.
 *
 * The last three come from `/design/app-icon`, which renders the REAL generated
 * files at their true pixel sizes — never upscaled, so a size that looks wrong
 * here looks wrong on a device.
 *
 * Opt-in, exactly like the DS-14, THEME-02, MOBILE-01 and TASKS-03 passes:
 * skipped unless `CAPTURE_SCREENSHOTS=1`, so the ordinary gate neither slows
 * down nor writes into the repository. Run it with:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/brand-screenshots.spec.ts
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "brand-01-2026-08",
);

const DESKTOP = { width: 1440, height: 900 };
/** iPhone 15/16 logical resolution. */
const IPHONE = { width: 393, height: 852 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.describe("BRAND-01 — the in-application identity", () => {
  test("captures the desktop sidebar in both appearances", async ({ page }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);

    // M3-01 — appearance belongs to the operating system, so the capture
    // emulates the scheme rather than storing a preference (ADR-074).
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/today");

      const banner = page.getByRole("banner");
      await expect(banner.getByText("DalyHub")).toBeVisible();

      // The rail alone, cropped: the identity is the subject, not the page.
      await page
        .locator(".dh-sidebar--rail")
        .screenshot({ path: join(OUT, `sidebar-${scheme}.png`) });
      await page.screenshot({
        path: join(OUT, `shell-${scheme}.png`),
        fullPage: false,
      });
    }

    await page.emulateMedia({ colorScheme: "light" });
  });

  test("captures the phone top bar and navigation sheet", async ({ page }) => {
    test.slow();
    await page.setViewportSize(IPHONE);
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/today");

    await page.screenshot({ path: join(OUT, "mobile-top-bar.png") });

    // The navigation sheet is where the phone carries the full identity.
    await page
      .locator("[data-testid='bottom-nav']")
      .getByRole("button", { name: "More" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("DalyHub").first()).toBeVisible();
    await page.screenshot({ path: join(OUT, "mobile-nav-sheet.png") });
    await page.keyboard.press("Escape");
  });

  test("captures the offline surface's branding", async ({ page }) => {
    // The one document that can be launched with no connection, so the one that
    // most needs to look like DalyHub rather than a browser error page.
    test.slow();
    await page.setViewportSize(DESKTOP);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/offline");
    await expect(
      page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
    ).toBeVisible();
    await page
      .locator(".dh-offline-page__header")
      .screenshot({ path: join(OUT, "offline-header.png") });
  });

  test("captures the full lockup on About, in both appearances", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/about");
      // The wordmark and tagline are live text, so they are findable as text.
      await expect(page.getByText("Your life. Connected.")).toBeVisible();
      await page
        .locator(".dh-brand-lockup")
        .first()
        .screenshot({ path: join(OUT, `lockup-${scheme}.png`) });
      await page.screenshot({ path: join(OUT, `about-${scheme}.png`) });
    }

    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("BRAND-01 — the generated icon assets", () => {
  test("captures the icon review surface", async ({ page }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/design/app-icon");
    await expect(
      page.getByRole("heading", { level: 1, name: "DalyHub app icon" }),
    ).toBeVisible();

    // Every size, at its true pixel size.
    await page
      .locator("section", { has: page.locator("#sizes-heading") })
      .screenshot({ path: join(OUT, "icon-sizes.png") });

    // The Apple full-bleed tile on its own, at 180 px.
    await page
      .locator('img[src="/icons/apple-touch-icon-v2.png"]')
      .screenshot({ path: join(OUT, "apple-touch-icon.png") });

    // The maskable asset under circle, rounded-square and squircle masks.
    await page
      .locator("section", { has: page.locator("#masks-heading") })
      .screenshot({ path: join(OUT, "icon-maskable-masks.png") });

    // The in-app glyph at the sizes the product renders it at.
    await page
      .locator("section", { has: page.locator("#in-app-heading") })
      .screenshot({ path: join(OUT, "in-app-mark-sizes.png") });

    // Against light and dark browser chrome.
    await page
      .locator("section", { has: page.locator("#contrast-heading") })
      .screenshot({ path: join(OUT, "icon-against-chrome.png") });

    await page.screenshot({
      path: join(OUT, "icon-review-desktop.png"),
      fullPage: true,
    });
  });
});
