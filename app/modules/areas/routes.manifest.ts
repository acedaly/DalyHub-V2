/**
 * FND-09 — the Areas module route descriptors (declarative, dependency-free).
 *
 * This is the SINGLE source of truth for the Areas module's routes. It is plain
 * data with only a TYPE import (erased at build time), so it is safe to evaluate
 * in React Router's bare `routes.ts` config loader — which composes the framework
 * route tree from these descriptors — AND is imported by `module.ts` so the same
 * routes flow through the validated registry at runtime (ADR-016 §5.10). Adding a
 * module route means editing this manifest and adding the route file; never
 * `app/routes.ts`.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "areas.index",
    path: "areas",
    file: "routes/index.tsx",
    meta: { navLabel: "Areas", navOrder: 10 },
  },
  {
    id: "areas.new",
    path: "areas/new",
    file: "routes/new.tsx",
  },
  {
    id: "areas.detail",
    path: "areas/:areaId",
    file: "routes/detail.tsx",
  },
  {
    id: "areas.mutate",
    path: "areas/:areaId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "areas.activity",
    path: "areas/:areaId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
