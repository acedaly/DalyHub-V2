/**
 * PX-03 — the AI module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "insight"`
 * places AI in the sidebar's insight group, after Reviews.
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
];

export default routes;
