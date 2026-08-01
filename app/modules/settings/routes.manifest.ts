/**
 * PX-03 — the Settings module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "system"`
 * places Settings in the sidebar's final group, alongside Help.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "settings.index",
    path: "settings",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Settings",
      navGroup: "system",
      navOrder: 300,
      navIcon: "settings",
    },
  },
  {
    // X-04 — the two workspace-export downloads. A resource route with no
    // navigation entry: it is reached from the Privacy & data section, never
    // from the sidebar, because it returns a file rather than a page.
    id: "settings.export",
    path: "settings/export/:format",
    file: "routes/export.tsx",
  },
];

export default routes;
