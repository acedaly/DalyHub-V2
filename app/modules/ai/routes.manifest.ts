/**
 * PX-03 / AI-01 — the AI module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "understand"`
 * places AI LAST in the rail's UNDERSTAND group, after Reviews: it explains the
 * figures the three rows above it produce, and explains nothing they do not.
 * (The `insight` group this comment used to name was retired by PX-03; V2.16
 * CONSOL-00 replaced the leftovers `more` group with the five questions.)
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
      navGroup: "understand",
      navOrder: 540,
      navIcon: "ai",
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
