/**
 * DS-11 / V3-E2E-01 — the accessibility gate that runs on EVERY pull request.
 *
 * Two things, and they are the two that nothing else in the suite duplicates:
 *
 *   1. A REPRESENTATIVE resting scan (`PR_ROUTES`, light and dark) — the shared
 *      shell, the densest collection, a record, the reading surface, the two
 *      form-heavy fixtures, a form open inside a record, and the one route that
 *      renders outside the shell.
 *   2. Every OPEN-OVERLAY scan. A Drawer, the Search surface, the Command
 *      Palette, a dangerous confirmation, the creation sheets, the inline
 *      editors and the record overflow menu are scanned with their modal
 *      semantics, focus scoping and live regions ACTIVE. These are the highest
 *      -value accessibility tests in the product and they exist here and
 *      nowhere else.
 *
 * The exhaustive route × appearance matrix — 61 routes in both appearances —
 * moved to `accessibility-matrix.spec.ts`, which the nightly suite runs. That is
 * a change to how often a repetition runs, NOT to whether accessibility gates a
 * PR: axe still runs in 93 other gated spec files over 75 distinct routes, and
 * the static `jsx-a11y` lint still runs in every push. See
 * `e2e/accessibility-matrix.ts` for the measurement behind the split.
 *
 * The scan is scoped to the WCAG 2.0/2.1/2.2 A + AA standard plus axe
 * best-practice (`e2e/helpers.ts` → `AXE_TAGS`). Colour contrast is proven
 * separately and deterministically by the DS-01 token unit tests, so it is
 * disabled here to avoid flaky pixel-derived assertions (documented in
 * `buildAxeScan`). No brittle per-rule assertions — a surface either has zero
 * violations against the standard or it fails with an actionable list.
 */

import { expect, test } from "@playwright/test";

import { PR_ROUTES } from "./accessibility-matrix";
import {
  expectNoAxeViolations,
  gotoFixture,
  recordOverflowTrigger,
} from "./helpers";

test.describe("automated accessibility — representative surfaces (light)", () => {
  for (const path of PR_ROUTES) {
    test(`no WCAG 2.2 AA violations at ${path}`, async ({ page }) => {
      await gotoFixture(page, path);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("automated accessibility — representative surfaces (dark)", () => {
  test.use({ colorScheme: "dark" });

  for (const path of PR_ROUTES) {
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
    // The record's own ⋯, not one of the shared Task rows' (CONV-01).
    await recordOverflowTrigger(page).click();
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
