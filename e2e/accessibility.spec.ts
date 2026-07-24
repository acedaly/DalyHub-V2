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
  "/today/waiting",
  "/areas",
  "/areas/a-dh",
  "/areas/a-dh?tab=projects",
  "/areas/a-dh?tab=activity",
  // AREA-03 — the real Goals collection (the Alignment view) + a real Goal
  // record with the derived Alignment Summary panel.
  "/goals",
  "/goals/g-launch",
  "/goals/g-launch?tab=activity",
  "/projects",
  // The BARE project record (no Drawer open) — the DEBT-21 regression gate: PROJ-04
  // gave the record a non-skipping heading outline (record h1 → section h2 → content
  // h3), so the bare page is now axe-clean without relying on the Drawer-open scan.
  "/projects/pr-website",
  // PROJ-06 — the complete Projects mobile-facing record tabs are swept by the
  // existing route matrix instead of a separate scanner.
  "/projects/pr-website?tasks=all",
  "/projects/pr-website?tab=links",
  "/projects/pr-website?tab=activity",
  "/tasks",
  // PROJ-05 Slice 4 — the Settings tab (an active, non-archived project), the
  // Archived collection (with a real permanently-archived card) and a bare
  // archived record's resting state.
  "/projects/pr-settings?tab=settings",
  "/projects?state=archived",
  "/projects/pr-archived-demo",
  "/projects/pr-archived-demo?tab=settings",
  // PX-03 — the navigation-shell Coming Soon placeholder routes.
  "/notes",
  "/diary",
  "/meetings",
  "/people",
  "/assets",
  "/reviews",
  "/ai",
  "/settings",
  "/help",
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

  // PROJ-06 — real Projects overlays: the create sheet and shared task Drawer.
  test("Projects new-project sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await page.getByRole("link", { name: "New project" }).first().click();
    await page.getByRole("dialog", { name: "New project" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Areas new-area sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await page.getByRole("link", { name: "New Area" }).first().click();
    await page.getByRole("dialog", { name: "New Area" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Area rename sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByRole("dialog", { name: "Rename Area" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  // AREA-04 — the New Goal sheet and the Goal record's Edit details sheet.
  test("Areas new-goal sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/areas/a-dh?tab=goals");
    await page.getByRole("link", { name: "New Goal" }).first().click();
    await page.getByRole("dialog", { name: "New Goal" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Goal edit-details sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.getByRole("dialog", { name: "Goal details" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Project task Drawer has no violations", async ({ page }) => {
    await gotoFixture(page, "/projects/pr-website");
    await page
      .getByRole("link", { name: "Open Design the homepage" })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await expectNoAxeViolations(page);
  });

  // PROJ-05 Slice 4 — the real Project Settings archive/restore dialogs and the
  // blocked-archive inline alert, over real seeded projects (not the generic
  // /design/settings fixture).
  test("Project Settings archive confirmation dialog has no violations", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-settings?tab=settings");
    await page.getByRole("button", { name: "Archive project…" }).click();
    await page.getByRole("dialog", { name: "Archive this project?" }).waitFor();
    await expectNoAxeViolations(page);
    // Cancel — never actually archive `pr-settings` from an axe scan.
    await page.keyboard.press("Escape");
  });

  test("Project Settings restore confirmation dialog has no violations", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-archived-demo?tab=settings");
    await page.getByRole("button", { name: "Restore project…" }).click();
    await page.getByRole("dialog", { name: "Restore this project?" }).waitFor();
    await expectNoAxeViolations(page);
    // Cancel — `pr-archived-demo` stays permanently archived for other scans.
    await page.keyboard.press("Escape");
  });

  test("a blocked archive's inline alert has no violations", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-archive-blocked-demo?tab=settings");
    await page.getByRole("button", { name: "Archive project…" }).click();
    const dialog = page.getByRole("dialog", { name: "Archive this project?" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Archive project" }).click();
    await dialog.getByRole("alert").waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });
});
