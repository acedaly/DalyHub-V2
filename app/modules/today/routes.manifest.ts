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
  // TODAY-03 Waiting: a real sub-view of Today listing tasks blocked on someone or
  // something else. It has no sidebar nav entry (no `navLabel`) — it is reached from
  // the Today Waiting summary and the "Open Waiting" command, staying under Today
  // rather than cluttering the sidebar with a separate module.
  {
    id: "today.waiting",
    path: "today/waiting",
    file: "routes/waiting.tsx",
  },
  // TODAY-04 Planning: the bulk/quick planning endpoint (action-only resource
  // route, no nav entry). The Today surface's per-card plan actions and the
  // multi-select bulk action bar POST here; the per-task Planning section in the
  // Task Drawer uses the re-homed /tasks/:taskId action (ADR-033).
  {
    id: "today.plan",
    path: "today/plan",
    file: "routes/plan.tsx",
  },
  // PROJ-01 / ADR-033: the task record resource routes were re-homed to the Tasks
  // module (`/tasks/:taskId*`) so a task is edited the same way from Today AND a
  // Project. The browser drawer URL (`?drawer=task:<id>`) is unchanged.
];

export default routes;
