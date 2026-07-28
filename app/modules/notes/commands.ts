/**
 * NOTES-03 / DS-09 — the Notes module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the Notes surfaces and the
 * organisation views. They reuse the validated DS-08 `SearchResultTarget`
 * contract — no bespoke navigation type, no `run` handler, no server execution
 * boundary — and duplicate no command another module owns.
 */

import type { CommandContribution } from "~/kernel/modules";

export const notesCommands: readonly CommandContribution[] = [
  {
    id: "notes.open",
    title: "Open Notes",
    subtitle: "Your Markdown knowledge base",
    keywords: ["notes", "markdown", "knowledge", "write"],
    kind: "navigate",
    target: { kind: "route", to: "/notes" },
  },
  {
    id: "notes.new",
    title: "Create Note",
    subtitle: "Start a new note",
    keywords: ["note", "new", "add", "create", "write"],
    kind: "navigate",
    target: { kind: "route", to: "/notes?drawer=new-note" },
  },
  {
    id: "notes.recent",
    title: "Recently updated Notes",
    subtitle: "Notes you changed most recently",
    keywords: ["recent", "notes", "latest", "updated"],
    kind: "navigate",
    target: { kind: "route", to: "/notes?sort=recent" },
  },
  {
    id: "notes.unlinked",
    title: "Unlinked Notes",
    subtitle: "Notes that relate to nothing yet",
    keywords: ["unlinked", "orphan", "notes", "loose"],
    kind: "navigate",
    target: { kind: "route", to: "/notes?links=unlinked" },
  },
  {
    id: "notes.archived",
    title: "Archived Notes",
    subtitle: "Notes you have put away",
    keywords: ["archived", "notes", "hidden", "put away"],
    kind: "navigate",
    target: { kind: "route", to: "/notes?state=archived" },
  },
];
