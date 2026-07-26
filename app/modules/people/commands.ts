/**
 * PEOPLE-01 / DS-09 — the People module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the People surfaces and the
 * create-person page. They reuse the validated DS-08 `SearchResultTarget`
 * contract — no bespoke navigation type, no `run` handler, no server execution
 * boundary — and do not duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const peopleCommands: readonly CommandContribution[] = [
  {
    id: "people.open",
    title: "Open People",
    subtitle: "The people in your life",
    keywords: ["people", "contacts", "relationships", "person"],
    kind: "navigate",
    target: { kind: "route", to: "/people" },
  },
  {
    id: "people.new",
    title: "Create Person",
    subtitle: "Add someone to People",
    keywords: ["person", "new", "add", "create", "contact"],
    kind: "navigate",
    target: { kind: "route", to: "/new/person" },
  },
  {
    id: "people.search",
    title: "Search People",
    subtitle: "Find someone by name, organisation or role",
    keywords: ["search", "find", "people", "person", "contact"],
    kind: "navigate",
    target: { kind: "route", to: "/people" },
  },
  {
    id: "people.recent",
    title: "Recent People",
    subtitle: "People you added most recently",
    keywords: ["recent", "people", "latest"],
    kind: "navigate",
    target: { kind: "route", to: "/people/recent" },
  },
  {
    id: "people.archived",
    title: "Archived People",
    subtitle: "People you have archived",
    keywords: ["archived", "people", "hidden"],
    kind: "navigate",
    target: { kind: "route", to: "/people/archived" },
  },
];
