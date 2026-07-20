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
  // TODAY-02 task Drawer data endpoints (resource routes, no nav entry): the task
  // itself (loader + mutation action), its Activity Timeline page, and the
  // "related records" target search. They are addressed by the Drawer content on
  // /today, so opening/editing a task never leaves Today.
  {
    id: "today.task",
    path: "today/task/:taskId",
    file: "routes/task-detail.tsx",
  },
  {
    id: "today.task.activity",
    path: "today/task/:taskId/activity",
    file: "routes/task-activity.tsx",
  },
  {
    id: "today.task.link_targets",
    path: "today/task/:taskId/link-targets",
    file: "routes/task-link-targets.tsx",
  },
  // TODAY-03: the waiting-control entity target search (resource route, no nav).
  {
    id: "today.task.waiting_targets",
    path: "today/task/:taskId/waiting-targets",
    file: "routes/task-waiting-targets.tsx",
  },
];

export default routes;
