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
import { GOAL_DETAILS_UPDATED } from "~/kernel/goals";
import {
  AREA,
  GOAL,
  GOAL_BELONGS_TO_AREA,
  GOAL_COMPLETED,
  GOAL_REOPENED,
} from "~/kernel/spine";

import routes from "./routes.manifest";

export default defineModule({
  id: "goals",
  name: "Goals",
  description: "Optional, aspirational outcomes under an Area.",
  order: 20,
  routes,
  entityTypes: [{ type: GOAL, singular: "Goal", plural: "Goals" }],
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
      description: "A goal's target date or definition of done changed.",
    },
  ],
});
