/**
 * PX-03 — the Help module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "system"`
 * places Help in the rail's system block, between Settings and About.
 *
 * V2.16 CONSOL-00 — Help declares `navIcon: "help"`. It declared nothing until
 * this release, so `NavIcon` fell through to its neutral `InfoIcon` default and
 * Help drew the SAME glyph as About, immediately beneath it — while the glyph
 * registry had carried an unused `help` entry since THEME-01 built it. Two
 * adjacent rows with one mark is exactly the "unfinished presentation in
 * permanent chrome" THEME-01 set out to remove.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "help.index",
    path: "help",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Help",
      navGroup: "system",
      navOrder: 930,
      navIcon: "help",
    },
  },
];

export default routes;
