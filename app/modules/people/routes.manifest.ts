/**
 * PEOPLE-01 — the People module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the People module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10). `navGroup: "capture"` places People in the sidebar's capture
 * group (Notes/Diary/Meetings/People/Assets), after the spine modules. People
 * contributes a SINGLE sidebar row ("People"); the `Recent` and `Archived`
 * sub-views are ordinary routes with NO `navLabel`, reached through the People
 * collection's own in-page view navigation (mirrors the Meetings module). Keeping
 * generic labels like "Archived" out of the global sidebar avoids an ambiguous
 * duplicate-link name with other modules' in-page "Archived" controls.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "people.index",
    path: "people",
    file: "routes/index.tsx",
    meta: { navLabel: "People", navGroup: "organise", navOrder: 170 },
  },
  { id: "people.recent", path: "people/recent", file: "routes/recent.tsx" },
  {
    id: "people.archived",
    path: "people/archived",
    file: "routes/archived.tsx",
  },
  {
    id: "people.new",
    path: "new/person",
    file: "routes/new.tsx",
  },
  {
    id: "people.create",
    path: "people/create",
    file: "routes/create.tsx",
  },
  {
    id: "people.detail",
    path: "person/:personId",
    file: "routes/detail.tsx",
  },
  {
    id: "people.mutate",
    path: "person/:personId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "people.activity",
    path: "person/:personId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
