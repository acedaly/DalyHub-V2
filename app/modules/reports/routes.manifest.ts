/**
 * V2.13 RPT-04 — the Reports route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), so it is safe for
 * React Router's bare `routes.ts` config loader AND for `module.ts`'s runtime
 * registry (ADR-016 §5.10). Adding a route means editing this file and adding
 * the route file; never `app/routes.ts`.
 *
 * ── ONE primary navigation item, in the group Insight already lives in ──────
 * `/reports` in `organise` at `navOrder: 185`, so the rail reads Insight →
 * Reports → Reviews: the ambient reading, then the saved questions, then the
 * deliberate ritual. The rail gains ONE row for the whole domain — there is
 * deliberately no nav entry for the builder or for any built-in, because those
 * are questions Reports answers rather than places to go.
 *
 * ── No `mobilePrimaryOrder`, and that is a decision ────────────────────────
 * The three earned phone slots are unchanged for the whole of V2, exactly as
 * Life Admin and Finance both decided. Reports reaches the phone through the
 * navigation sheet.
 *
 * ── Declaration order is load-bearing here ─────────────────────────────────
 * `reports/new` and `reports/view` and `reports/saved` are all one segment
 * deep, the same as `reports/:reportId`. React Router prefers a static segment
 * over a dynamic one, so the three cannot be shadowed — and they are declared
 * first anyway, so the file reads in the order it resolves.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "reports.index",
    path: "reports",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Reports",
      navGroup: "organise",
      navOrder: 185,
      // Reports declares no entity type — it is a way of ASKING about records
      // other modules own, exactly as Views and Insight are — so it names its
      // shell glyph explicitly rather than borrowing an identity mark.
      navIcon: "analytics",
    },
  },
  {
    /*
     * The BUILDER, from a blank definition. It is the same screen as a report
     * page: a definition, its controls and its result. A separate "new report"
     * surface would be a second place the controls could drift.
     */
    id: "reports.new",
    path: "reports/new",
    file: "routes/new.tsx",
  },
  {
    /*
     * A definition executed from the URL. Every built-in and every unsaved
     * edit lives here, so a copied link and a saved report open the same screen
     * from the same codec.
     */
    id: "reports.view",
    path: "reports/view",
    file: "routes/view.tsx",
  },
  {
    // The saved-report mutations. A resource route, so the page's fetchers
    // receive the action's JSON directly — the shape `/views/saved` uses.
    // Declared before the dynamic segment so it can never be read as an id.
    id: "reports.saved",
    path: "reports/saved",
    file: "routes/saved.tsx",
  },
  {
    id: "reports.report",
    path: "reports/:reportId",
    file: "routes/report.tsx",
  },
];

export default routes;
