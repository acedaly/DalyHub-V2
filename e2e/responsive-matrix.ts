/**
 * The responsive sweep's shared matrix — DS-11's routes, the POLISH-01 audit
 * band, and the overlay scenarios — declared ONCE and consumed by the two tier
 * spec files that run it.
 *
 * ── Why this module exists (V2.8 CONV-03, DEBT-205) ──────────────────────────
 * `responsive.spec.ts` was 519 tests and 1471.6 s in ONE file — bigger than a
 * partition's share of the gate — so `derivePartitions` had to give it two
 * EXCLUSIVE partitions and divide it with Playwright's `--shard`. Nothing else
 * could share those two partitions, and at 735.8 s apiece against a 1004 s
 * ceiling that stranded 536 s of gate capacity while every other partition sat
 * hard against the ceiling.
 *
 * The fix is the one DEBT-205 names as option 2: split the file near 50/50 into
 * two REAL spec files, so both are packed like any other file and the packer is
 * not taught about slices. The seam is the matrix's own tiers — phones in one
 * file, tablet-and-wider in the other — because that is a property of the
 * product's breakpoints rather than of a duration measured on one afternoon.
 *
 * Coverage is preserved by CONSTRUCTION rather than by review: the route lists
 * and the overlay scenarios live here, each tier file iterates them over its own
 * viewports, and `PHONE_VIEWPORTS ++ WIDE_VIEWPORTS === RESPONSIVE_VIEWPORTS`
 * (asserted in `test/unit/ci/responsive-matrix.test.ts`). Every route × every
 * viewport that ran before this split still runs after it, under the same test
 * title.
 *
 * This module holds DATA and per-scenario BODIES only — never a `test()` call.
 * Playwright attributes a test to the file its `test()` was declared in, and the
 * partition manifest is keyed on that attribution: declaring the sweeps here
 * would file all 519 tests under a module that is not a spec file at all, and
 * `pnpm run e2e:partitions:check` would have nothing to balance. The loops stay
 * in the two spec files, where they are ten lines each and where the gate can
 * see them.
 */

import { expect, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

export type ResponsiveViewport = {
  readonly label: string;
  readonly width: number;
  readonly height: number;
};

export const DESIGN_FIXTURES = [
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

// The substantive product surfaces. The remaining module placeholder (/tasks)
// shares the shell + placeholder layout and is covered by the accessibility
// sweep; the responsive matrix focuses on the surfaces with real content so the
// full 7-viewport sweep stays fast at `workers: 1`.
export const PRODUCT_ROUTES = [
  "/",
  "/today",
  // AREA-01 — real Areas collection + record tabs.
  "/areas",
  "/areas/a-dh",
  "/areas/a-dh?tab=projects",
  "/areas/a-dh?tab=activity",
  // AREA-03 — the real Goals collection (the Alignment view) + a real Goal
  // record with the derived Alignment Summary panel.
  "/goals",
  // PX-04 — the Goals "Deleted" lifecycle view, the durable path back from a
  // reversible removal (the same shape as `/notes?state=deleted`).
  "/goals?state=deleted",
  "/goals/g-launch",
  "/goals/g-launch?tab=activity",
  // PROJ-06 — the complete Projects collection + record surface across the
  // canonical matrix: collection filters/cards, default Tasks tab, Linked,
  // Activity Timeline and Settings.
  "/projects",
  "/projects/pr-website",
  "/projects/pr-website?tasks=all",
  "/projects/pr-website?tab=linked",
  "/projects/pr-website?tab=activity",
  // PROJ-05 Slice 4 — the Settings tab, the Archived collection and a bare
  // archived record across the full breakpoint matrix.
  "/projects/pr-settings?tab=settings",
  "/projects?state=archived",
  "/projects/pr-archived-demo",
  // NOTES-01B/NOTES-01C — the real Notes collection, including its
  // Active/Deleted lifecycle filter (the record's own Split/Preview editor
  // layout is covered at every breakpoint by `e2e/notes.spec.ts`'s own
  // journey).
  "/notes",
  "/notes?state=deleted",
  // DS-14 — the Reading reference implementation. The record is now in the
  // shared matrix rather than only in the Notes journey, because it is where
  // the serif column meets its 46ch cap: a capped measure is exactly the kind
  // of rule that overflows at 320px or strands a caret at 1440px, and the
  // foundation is entitled to no less scrutiny than a collection.
  "/notes/n-search-e2e",
  // PX-03 — the remaining navigation-shell Coming Soon placeholder routes
  // (Search's own sidebar affordance, /goals?tab= etc. remain covered by
  // their own suites).
  "/diary",
  "/meetings",
  "/people",
  "/assets",
  "/assets/expiring",
  "/assets/service-due",
  "/new/asset",
  "/reviews",
  // HABITS-01 — the Habits collection, its Archived view and the creation
  // form. The form earns its place: its sticky action bar bleeds past the
  // container's inline padding, which is exactly the shape of rule that
  // overflows a 320px phone (and did, before this work measured it).
  "/habits",
  "/habits/archived",
  "/habits/new",
  "/ai",
  "/settings",
  // PWA — the Settings offline section (three destructive rows, a facts grid)
  // and the offline surface, which renders OUTSIDE the app shell and therefore
  // owns its own width behaviour and safe-area padding.
  "/settings?section=offline",
  "/offline",
  "/help",
] as const;

/**
 * POLISH-01 — the LAPTOP/TABLET band the canonical matrix stepped over.
 *
 * `RESPONSIVE_VIEWPORTS` runs 320 → 430 → 768 → 1024 → 1280 → 1440 → 2560. The
 * August 2026 UX audit found a page-level horizontal scrollbar on `/tasks`
 * between roughly 820 and 1100px — an inline-flex select value sizing to a
 * Project's name and running out of a 4rem grid cell — and every one of those
 * widths falls in a gap in that list. The suite was proving both sides of the
 * defect and not the defect.
 *
 * So this sweeps the audit's own widths over the surfaces it named. `/tasks`,
 * `/inbox` and `/upcoming` are absent from `PRODUCT_ROUTES` entirely (that list
 * was written when Tasks was a placeholder), which is the other half of why the
 * regression was invisible; they are the densest grids in the product and the
 * ones a fixed column is most likely to break.
 *
 * Every one of these widths is a tablet or a laptop, so the band belongs to the
 * WIDE tier file and is declared there.
 */
export const AUDIT_WIDTHS = [
  { label: "laptop-1100", width: 1100, height: 800 },
  { label: "tablet-900", width: 900, height: 800 },
  { label: "tablet-820", width: 820, height: 1180 },
] as const;

export const DENSE_GRID_ROUTES = [
  "/tasks",
  "/inbox",
  "/upcoming",
  "/projects",
  "/projects?presentation=table",
  "/today",
  "/goals",
  "/areas",
] as const;

/**
 * The open-overlay scenarios, as data.
 *
 * They have always run at the two EXTREMES — the narrowest phone and the
 * ultra-wide desktop — because those bound the behaviour. Each tier spec file
 * now runs the extreme that belongs to it, so the same twelve scenarios run at
 * 320 and at 2560 exactly as before, under the same titles.
 *
 * Each scenario LEAVES THE SURFACE AS IT FOUND IT and proves that it did
 * (DEBT-173). A dialog dismissed with `Escape` and never awaited is a mutation
 * this scan declined to make but cannot show it declined: on a slow render the
 * next test in the file inherits an open sheet, or — for the two inline editors
 * on the shared `a-dh` and `g-launch` fixtures — an open editor. The closing
 * assertion is the difference between cleaning up and hoping.
 */
export type OverlayScenario = {
  readonly title: string;
  readonly run: (page: Page) => Promise<void>;
};

export const OVERLAY_SCENARIOS: readonly OverlayScenario[] = [
  {
    title: "Drawer sheet",
    run: async (page) => {
      await gotoFixture(page, "/design/drawer");
      await page
        .getByRole("link", { name: /Project Website relaunch/ })
        .click();
      await page.getByRole("dialog", { name: "Website relaunch" }).waitFor();
      await expectNoHorizontalOverflow(page);
    },
  },
  {
    title: "Search surface",
    run: async (page) => {
      await gotoFixture(page, "/design/search");
      await page.keyboard.press("/");
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
    },
  },
  {
    title: "Command Palette",
    run: async (page) => {
      await gotoFixture(page, "/design/command-palette");
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
    },
  },
  // PROJ-05 Slice 4 — the Project Settings archive/restore confirmation dialogs
  // at the viewport extremes.
  {
    title: "Project Settings archive dialog",
    run: async (page) => {
      await gotoFixture(page, "/projects/pr-settings?tab=settings");
      await page.getByRole("button", { name: "Archive project…" }).click();
      await page
        .getByRole("dialog", { name: "Archive this project?" })
        .waitFor();
      await expectNoHorizontalOverflow(page);
      // Cancel — never actually archive `pr-settings` from a responsive scan.
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Archive this project?" }),
      ).toBeHidden();
    },
  },
  {
    title: "Project Settings restore dialog",
    run: async (page) => {
      await gotoFixture(page, "/projects/pr-archived-demo?tab=settings");
      await page.getByRole("button", { name: "Restore project…" }).click();
      await page
        .getByRole("dialog", { name: "Restore this project?" })
        .waitFor();
      await expectNoHorizontalOverflow(page);
      // Cancel — `pr-archived-demo` stays permanently archived for other scans.
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Restore this project?" }),
      ).toBeHidden();
    },
  },
  {
    title: "Projects new-project sheet",
    run: async (page) => {
      await gotoFixture(page, "/projects");
      await page.getByRole("link", { name: "New project" }).first().click();
      await page.getByRole("dialog", { name: "New Project" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "New Project" }),
      ).toBeHidden();
    },
  },
  {
    title: "Areas new-area sheet",
    run: async (page) => {
      await gotoFixture(page, "/areas");
      await page.getByRole("link", { name: "New area" }).first().click();
      await page.getByRole("dialog", { name: "New Area" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "New Area" })).toBeHidden();
    },
  },
  // DS-16 — the Area rename is no longer a sheet: the heading IS the control.
  // The overflow question it used to answer still has to be answered, so it
  // moved with the interaction rather than being deleted. The editing state is
  // where the risk actually is: a full-width input replaces a heading that was
  // already wrapping, at the two viewport extremes.
  {
    title: "Area inline rename",
    run: async (page) => {
      await gotoFixture(page, "/areas/a-dh");
      await page.getByRole("button", { name: /^Area name:/ }).click();
      await page.getByRole("textbox", { name: "Area name" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      // DEBT-173 — `identity.spec.ts` taught this rule: an inline editor left
      // open on the shared `a-dh` fixture is state the next spec inherits. The
      // scan owns closing it, and proves it closed rather than assuming it.
      await expect(
        page.getByRole("textbox", { name: "Area name" }),
      ).toBeHidden();
    },
  },
  // AREA-04 — the New Goal sheet (opened from the Area record's Goals tab) and
  // (EDIT-02) the inline fields that replaced the Goal record's Edit details
  // sheet, at the viewport extremes.
  {
    title: "Areas new-goal sheet",
    run: async (page) => {
      await gotoFixture(page, "/areas/a-dh?tab=goals");
      await page.getByRole("link", { name: "New Goal" }).first().click();
      await page.getByRole("dialog", { name: "New Goal" }).waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "New Goal" })).toBeHidden();
    },
  },
  {
    title: "Goal inline target-date popover",
    run: async (page) => {
      await gotoFixture(page, "/goals/g-launch");
      await page.getByRole("button", { name: /^Target date: / }).click();
      await page.getByRole("dialog", { name: "Edit target date" }).waitFor();
      // The anchored popover flips to the inline-end edge rather than hanging
      // off the viewport, so opening it never produces a page scrollbar.
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Edit target date" }),
      ).toBeHidden();
    },
  },
  {
    title: "Goal inline definition editor",
    run: async (page) => {
      await gotoFixture(page, "/goals/g-launch");
      await page.getByRole("button", { name: /^Definition of done: / }).click();
      await page.getByRole("textbox", { name: "Definition of done" }).waitFor();
      await expectNoHorizontalOverflow(page);
      // DEBT-173 — this scenario was the one in the sweep that walked away with
      // an editor OPEN on the shared `g-launch` fixture. Escape discards the
      // (unmade) edit; the assertion is what makes the discard a fact.
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("textbox", { name: "Definition of done" }),
      ).toBeHidden();
    },
  },
  {
    title: "Project task Drawer",
    run: async (page) => {
      await gotoFixture(page, "/projects/pr-website");
      await page
        .getByRole("link", { name: "Open Design the homepage" })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    },
  },
];

/** Set the viewport, go to the route, and prove the document never scrolls sideways. */
export async function expectRouteFitsViewport(
  page: Page,
  path: string,
  viewport: ResponsiveViewport,
) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await gotoFixture(page, path);
  await expectNoHorizontalOverflow(page);
}
