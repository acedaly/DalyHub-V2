/**
 * FND-09 — the Tasks module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Tasks module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "tasks.index",
    path: "tasks",
    file: "routes/index.tsx",
    meta: { navLabel: "Tasks", navOrder: 40 },
  },
  // PROJ-01 / ADR-033: the re-homed task record resource routes (no nav entry). The
  // ONE task record data endpoint (loader + mutation action), its Activity Timeline
  // page, the "related records" target search and the waiting-target search. They are
  // addressed by the shared TaskRecordDrawer wherever a task opens (Today OR a
  // Project), so a task is edited the same way from every surface. Previously lived
  // under `/today/task/*`; the browser drawer URL (`?drawer=task:<id>`) is unchanged.
  {
    id: "tasks.record",
    path: "tasks/:taskId",
    file: "routes/task-detail.tsx",
  },
  {
    id: "tasks.record.activity",
    path: "tasks/:taskId/activity",
    file: "routes/task-activity.tsx",
  },
  {
    id: "tasks.record.link_targets",
    path: "tasks/:taskId/link-targets",
    file: "routes/task-link-targets.tsx",
  },
  {
    id: "tasks.record.waiting_targets",
    path: "tasks/:taskId/waiting-targets",
    file: "routes/task-waiting-targets.tsx",
  },
];

export default routes;
