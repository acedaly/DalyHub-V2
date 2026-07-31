/**
 * RELEASE-01 — the About module route descriptors (declarative, dependency-free).
 *
 * `navGroup: "system"` places About last, after Settings and Help.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "about.index",
    path: "about",
    file: "routes/index.tsx",
    meta: {
      navLabel: "About",
      navGroup: "system",
      navOrder: 320,
      navIcon: "about",
    },
  },
];

export default routes;
