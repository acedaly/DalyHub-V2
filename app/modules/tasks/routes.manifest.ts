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
  /*
   * The DAILY group: Inbox and Upcoming sit beside Today and Tasks at the top of
   * the sidebar, above the ORGANISE eyebrow.
   *
   * Both are the `/tasks` surface under a system view (see `system-view.ts`) —
   * one loader, one query path — but they are declared as their own destinations
   * because that is what the visual references make them, and because a place
   * keeps the sidebar row lit and the address bar honest in a way a `?saved=`
   * parameter does not.
   *
   * Declared BEFORE `tasks/:taskId` is irrelevant here (different top-level
   * segments), but they are kept beside the index so the module's navigable
   * surfaces read as one block.
   */
  {
    id: "tasks.inbox",
    path: "inbox",
    file: "routes/inbox.tsx",
    meta: { navLabel: "Inbox", navGroup: "daily", navOrder: 10 },
  },
  {
    id: "tasks.upcoming",
    path: "upcoming",
    file: "routes/upcoming.tsx",
    meta: { navLabel: "Upcoming", navGroup: "daily", navOrder: 20 },
  },
  {
    id: "tasks.index",
    path: "tasks",
    file: "routes/index.tsx",
    // MOBILE-01: Tasks is the second phone bottom-navigation destination.
    meta: {
      navLabel: "Tasks",
      navGroup: "daily",
      navOrder: 30,
      mobilePrimaryOrder: 20,
    },
  },
  // TASKS-01: workspace-level resource routes. Static segments are declared BEFORE
  // the dynamic `tasks/:taskId` so they never shadow a real task id. `bulk` runs
  // bounded, atomic bulk field mutations; `parent-options` backs the create-task
  // parent selector (Projects + Areas).
  {
    id: "tasks.new",
    path: "tasks/new",
    file: "routes/new.tsx",
  },
  {
    id: "tasks.bulk",
    path: "tasks/bulk",
    file: "routes/bulk.tsx",
  },
  {
    id: "tasks.parent_options",
    path: "tasks/parent-options",
    file: "routes/parent-options.tsx",
  },
  // TASKS-03: the saved-view mutations (create / update / rename / duplicate /
  // delete / set-default). A resource route, so the switcher's fetchers receive the
  // action's JSON directly.
  {
    id: "tasks.views",
    path: "tasks/views",
    file: "routes/views.tsx",
  },
  // TASKS-04: Review Inbox — the focused triage flow over the built-in Inbox query
  // (active, unassigned Tasks). A static segment, declared before `tasks/:taskId` so
  // it can never be read as a task id.
  {
    id: "tasks.review",
    path: "tasks/review",
    file: "routes/review.tsx",
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
