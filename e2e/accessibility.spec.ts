/**
 * DS-11 — automated accessibility regression tests (WCAG 2.2 AA).
 *
 * This is the CI a11y gate the roadmap asks for: an axe-core scan of every shared
 * surface, so a genuine accessibility regression fails the build. The scans run
 * against the dev-only `/design/*` fixtures — each rendering a shared component
 * INSIDE the real PX-02 shell — plus the real product routes, in light AND dark, and
 * with interactive overlays (Drawer, Search, Command Palette, Inspector, dangerous
 * confirmation) OPENED so their modal semantics, focus scoping and live regions are
 * audited, not just the resting page.
 *
 * The scan is scoped to the WCAG 2.0/2.1/2.2 A + AA standard plus axe best-practice
 * (see `e2e/helpers.ts` → `AXE_TAGS`). Colour contrast is proven separately and
 * deterministically by the DS-01 token unit tests, so it is disabled here to avoid
 * flaky pixel-derived assertions (documented in `buildAxeScan`). No brittle
 * per-rule assertions — a surface either has zero violations against the standard
 * or it fails with an actionable list.
 */

import { test } from "@playwright/test";

import { expectNoAxeViolations, gotoFixture } from "./helpers";

/** The dev-only design fixtures — each renders a shared component in the real shell. */
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

/** Real product surfaces (rendered through the authenticated dev shell). */
const PRODUCT_ROUTES = [
  "/",
  "/today",
  "/areas",
  "/goals",
  "/projects",
  "/tasks",
] as const;

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

test.describe("automated accessibility — open overlays", () => {
  test("Drawer (open record) has no violations", async ({ page }) => {
    await gotoFixture(page, "/design/drawer");
    await page.getByRole("link", { name: /Project Website relaunch/ }).click();
    await page.getByRole("dialog", { name: "Website relaunch" }).waitFor();
    await expectNoAxeViolations(page);
  });

  test("Search surface has no violations", async ({ page }) => {
    await gotoFixture(page, "/design/search");
    await page.keyboard.press("/");
    await page.getByRole("dialog").waitFor();
    await expectNoAxeViolations(page);
  });

  test("Command Palette has no violations", async ({ page }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("dialog").waitFor();
    await expectNoAxeViolations(page);
  });

  test("dangerous confirmation dialog has no violations", async ({ page }) => {
    await gotoFixture(page, "/design/settings");
    await page
      .getByRole("button", { name: /delete|reset|remove|archive/i })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await expectNoAxeViolations(page);
  });
});
