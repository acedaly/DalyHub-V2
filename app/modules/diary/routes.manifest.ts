/**
 * DIARY-01 — the Diary module route descriptors (declarative, dependency-free).
 *
 * `diary.index` is the Timeline + quick-capture screen (replacing the PX-03
 * placeholder); `diary.new` captures an entry; `diary.entry` reads a single
 * entry for the route-backed editor Drawer; `diary.mutate` edits an entry's
 * title + detail slice. `navGroup: "capture"` places Diary in the sidebar's
 * capture group (mirrors the Notes manifest).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "diary.index",
    path: "diary",
    file: "routes/index.tsx",
    // MOBILE-01: Diary is the third phone bottom-navigation destination — daily
    // capture is a phone-first workflow.
    meta: {
      navLabel: "Diary",
      navGroup: "capture",
      navOrder: 110,
      mobilePrimaryOrder: 30,
    },
  },
  {
    id: "diary.new",
    path: "diary/new",
    file: "routes/new.tsx",
  },
  {
    id: "diary.entry",
    path: "diary/:entryId",
    file: "routes/entry.tsx",
  },
  {
    id: "diary.mutate",
    path: "diary/:entryId/mutate",
    file: "routes/mutate.tsx",
  },
];

export default routes;
