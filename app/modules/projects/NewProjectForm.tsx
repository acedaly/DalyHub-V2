/**
 * PROJ-01 — the "New Project" form, re-exported from its shared home.
 *
 * STEER-04 moved it to `~/shared/project-creation` because a Goal's record now
 * offers "New Project for this Goal", and a module may not import another
 * module's internals. The Projects collection keeps importing it from here, so
 * the move changed no call site — and there is still exactly ONE Project
 * creation form, posting to the ONE trusted `/projects/new` endpoint.
 */

export {
  NewProjectForm,
  type CreateProjectResult,
  type TemplateOption,
} from "~/shared/project-creation/NewProjectForm";
