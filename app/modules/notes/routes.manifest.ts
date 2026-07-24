/**
 * PX-03 / NOTES-01B — the Notes module route descriptors (declarative,
 * dependency-free).
 *
 * The single source of truth for the Notes module's routes: plain data with only a
 * type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10). `navGroup: "capture"` places Notes in the sidebar's capture
 * group (Notes/Diary/Meetings/People/Assets), after the spine modules.
 *
 * NOTES-01B adds the real collection/creation/canonical-record/mutation/
 * activity routes, mirroring `~/modules/goals/routes.manifest.ts` exactly.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "notes.index",
    path: "notes",
    file: "routes/index.tsx",
    meta: { navLabel: "Notes", navGroup: "capture", navOrder: 100 },
  },
  {
    id: "notes.new",
    path: "notes/new",
    file: "routes/new.tsx",
  },
  {
    id: "notes.detail",
    path: "notes/:noteId",
    file: "routes/detail.tsx",
  },
  {
    id: "notes.mutate",
    path: "notes/:noteId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "notes.activity",
    path: "notes/:noteId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
