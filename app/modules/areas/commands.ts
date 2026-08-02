/**
 * AREA-01 / DS-09 — the Areas module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the Areas collection and
 * the create-area page. They reuse the validated DS-08 `SearchResultTarget`
 * contract — no bespoke navigation type, no `run` handler — and do not
 * duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const areasCommands: readonly CommandContribution[] = [
  {
    id: "areas.open",
    title: "Open Areas",
    subtitle: "Permanent domains of life — the top of the spine",
    keywords: ["areas", "area", "domains", "life"],
    kind: "navigate",
    target: { kind: "route", to: "/areas" },
  },
  {
    id: "areas.new",
    title: "New Area",
    subtitle: "Create a permanent domain of life",
    keywords: ["area", "new", "create", "add", "domain"],
    kind: "navigate",
    // The collection's DS-03 create Drawer, opened by its URL-backed key — the
    // same convention `notes.new` uses. NOT `/areas/new`, which is an
    // action-only resource route with no UI.
    target: { kind: "route", to: "/areas?drawer=new-area" },
  },
];
