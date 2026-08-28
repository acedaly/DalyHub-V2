/**
 * AREA-02 / DS-09 / STEER-03 — the Goals module's registry-discovered command
 * contributions.
 *
 * Two honest NAVIGATION commands: open the outcomes workspace, and open it with
 * its create Drawer already showing. Both reuse the validated DS-08
 * `SearchResultTarget` contract — no bespoke navigation type, no `run` handler
 * — and neither duplicates a command another module owns.
 *
 * This header described "the Goals alignment collection and the create-goal
 * page" until STEER-03 corrected it: STEER-01 made `/goals` the OUTCOMES
 * workspace (it is no longer ordered by alignment), and there has never been a
 * create-goal page — `/goals/new` is an action-only endpoint.
 */

import type { CommandContribution } from "~/kernel/modules";

export const goalsCommands: readonly CommandContribution[] = [
  {
    id: "goals.open",
    title: "Open Goals",
    subtitle: "How your outcomes are going",
    keywords: ["goals", "goal", "alignment", "outcomes", "measurement"],
    kind: "navigate",
    target: { kind: "route", to: "/goals" },
  },
  /*
   * STEER-03 — `goals.new` now EXISTS, and the reason it did not is recorded
   * below because the register asked for the decision rather than the silence
   * ([DEBT-211] item 3).
   *
   * The note this replaces claimed the product had "no workspace-level
   * create-Goal surface to match". REDESIGN-04's `+ Add goal` is one, and
   * STEER-01 corrected that premise; what it left open was the genuine
   * mechanical question — `/goals/new` is an action-only resource route with no
   * UI, so a command pointing at it would navigate to a blank page, and one
   * pointing at `/goals` alone would promise creation and deliver a collection.
   *
   * The answer was already in the product and needed no new machinery: DS-03's
   * Drawer stack lives ENTIRELY in the URL (`?drawer=`, ADR-018), which is what
   * makes a drawer deep-linkable, shareable and Back-correct — and the Projects
   * create form has linked `/areas?drawer=new-area` since PROJ-05. So the
   * command navigates to the collection with its create Drawer open, through
   * the SAME contract, and creation stays the one shared `NewGoalForm` posting
   * to the one trusted endpoint. No second creation flow, no `run` handler and
   * no bespoke navigation type.
   */
  {
    id: "goals.new",
    title: "New Goal",
    subtitle: "Name an outcome under one of your Areas",
    keywords: ["goal", "new", "create", "add", "outcome"],
    kind: "navigate",
    target: { kind: "route", to: "/goals?drawer=new-goal" },
  },
];
