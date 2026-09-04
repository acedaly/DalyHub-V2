/**
 * UIX-05 — the Analytics module route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), safe for React
 * Router's bare `routes.ts` config loader and imported by `module.ts` for the
 * runtime registry (ADR-016 §5.10).
 *
 * `navGroup: "insight"` places Analytics beside Reviews, and `navOrder: 190`
 * puts it BEFORE them: Analytics is the ambient reading an owner glances at,
 * and a Review is the deliberate act they schedule. Analytics declares no
 * entity type — it is a way of ASKING about records other modules own, exactly
 * as Views is — so it declares its shell glyph explicitly (THEME-01).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "analytics.index",
    path: "analytics",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Analytics",
      navGroup: "organise",
      navOrder: 180,
      navIcon: "analytics",
    },
  },
  /*
   * V2.9 INS-04 — the workspace-wide "What changed" feed endpoint
   * (loader-only resource route, no nav entry), moved here from
   * `today/activity` in the change that gave it a consumer (DEBT-103). The
   * Insight page renders its first page server-side and this route serves every
   * page after it, so there is one door onto the stream and one mapping.
   */
  {
    id: "analytics.activity",
    path: "analytics/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
