/**
 * FND-07 / AREA-02 — the Goals product module manifest.
 *
 * A real, side-effect-free production manifest. It registers the `goal` entity
 * type, the single structural link a Goal owns (`goal.belongs_to_area`, directed
 * child → parent), the Goal completion Activity types and the Goal-owned
 * `goal.details_updated` event (target date / definition of done). Hierarchy
 * correctness lives in the SpineRepository (ADR-014 §4.1); this manifest only
 * declares discoverable metadata. AREA-02 adds the canonical `/goals/:goalId`
 * record and its mutation/activity resource routes — see
 * `docs/development/AREAS_MODULE.md` for the full Goal record surface.
 */

import { defineModule } from "~/kernel/modules";
import {
  GOAL_DETAILS_UPDATED,
  GOAL_MEASUREMENT_CORRECTED,
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MEASUREMENT_REMOVED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_MILESTONE_REOPENED,
  GOAL_TARGET_REACHED,
} from "~/kernel/goals";
import {
  AREA,
  GOAL,
  GOAL_BELONGS_TO_AREA,
  GOAL_COMPLETED,
  GOAL_REOPENED,
} from "~/kernel/spine";

import routes from "./routes.manifest";
import { goalsCommands } from "./commands";
import { goalsSearchProvider } from "./search";

export default defineModule({
  id: "goals",
  name: "Goals",
  description: "Optional, aspirational outcomes under an Area.",
  order: 20,
  routes,
  entityTypes: [{ type: GOAL, singular: "Goal", plural: "Goals" }],
  searchProviders: [goalsSearchProvider],
  commands: goalsCommands,
  entityLinkTypes: [
    {
      type: GOAL_BELONGS_TO_AREA,
      sourceLabel: "belongs to area",
      targetLabel: "has goal",
      sourceEntityType: GOAL,
      targetEntityType: AREA,
    },
  ],
  activityTypes: [
    {
      type: GOAL_COMPLETED,
      label: "Goal completed",
      description: "A goal was marked complete.",
    },
    {
      type: GOAL_REOPENED,
      label: "Goal reopened",
      description: "A completed goal was reopened.",
    },
    {
      type: GOAL_DETAILS_UPDATED,
      label: "Goal details updated",
      description:
        "A goal’s target date, definition of done or measurement changed.",
    },
    /*
     * GOAL-02 — progress events.
     *
     * A measurement is a real change to the record and earns an event; a
     * RECALCULATED percentage does not, and none is recorded. Adding, renaming
     * or reweighting a milestone is configuration and is likewise silent — only
     * completing or reopening a stage is progress (AGENTS.md §9.6).
     */
    {
      type: GOAL_MEASUREMENT_LOGGED,
      label: "Logged goal measurement",
      description: "A measurement was recorded against a goal.",
    },
    {
      type: GOAL_MEASUREMENT_CORRECTED,
      label: "Corrected goal measurement",
      description: "An existing goal measurement was edited.",
    },
    {
      type: GOAL_MEASUREMENT_REMOVED,
      label: "Removed goal measurement",
      description: "A goal measurement was deleted.",
    },
    {
      type: GOAL_TARGET_REACHED,
      label: "Goal reached its target",
      description:
        "A measurement reached the goal’s target for the first time.",
    },
    {
      type: GOAL_MILESTONE_COMPLETED,
      label: "Completed goal milestone",
      description: "A defined stage of a goal was completed.",
    },
    {
      type: GOAL_MILESTONE_REOPENED,
      label: "Reopened goal milestone",
      description: "A completed stage of a goal was reopened.",
    },
  ],
});
