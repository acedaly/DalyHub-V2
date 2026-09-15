/**
 * The accessibility sweep's shared matrix — the routes, and the PR-tier subset.
 *
 * ── Why this module exists (V3-E2E-01) ──────────────────────────────────────
 *
 * `accessibility.spec.ts` was 138 tests and 12.5 minutes — the third most
 * expensive file in the gate and 6.3% of its measured time — and 122 of those
 * tests were ONE assertion (axe is clean here) repeated over 61 routes in two
 * appearances. That sweep is worth having. It is not worth having on every push,
 * because most of it re-proves on a route nobody touched what the module's own
 * spec already proved on the route they did.
 *
 * MEASURED before the split: 93 of the gate's other 139 spec files run axe, over
 * 75 distinct routes. Accessibility was never concentrated in this file, so
 * moving the exhaustive matrix to the nightly suite removes a REPETITION and not
 * a contract — which is the distinction AGENTS.md §15 and the V3 brief both
 * insist on. `PR_ROUTES` below keeps the shared shell, the major interaction
 * families and the surfaces where a control regression actually shows up, and
 * the PR gate still runs every open-overlay scan, because those are the tests
 * nothing else duplicates.
 *
 * Coverage is preserved by CONSTRUCTION: both spec files iterate these same
 * lists, and `test/unit/ci/accessibility-matrix.test.ts` asserts `PR_ROUTES` is
 * a subset of the full sweep, so a route cannot be in the fast tier and in
 * nothing else.
 *
 * This module holds DATA only — never a `test()` call. Playwright attributes a
 * test to the file its `test()` was declared in and the partition manifest is
 * keyed on that attribution, so a sweep declared here would be filed under a
 * module that is not a spec file at all.
 */

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
  // PWA-01 — the icon review surface.
  "/design/app-icon",
] as const;

export const PRODUCT_ROUTES = [
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
  // V2.10 LIFE-02 — Life Admin: the banded collection, an obligation record
  // (including the completion form open, which is the one thing an owner comes
  // to the record to do) and the creation form.
  "/obligations",
  "/obligations/ob-rc-tax",
  "/obligations/ob-rc-tax?complete=1",
  "/obligations/new",
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

/**
 * The PR tier — a REPRESENTATIVE scan, chosen for what each route proves rather
 * than for coverage of the route list.
 *
 *   /                         the shell itself, and the densest composed page
 *   /tasks                    the densest collection, and its inline controls
 *   /projects/pr-website      a record: tabs, a heading outline, an activity feed
 *   /notes/n-search-e2e       the reading/editing surface and its own landmarks
 *   /settings                 more shared form controls than any other route
 *   /obligations/ob-rc-tax?complete=1
 *                             a form open INSIDE a record — two focus contexts
 *   /habits/new               the shared weekday toggle group and a creation form
 *   /design/forms             every shared field control on one page
 *   /design/cards-filters     cards, filter chips and the filter popover
 *   /offline                  the one product route rendered outside the shell
 *
 * Both appearances, because a contrast or focus regression is routinely one and
 * not the other. The exhaustive route matrix runs nightly.
 */
export const PR_ROUTES = [
  "/",
  "/tasks",
  "/projects/pr-website",
  "/notes/n-search-e2e",
  "/settings",
  "/obligations/ob-rc-tax?complete=1",
  "/habits/new",
  "/design/forms",
  "/design/cards-filters",
  "/offline",
] as const;
