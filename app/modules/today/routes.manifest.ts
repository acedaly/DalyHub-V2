/**
 * TODAY-01 — the Today module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Today module's routes: plain data with only a
 * type import (erased at build time), so it is safe to evaluate in React Router's
 * bare `routes.ts` config loader — which composes the framework route tree from
 * these descriptors — AND is imported by `module.ts` so the same routes flow through
 * the validated registry at runtime (ADR-016 §5.10). Adding a module route means
 * editing this manifest and adding the route file; never `app/routes.ts`.
 *
 * `navOrder: 5` places Today at the top of the registry-driven sidebar — the place
 * the owner lands every morning (PRODUCT_EXPERIENCE Part V, "Today").
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "today.index",
    path: "today",
    file: "routes/index.tsx",
    meta: { navLabel: "Today", navOrder: 5 },
  },
];

export default routes;
