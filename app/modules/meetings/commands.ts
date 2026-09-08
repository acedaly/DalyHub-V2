import type { CommandContribution } from "~/kernel/modules";
export const meetingCommands: readonly CommandContribution[] = [
  {
    id: "meetings.open",
    title: "Open Meetings",
    subtitle: "Prepare, capture and remember",
    // V2.16 CONSOL-00 — the retired `meetings.search` command's keywords moved
    // here, so typing "find" still reaches Meetings. See below.
    keywords: ["meetings", "search", "find"],
    kind: "navigate",
    target: { kind: "route", to: "/meetings" },
  },
  {
    id: "meetings.new",
    title: "Create Meeting",
    subtitle: "Plan a meeting",
    keywords: ["meeting", "new"],
    kind: "navigate",
    target: { kind: "route", to: "/new/meeting" },
  },
  /*
   * V2.16 CONSOL-00 retired `meetings.search` ("Search Meetings").
   *
   * Its target was `/meetings?focus=search`, and NOTHING reads a `focus`
   * parameter: the Meetings collection holds its search query in component
   * state. So the command landed on the ordinary collection with an inert
   * parameter in the address bar — the same defect DEBT-243 records for
   * `/tasks?task=<id>`, found by V2.16's palette coherence check rather than by
   * a reader.
   *
   * Nothing is lost. The collection's field is the first control on the page,
   * global Search already runs the Meetings provider, and the "search"/"find"
   * keywords now belong to `meetings.open`.
   */
];
