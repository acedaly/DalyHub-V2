/**
 * TASKS-01 / DS-09 — the Tasks module's registry-discovered command contributions
 * (ADR-043 §18). Honest NAVIGATION commands that open the workspace-wide Tasks
 * surface, its primary views and the create-task drawer. They reuse the validated
 * DS-08 `SearchResultTarget` contract — no bespoke navigation type, no `run` handler,
 * no server execution boundary — and do not duplicate commands owned by other
 * modules (Today owns "Go to Today"; these are Tasks-owned).
 */

import type { CommandContribution } from "~/kernel/modules";

export const tasksCommands: readonly CommandContribution[] = [
  {
    id: "tasks.open",
    title: "Open Tasks",
    subtitle: "The workspace-wide task planning surface",
    keywords: ["tasks", "todo", "backlog", "plan"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks" },
  },
  {
    id: "tasks.new",
    title: "New Task",
    subtitle: "Capture a task",
    keywords: ["task", "new", "add", "capture", "create"],
    kind: "navigate",
    target: {
      kind: "drawer",
      drawerKey: "new-task",
      canonicalPath: "/tasks",
    },
  },
  {
    // TASKS-04: Inbox is active, UNASSIGNED tasks — the built-in view and the
    // triage flow over it are both reachable from the palette.
    id: "tasks.inbox",
    title: "Open Inbox",
    subtitle: "Active tasks with no Project or Area yet",
    keywords: ["inbox", "unassigned", "triage", "capture"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks?view=list&system=inbox" },
  },
  {
    id: "tasks.review_inbox",
    title: "Review Inbox",
    subtitle: "Triage unassigned tasks one at a time",
    keywords: ["review", "inbox", "triage", "process", "clear"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks/review" },
  },
  {
    id: "tasks.this_week",
    title: "Open This Week",
    subtitle: "Focus view for this week",
    keywords: ["this week", "focus", "week", "plan"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks?view=focus&system=this_week" },
  },
  {
    // TASKS-05 replaced "Open Matrix": the 2×2 is gone, and the useful half of what
    // it did — see the work banded by priority — is an ordinary grouped list. The
    // Eisenhower keywords stay so an owner who learned that word still finds it.
    id: "tasks.by_priority",
    title: "Open Tasks by priority",
    subtitle: "The task list, grouped P1 → P4",
    keywords: ["priority", "p1", "triage", "grouped", "matrix", "eisenhower"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks?view=list&group=priority" },
  },
  {
    id: "tasks.sectors",
    title: "Open Time Sectors",
    subtitle: "Plan by time sector",
    keywords: ["sectors", "time sector", "this week", "next week", "plan"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks?view=sectors" },
  },
  {
    id: "tasks.someday",
    title: "Open Someday / Maybe",
    subtitle: "Parked ideas you are not committed to yet",
    keywords: ["someday", "maybe", "later", "parked", "backlog"],
    kind: "navigate",
    target: { kind: "route", to: "/tasks?view=all&system=someday" },
  },
];
