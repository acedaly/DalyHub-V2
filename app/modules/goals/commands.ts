/**
 * AREA-02 / DS-09 — the Goals module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the Goals alignment
 * collection and the create-goal page. They reuse the validated DS-08
 * `SearchResultTarget` contract — no bespoke navigation type, no `run` handler —
 * and do not duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const goalsCommands: readonly CommandContribution[] = [
  {
    id: "goals.open",
    title: "Open Goals",
    subtitle: "Aspirational outcomes and their alignment",
    keywords: ["goals", "goal", "alignment", "outcomes", "new", "create"],
    kind: "navigate",
    target: { kind: "route", to: "/goals" },
  },
];

/**
 * Deliberately NOT contributed: a "New Goal" command.
 *
 * A Goal always belongs to exactly one Area, and the product has no
 * workspace-level create-Goal surface to match: the `NewGoalForm` is hosted only
 * on an Area record's Drawer (`AreaOverview.tsx`, key `new-goal`), where the
 * parent Area is already known. `/goals/new` is an action-only resource route
 * with no UI, so a command pointing at it would navigate to a blank page, and
 * one pointing at `/goals` would promise creation and deliver a collection.
 * Either would be a fake control (AGENTS.md §6 — "no dead ends", and the
 * V2.0.1 brief's "do not add commands for actions the product cannot actually
 * perform"). If a workspace-level Goal creation surface is ever built with an
 * Area picker, `goals.new` belongs with it — not before.
 */
