/**
 * PROJ-01 — the Projects module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Projects module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry (ADR-016 §5.10).
 *
 * Two page routes (the collection and the project record) and two action-only
 * resource routes (create a project, mutate a project), plus PROJECT-02's two
 * template pages and their own action route. The resource routes return
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
    meta: {
      navLabel: "Projects",
      navGroup: "organise",
      navOrder: 110,
      // The third phone bottom-navigation destination. The references put
      // Projects beside Today and Tasks there; Diary held the slot and is a
      // writing surface reached deliberately rather than thumbed between.
      mobilePrimaryOrder: 30,
    },
  },
  {
    id: "projects.new",
    path: "projects/new",
    file: "routes/new.tsx",
  },
  /*
   * PROJECT-02 — the template surfaces.
   *
   * All three are STATIC segments under `projects/templates`, so they rank
   * above the dynamic `projects/:projectId` and can never shadow a real Project
   * id (which is a UUID). `projects/templates/:templateId` is itself dynamic and
   * is ranked below `projects/templates` for the same reason.
   */
  {
    id: "projects.templates",
    path: "projects/templates",
    file: "routes/templates.tsx",
  },
  {
    id: "projects.template_detail",
    path: "projects/templates/:templateId",
    file: "routes/template-detail.tsx",
  },
  {
    id: "projects.template_mutate",
    path: "projects/templates/:templateId/mutate",
    file: "routes/template-mutate.tsx",
  },
  {
    id: "projects.detail",
    path: "projects/:projectId",
    file: "routes/detail.tsx",
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
    // PROJ-03 — the project's Knowledge tab: further pages, the note picker's
    // search, and the add/create/remove mutations.
    id: "projects.knowledge",
    path: "projects/:projectId/knowledge",
    file: "routes/knowledge.tsx",
  },
  {
    id: "projects.activity",
    path: "projects/:projectId/activity",
    file: "routes/activity.tsx",
  },
  {
    id: "projects.parent_options",
    path: "projects/parent-options",
    file: "routes/parent-options.tsx",
  },
];

export default routes;
