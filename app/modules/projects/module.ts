/**
 * FND-07 — the Projects product module manifest.
 *
 * A real, side-effect-free production manifest. It registers the `project` entity
 * type, the two structural links a Project owns (`project.belongs_to_area` and
 * `project.advances_goal`, both directed child → parent), and the Project
 * completion Activity types. Hierarchy correctness lives in the SpineRepository
 * (ADR-014 §4.1); this manifest only declares discoverable metadata. FND-09 adds
 * the single navigable placeholder route the shell composes; the Projects product
 * experience arrives in its own roadmap phase.
 */

import { defineModule } from "~/kernel/modules";
import {
  AREA,
  GOAL,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
} from "~/kernel/spine";

import routes from "./routes.manifest";

export default defineModule({
  id: "projects",
  name: "Projects",
  description: "Finite bodies of work under an Area or a Goal.",
  order: 30,
  routes,
  entityTypes: [{ type: PROJECT, singular: "Project", plural: "Projects" }],
  entityLinkTypes: [
    {
      type: PROJECT_BELONGS_TO_AREA,
      sourceLabel: "belongs to area",
      targetLabel: "has project",
      sourceEntityType: PROJECT,
      targetEntityType: AREA,
    },
    {
      type: PROJECT_ADVANCES_GOAL,
      sourceLabel: "advances goal",
      targetLabel: "advanced by project",
      sourceEntityType: PROJECT,
      targetEntityType: GOAL,
    },
  ],
  activityTypes: [
    {
      type: PROJECT_COMPLETED,
      label: "Project completed",
      description: "A project was marked complete.",
    },
    {
      type: PROJECT_REOPENED,
      label: "Project reopened",
      description: "A completed project was reopened.",
    },
  ],
});
