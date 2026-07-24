/**
 * FND-09 — the Goals module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Goals module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "goals.index",
    path: "goals",
    file: "routes/index.tsx",
    meta: { navLabel: "Goals", navOrder: 20 },
  },
  {
    id: "goals.new",
    path: "goals/new",
    file: "routes/new.tsx",
  },
  {
    id: "goals.detail",
    path: "goals/:goalId",
    file: "routes/detail.tsx",
  },
  {
    id: "goals.mutate",
    path: "goals/:goalId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "goals.activity",
    path: "goals/:goalId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
