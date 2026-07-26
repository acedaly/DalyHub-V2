/**
 * PX-03 — the Meetings module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "capture"`
 * places Meetings in the sidebar's capture group.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "meetings.index",
    path: "meetings",
    file: "routes/index.tsx",
    meta: { navLabel: "Meetings", navGroup: "capture", navOrder: 120 },
  },
  {
    id: "meetings.upcoming",
    path: "meetings/upcoming",
    file: "routes/upcoming.tsx",
  },
  { id: "meetings.recent", path: "meetings/recent", file: "routes/recent.tsx" },
  {
    id: "meetings.archived",
    path: "meetings/archived",
    file: "routes/archived.tsx",
  },
  { id: "meetings.new", path: "new/meeting", file: "routes/new.tsx" },
  { id: "meetings.create", path: "meetings/create", file: "routes/create.tsx" },
  {
    id: "meetings.detail",
    path: "meeting/:meetingId",
    file: "routes/detail.tsx",
  },
  {
    id: "meetings.mutate",
    path: "meeting/:meetingId/mutate",
    file: "routes/mutate.tsx",
  },
];

export default routes;
