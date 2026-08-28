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
 * Still NOT contributed: a "New Goal" command — but the reason has changed, and
 * the old one was false.
 *
 * This note used to say the product had "no workspace-level create-Goal surface
 * to match". **REDESIGN-04's `+ Add goal` is one**: it opens the shared
 * `NewGoalForm` in a Drawer over `/goals`, with the Area as a required field
 * and the same trusted `/goals/new` endpoint behind it. The premise stopped
 * being true when that shipped, and STEER-01 corrects it here rather than
 * leaving a comment that sends the next author to check for a surface that
 * exists ([DEBT-211] item 3).
 *
 * What remains true is the mechanics: `/goals/new` is an action-only resource
 * route with no UI, so a command pointing at it would navigate to a blank page,
 * and one pointing at `/goals` alone would promise creation and deliver a
 * collection. A `goals.new` command would have to open the collection's DRAWER
 * (`?drawer=new-goal`), which is a real design question about how the palette
 * addresses drawer state — not a line to add here in passing. It is
 * [STEER-03](../../../docs/roadmap/ROADMAP_V2_5.md)'s to take with the rest of
 * that entry.
 */
