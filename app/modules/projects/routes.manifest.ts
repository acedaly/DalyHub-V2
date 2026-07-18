/**
 * FND-09 — the Projects module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Projects module's routes: plain data with
 * only a type import (erased at build time), safe for React Router's bare
 * `routes.ts` config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "projects.index",
    path: "projects",
    file: "routes/index.tsx",
    meta: { navLabel: "Projects", navOrder: 30 },
  },
];

export default routes;
