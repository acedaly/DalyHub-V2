/**
 * X-02 — the Views module route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), safe for React
 * Router's bare `routes.ts` config loader and imported by `module.ts` for the
 * runtime registry (ADR-016 §5.10).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "views.index",
    path: "views",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Views",
      navGroup: "more",
      navOrder: 210,
      // POLISH-01 — a stack, not the filter funnel: a saved view is a stored
      // way of looking at records, and the funnel is already the glyph of the
      // control that narrows a collection.
      navIcon: "views",
    },
  },
  // The saved-view mutations (create / update / rename / duplicate / delete). A
  // resource route, so the switcher's fetchers receive the action's JSON directly.
  // Declared here rather than under a dynamic segment, so it can never be read as
  // a view id.
  {
    id: "views.saved",
    path: "views/saved",
    file: "routes/saved.tsx",
  },
];

export default routes;
