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

import { expect, test } from "@playwright/test";

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
  // PWA-01 — the icon review surface.
  "/design/app-icon",
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
  // PX-04 — the Goals "Deleted" lifecycle view (the durable restore surface).
  "/goals?state=deleted",
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
  "/projects/pr-website?tab=linked",
  "/projects/pr-website?tab=activity",
  "/tasks",
  // PROJ-05 Slice 4 — the Settings tab (an active, non-archived project), the
  // Archived collection (with a real permanently-archived card) and a bare
  // archived record's resting state.
  "/projects/pr-settings?tab=settings",
  "/projects?state=archived",
  "/projects/pr-archived-demo",
  "/projects/pr-archived-demo?tab=settings",
  // NOTES-01B/NOTES-01C — the real Notes collection, including its
  // Active/Deleted lifecycle filter (the record itself, and its Split/Preview
  // editor states, are covered by `e2e/notes.spec.ts`'s own journey).
  "/notes",
  "/notes?state=deleted",
  // DS-14 — the Reading reference implementation, audited in the shared sweep
  // rather than only in the Notes journey. The restyle moves the note body into
  // a Reading region with its own family, size and measure; contrast, focus
  // order and landmark structure all have to survive that.
  "/notes/n-search-e2e",
  // PEOPLE-01 — the real People collection, its Recent/Archived sub-views and the
  // create-person page (the record itself is covered by `e2e/people.spec.ts`).
  "/people",
  "/people/recent",
  "/people/archived",
  "/new/person",
  // ASSET-01 — the Assets collection, its date-driven sub-views and the create
  // page (the record itself is covered by `e2e/assets.spec.ts`).
  "/assets",
  "/assets/recent",
  "/assets/expiring",
  "/assets/service-due",
  "/assets/archived",
  "/new/asset",
  // HABITS-01 — the Habits collection, its Archived view and the creation form
  // (whose weekday toggle group is a new shared control, so it earns its own
  // place in the sweep rather than only in the module's own axe pass).
  "/habits",
  "/habits/archived",
  "/habits/new",
  // PX-03 — the remaining navigation-shell Coming Soon placeholder routes.
  "/diary",
  "/meetings",
  "/reviews",
  "/ai",
  "/settings",
  "/help",
  // PWA — the offline surfaces. `/offline` renders OUTSIDE the app shell (it is
  // the cacheable shell document), so it is the one product route whose
  // landmarks, headings and focus order are entirely its own; and the Settings
  // offline section carries three destructive controls and a live status region.
  "/offline",
  "/settings?section=offline",
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
    await page.getByRole("dialog", { name: "New Project" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Areas new-area sheet has no violations", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await page.getByRole("link", { name: "New area" }).first().click();
    await page.getByRole("dialog", { name: "New Area" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  // DS-16 — the rename Drawer is gone: the Area's heading IS the control, so the
  // surface to scan is the record with its inline editor OPEN. That is the state
  // an owner is actually in while renaming, and it is where a labelling or
  // focus-order violation would now live.
  test("Area inline rename has no violations while editing", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("button", { name: /^Area name:/ }).click();
    await expect(
      page.getByRole("textbox", { name: "Area name" }),
    ).toBeFocused();
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

  // EDIT-02 — the Drawer form is gone; the same two values are edited in place,
  // so the surfaces to scan are the inline date popover and the inline
  // multiline editor.
  test("Goal inline target-date popover has no violations", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("button", { name: /^Target date: / }).click();
    await page.getByRole("dialog", { name: "Edit target date" }).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  test("Goal inline definition-of-done editor has no violations", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("button", { name: /^Definition of done: / }).click();
    await page.getByRole("textbox", { name: "Definition of done" }).waitFor();
    await expectNoAxeViolations(page);
  });

  test("Task priority inline menu has no violations", async ({ page }) => {
    await gotoFixture(page, "/projects/pr-website");
    await page
      .getByRole("link", { name: "Open Design the homepage" })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    /*
     * Scoped to the DRAWER. DHDS-10 made the Project record's own task rows
     * inline-editable, so the page behind the Drawer now draws its own
     * `Priority: …` trigger for every row — the page-wide locator resolved to
     * two elements and failed Playwright's strict mode. The Drawer's is the one
     * this scan is about, and it is the only one that opens over the dialog.
     */
    await drawer.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menu").waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
  });

  // DS-12 — the shared overflow (⋯) menu, open, on a real record. It is the ONE
  // home for lifecycle actions, so it is scanned like every other overlay.
  test("record overflow menu has no violations", async ({ page }) => {
    await gotoFixture(page, "/projects/pr-website");
    await page.getByRole("button", { name: /^More actions for / }).click();
    await page.getByRole("menu").waitFor();
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

  test("a blocked archive’s inline alert has no violations", async ({
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

/*
 * RECALL-00-D (DEBT-225) — the desktop top bar's search control keeps its
 * accessible name through the collapsed-rail tablet band.
 *
 * The button's ONLY name source is its label span, and `shell.css` used to
 * remove it with `display:none` below 64rem while the desktop bar renders from
 * 48rem up — so across ~769–1023px the product's primary retrieval entry point
 * was an unnamed <button> (axe `button-name`, WCAG 4.1.2). The jsdom unit test
 * could not catch it (no stylesheet loads there), so the proof lives here, at
 * real band widths, with no axe rule disabled beyond the suite's documented
 * global set. Falsification: restore `display:none` on the label and the 820px
 * assertions fail while 1024px still passes.
 */
test.describe("RECALL-00-D — the search control is named at every shell width", () => {
  test("the search button keeps its accessible name at 820px, and the band is axe-clean", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await gotoFixture(page, "/tasks");
    const search = page.getByRole("search", { name: "Search DalyHub" });
    const button = search.getByRole("button");
    await expect(button).toBeVisible();
    // The label is visually collapsed at this width — the NAME must survive it.
    await expect(button).toHaveAccessibleName("Search DalyHub");
    await expectNoAxeViolations(page);
  });

  test("the widened bar at 1024px stays axe-clean with the same name", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoFixture(page, "/tasks");
    const search = page.getByRole("search", { name: "Search DalyHub" });
    await expect(search.getByRole("button")).toHaveAccessibleName(
      "Search DalyHub",
    );
    await expectNoAxeViolations(page);
  });
});
