/**
 * UIX-05 — the Analytics module route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), safe for React
 * Router's bare `routes.ts` config loader and imported by `module.ts` for the
 * runtime registry (ADR-016 §5.10).
 *
 * `navGroup: "understand"` opens the rail's UNDERSTAND group at `navOrder:
 * 510` — "what is changing over time?" — with Reports, Reviews and AI beneath
 * it. Insight comes BEFORE a Review because it is the ambient reading an owner
 * glances at, and a Review is the deliberate act they schedule. It declares no entity type — it is a way of
 * ASKING about records other modules own, exactly as Views is — so it declares
 * its shell glyph explicitly (THEME-01).
 *
 * ── V2.13: the LABEL is Insight; the ROUTE is still `/analytics` ───────────
 * Reports arrive as the SAVED half of the same domain, and "Analytics" beside
 * "Reports" names a tool where the owner is looking for a question. So the rail
 * says **Insight**, and `path` deliberately does not move: churning a URL for a
 * label breaks every bookmark and every existing link — including this module's
 * own `analytics/activity` resource route, which the Insight panel pages
 * through — to buy nothing the label does not already buy. The identifier is
 * historical; the label is the truth. The same trade migration `0036` made when
 * it kept `task_saved_views`' name (ADR-121).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "analytics.index",
    path: "analytics",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Insight",
      navGroup: "understand",
      navOrder: 510,
      navIcon: "analytics",
    },
  },
  /*
   * V2.9 INS-04 — the workspace-wide "What changed" feed endpoint
   * (loader-only resource route, no nav entry), moved here from
   * `today/activity` in the change that gave it a consumer (DEBT-103). The
   * Insight page's panel pages through it — every page, including the first,
   * because the shared DS-05 stream loads its own first page and a
   * server-rendered one would be replaced on mount rather than reused. One
   * door onto the stream, one mapping.
   */
  {
    id: "analytics.activity",
    path: "analytics/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
