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
];

export default routes;
