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
    /*
     * V2.16 CONSOL-00 — the retired `people.search` command's keywords moved
     * here, so typing "find" or "search" still reaches People. See below.
     */
    keywords: [
      "people",
      "contacts",
      "relationships",
      "person",
      "search",
      "find",
    ],
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
  /*
   * V2.16 CONSOL-00 retired `people.search` ("Search People").
   *
   * It navigated to `/people` — the SAME destination as `people.open` above,
   * with a different title and a promise the destination does not keep: the
   * People collection's search field holds its query in component state, so
   * there is no URL that opens it focused and nothing about arriving from this
   * command differed from arriving from the other one. Two palette rows, one
   * destination, and the ranking decided which the owner got.
   *
   * Nothing is lost. The collection's field is the first control on the page,
   * global Search (⌘K) already runs the People provider (`people.search` — the
   * PROVIDER of that id, which is untouched), and the "search"/"find" keywords
   * now belong to `people.open`, so the query that used to find this row still
   * finds People.
   */
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
