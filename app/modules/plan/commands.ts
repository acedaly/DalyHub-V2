/**
 * PLAN-01 — the Planning module's palette commands.
 *
 * Two, and both are NAVIGATION: they open a route, so they need no `run` handler
 * and persist nothing (ADR-024 §24.15). "This week" and "next week" are separate
 * commands rather than one command with an argument because they are the two
 * things an owner actually types — "plan next week" is the sentence a Friday
 * afternoon produces, and making it a two-step interaction to save one entry
 * would be worse than the entry.
 *
 * There is deliberately no "plan this task for …" command here. Planning a Task is
 * a Task command, it already exists on the Task record and the row, and adding a
 * second door with its own wording is how one act comes to be described two ways.
 */

import type { CommandContribution } from "~/kernel/modules";

export const planCommands: readonly CommandContribution[] = [
  {
    id: "plan.open",
    title: "Open Weekly planning",
    subtitle: "Place work onto the days of this week",
    keywords: ["plan", "planning", "week", "weekly", "schedule", "place"],
    kind: "navigate",
    target: { kind: "route", to: "/plan" },
  },
  {
    id: "plan.open_next_week",
    title: "Plan next week",
    subtitle: "The week ahead, around what is already on",
    keywords: ["plan next week", "next week", "planning", "ahead", "weekly"],
    kind: "navigate",
    target: { kind: "route", to: "/plan?week=next" },
  },
];
