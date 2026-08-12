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
    // MOBILE-01: Today is the first phone bottom-navigation destination. The
    // shell derives the bar from this capability — it holds no module list.
    meta: {
      navLabel: "Today",
      navOrder: 5,
      mobilePrimaryOrder: 10,
      // Today owns no entity type, so it declares its shell glyph (THEME-01).
      navIcon: "today",
    },
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
  // TODAY-08 Command centre: the workspace-wide Recent Activity feed endpoint
  // (action/loader-only resource route, no nav entry). The Recent Activity widget's
  // shared DS-05 feed pages through this; it renders the ONE FND-05 Activity stream.
  {
    id: "today.activity",
    path: "today/activity",
    file: "routes/activity.tsx",
  },
  // CAL-02 Tomorrow: "what does tomorrow look like?", built from the SAME daily
  // primitives Today uses — the shared schedule read and the shared Focus date
  // classifier. No sidebar entry: it is reached from Today's own day rail, and a
  // second dashboard in the sidebar is exactly what CAL-01 §19 forbids.
  {
    id: "today.tomorrow",
    path: "today/tomorrow",
    file: "routes/tomorrow.tsx",
  },
  // CAL-02 Next 7 days: a compact forward agenda over the same primitives. Not a
  // month calendar, not a week grid, no drag-and-drop (§21, §45).
  {
    id: "today.upcoming",
    path: "today/upcoming",
    file: "routes/upcoming.tsx",
  },
  // CAL-03: the ONE endpoint that turns an imported calendar occurrence into a
  // canonical DalyHub Meeting. A POST-only resource route with no nav entry and
  // no GET, driven from the event detail drawer.
  {
    id: "today.schedule",
    path: "today/schedule/:eventId/:action",
    file: "routes/schedule.tsx",
  },
  // PROJ-01 / ADR-033: the task record resource routes were re-homed to the Tasks
  // module (`/tasks/:taskId*`) so a task is edited the same way from Today AND a
  // Project. The browser drawer URL (`?drawer=task:<id>`) is unchanged.
];

export default routes;
