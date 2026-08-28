/**
 * PROJ-01 / STEER-04 — Project creation, shared.
 *
 * The one create form and the one door a Goal's record opens it through. It
 * lives in `app/shared` because it is composed from more than one module's
 * surfaces (the Projects collection and a Goal's record), which is the same
 * reason `~/shared/goal-creation` exists.
 */

export {
  NewProjectForm,
  type CreateProjectResult,
  type TemplateOption,
} from "./NewProjectForm";
export {
  NewProjectForGoalDrawer,
  NEW_PROJECT_FOR_GOAL_KEY,
  NEW_PROJECT_FOR_GOAL_TITLE,
  newProjectForGoalDescription,
} from "./NewProjectForGoal";
export {
  useParentOptionsSearch,
  type ParentOptionsSearch,
} from "./use-parent-options-search";
