/**
 * HABITS-01 — the Habits module's registry-discovered command contributions.
 *
 * Honest NAVIGATION commands only: they open the collection and the create page,
 * reusing the validated DS-08 `SearchResultTarget` contract. Nothing here
 * performs a check-in — a command palette entry that ticked "today's habit"
 * would need to choose WHICH habit, and a command that silently picks one is a
 * control the owner cannot predict.
 */

import type { CommandContribution } from "~/kernel/modules";

export const habitsCommands: readonly CommandContribution[] = [
  {
    id: "habits.open",
    title: "Open Habits",
    subtitle: "The behaviours you are practising",
    keywords: ["habits", "habit", "routine", "routines", "consistency"],
    kind: "navigate",
    target: { kind: "route", to: "/habits" },
  },
  {
    id: "habits.new",
    title: "New habit",
    subtitle: "A behaviour to practise on a cadence",
    keywords: ["habit", "routine", "new", "create", "add"],
    kind: "navigate",
    target: { kind: "route", to: "/habits/new" },
  },
];
