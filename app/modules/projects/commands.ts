/**
 * PROJ-01 / DS-09 — the Projects module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the Projects collection
 * and the create-project page. They reuse the validated DS-08
 * `SearchResultTarget` contract — no bespoke navigation type, no `run` handler —
 * and do not duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const projectsCommands: readonly CommandContribution[] = [
  {
    id: "projects.open",
    title: "Open Projects",
    subtitle: "Finite bodies of work under an Area or a Goal",
    keywords: ["projects", "project", "work", "collection"],
    kind: "navigate",
    target: { kind: "route", to: "/projects" },
  },
  {
    id: "projects.new",
    title: "New Project",
    subtitle: "Create a project under an Area or a Goal",
    keywords: ["project", "new", "create", "add"],
    kind: "navigate",
    // The collection's DS-03 create Drawer, opened by its URL-backed key — the
    // same convention `notes.new` uses. NOT `/projects/new`, which is an
    // action-only resource route with no UI: a command pointing there would
    // navigate to a blank page.
    target: { kind: "route", to: "/projects?drawer=new-project" },
  },
];
