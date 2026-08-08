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
  {
    // SET-02 — the four restore steps. A POST-only resource route with no
    // navigation entry: it is driven from the Privacy & data section, and it
    // deliberately has no GET, because nothing about a restore should be
    // reachable by following a link.
    id: "settings.restore",
    path: "settings/restore/:step",
    file: "routes/restore.tsx",
  },
  {
    // SET-03 — the two Account & security history endpoints. A POST-only
    // resource route with no navigation entry, driven from the Account &
    // security section and from the sign-out control in the account menu. It
    // has no GET on purpose: nothing that writes history should be reachable by
    // following a link.
    id: "settings.account.security",
    path: "settings/account-security/:action",
    file: "routes/account-security.tsx",
  },
];

export default routes;
