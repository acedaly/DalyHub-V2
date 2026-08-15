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
    meta: { navLabel: "Notes", navGroup: "organise", navOrder: 140 },
  },
  {
    id: "notes.new",
    path: "notes/new",
    file: "routes/new.tsx",
  },
  {
    // The internal-link resolver — a static segment registered BEFORE the
    // dynamic `:noteId` route so it is never shadowed. Resolves a `[[Wiki
    // Link]]` title (`?title=`) or a `dalyhub://type/id` record link
    // (`?type=&id=`) to a record and redirects to its canonical destination;
    // an id that resolves to nothing renders an honest "unavailable" page.
    id: "notes.resolve",
    path: "notes/resolve",
    file: "routes/resolve.tsx",
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
  {
    // NOTES-02 — further pages of a Note's backlinks / outgoing links. The FIRST
    // page is server-rendered by the record route; this serves "Load more".
    id: "notes.references",
    path: "notes/:noteId/references",
    file: "routes/references.tsx",
  },
  {
    // NOTES-06 — single-Note download (`?format=md|txt`). A resource route, so
    // exporting never leaves or reloads the record.
    id: "notes.export",
    path: "notes/:noteId/export",
    file: "routes/export.tsx",
  },
];

export default routes;
