/**
 * FND-07 — the Goals product module manifest.
 *
 * A real, side-effect-free production manifest. It registers the `goal` entity
 * type, the single structural link a Goal owns (`goal.belongs_to_area`, directed
 * child → parent), and the Goal completion Activity types. Hierarchy correctness
 * lives in the SpineRepository (ADR-014 §4.1); this manifest only declares
 * discoverable metadata. FND-09 adds the single navigable placeholder route the
 * shell composes; the Goals product experience arrives in its own roadmap phase.
 */

import { defineModule } from "~/kernel/modules";
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
  ],
});
