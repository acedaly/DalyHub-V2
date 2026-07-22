/**
 * PROJ-01 — the Projects module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Projects module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry (ADR-016 §5.10).
 *
 * Two page routes (the collection and the project record) and two action-only
 * resource routes (create a project, mutate a project). The resource routes return
 * real JSON Responses so the shared DS-06 forms post to them with a plain `fetch`
 * (the same pattern the task record surface uses), and a page-route loader
 * revalidation reconciles the surfaces after a mutation. `projects/new` is a static
 * segment, so it ranks above the dynamic `projects/:projectId` and never shadows a
 * real project id (which is a UUID).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "projects.index",
    path: "projects",
    file: "routes/index.tsx",
    meta: { navLabel: "Projects", navOrder: 30 },
  },
  {
    id: "projects.new",
    path: "projects/new",
    file: "routes/new.tsx",
  },
  {
    id: "projects.detail",
    path: "projects/:projectId",
    file: "routes/detail.tsx",
  },
  {
    id: "projects.activity",
    path: "projects/:projectId/activity",
    file: "routes/activity.tsx",
  },
  {
    id: "projects.mutate",
    path: "projects/:projectId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "projects.link_targets",
    path: "projects/:projectId/link-targets",
    file: "routes/link-targets.tsx",
  },
  {
    id: "projects.tasks",
    path: "projects/:projectId/tasks",
    file: "routes/tasks.tsx",
  },
  {
    id: "projects.parent_options",
    path: "projects/parent-options",
    file: "routes/parent-options.tsx",
  },
];

export default routes;
