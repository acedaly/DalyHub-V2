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
import {
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  PROJECT_STATUS_CHANGED,
} from "~/kernel/project-settings";
import {
  PROJECT_CREATED_FROM_TEMPLATE,
  PROJECT_TEMPLATE,
  PROJECT_TEMPLATE_CREATED,
  PROJECT_TEMPLATE_DELETED,
  PROJECT_TEMPLATE_UPDATED,
} from "~/kernel/project-templates";
import { projectsCommands } from "./commands";
import {
  projectTemplatesSearchProvider,
  projectsSearchProvider,
} from "./search";

export default defineModule({
  id: "projects",
  name: "Projects",
  description: "Finite bodies of work under an Area or a Goal.",
  order: 30,
  routes,
  entityTypes: [
    { type: PROJECT, singular: "Project", plural: "Projects" },
    /*
     * PROJECT-02 — a Project template is a first-class ENTITY (identity,
     * workspace scope, soft-delete, Activity) and deliberately NOT a spine
     * record, so it never reaches a Project rollup, a Project count, Goal
     * progress, Project health, Today or Weekly Planning. Registering the type
     * here is what gives it a name in the shared vocabulary; it grants it
     * nothing else.
     */
    {
      type: PROJECT_TEMPLATE,
      singular: "Project template",
      plural: "Project templates",
    },
  ],
  searchProviders: [projectsSearchProvider, projectTemplatesSearchProvider],
  commands: projectsCommands,
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
      type: PROJECT_STATUS_CHANGED,
      label: "Project status changed",
      description: "A project workflow status changed.",
    },
    {
      type: PROJECT_ARCHIVED,
      label: "Project archived",
      description: "A project was archived.",
    },
    {
      type: PROJECT_RESTORED,
      label: "Project restored",
      description: "A project was restored.",
    },
    {
      type: PROJECT_TEMPLATE_CREATED,
      label: "Project template created",
      description: "A reusable project shape was saved.",
    },
    {
      type: PROJECT_TEMPLATE_UPDATED,
      label: "Project template updated",
      description: "A reusable project shape changed.",
    },
    {
      type: PROJECT_TEMPLATE_DELETED,
      label: "Project template deleted",
      description: "A reusable project shape was deleted.",
    },
    {
      type: PROJECT_CREATED_FROM_TEMPLATE,
      label: "Project created from a template",
      description:
        "A project was created from a template. Informational provenance only — the two are never synchronised.",
    },
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
