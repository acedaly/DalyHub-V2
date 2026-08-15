/**
 * ASSET-01 — the Assets module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Assets module's routes: plain data with only a
 * type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry. `navGroup:
 * "capture"` places Assets in the sidebar's capture group after People. Assets
 * contributes a SINGLE sidebar row ("Assets"); the collection sub-views (Recently
 * updated, Expiring soon, Service due, Archived) are ordinary routes with NO
 * `navLabel`, reached through the collection's own in-page view navigation (mirrors
 * People/Meetings). The create endpoint is a SEPARATE action-only resource route so
 * a `fetch` POST returns JSON rather than re-rendering HTML.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "assets.index",
    path: "assets",
    file: "routes/index.tsx",
    meta: { navLabel: "Assets", navGroup: "more", navOrder: 220 },
  },
  { id: "assets.recent", path: "assets/recent", file: "routes/recent.tsx" },
  {
    id: "assets.expiring",
    path: "assets/expiring",
    file: "routes/expiring.tsx",
  },
  {
    id: "assets.service_due",
    path: "assets/service-due",
    file: "routes/service-due.tsx",
  },
  {
    id: "assets.archived",
    path: "assets/archived",
    file: "routes/archived.tsx",
  },
  { id: "assets.new", path: "new/asset", file: "routes/new.tsx" },
  { id: "assets.create", path: "assets/create", file: "routes/create.tsx" },
  { id: "assets.detail", path: "asset/:assetId", file: "routes/detail.tsx" },
  {
    id: "assets.mutate",
    path: "asset/:assetId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "assets.activity",
    path: "asset/:assetId/activity",
    file: "routes/activity.tsx",
  },
  // ASSET-02: the history + obligations resource route. GET returns a bounded
  // page of the Asset's timeline; POST carries every event/obligation intent.
  {
    id: "assets.history",
    path: "asset/:assetId/history",
    file: "routes/history.tsx",
  },
];

export default routes;
