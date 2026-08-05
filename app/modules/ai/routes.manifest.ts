/**
 * PX-03 / AI-01 — the AI module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "insight"`
 * places AI in the sidebar's insight group, after Reviews.
 *
 * `ai.index` is Ask DalyHub. The other two are resource routes with NO navigation
 * entry: `ai.assist` is the one place an AI request is made, and `ai.apply` is the
 * one place a reviewed proposal becomes DalyHub data. Both are reached by
 * same-origin `fetch` from a module surface, never from the sidebar.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "ai.index",
    path: "ai",
    file: "routes/index.tsx",
    meta: {
      navLabel: "AI",
      navGroup: "insight",
      navOrder: 210,
      navIcon: "insight",
    },
  },
  {
    id: "ai.assist",
    path: "ai/assist",
    file: "routes/assist.tsx",
  },
  {
    id: "ai.apply",
    path: "ai/apply",
    file: "routes/apply.tsx",
  },
];

export default routes;
