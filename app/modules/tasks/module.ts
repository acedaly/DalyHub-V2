/**
 * FND-07 — the Tasks product module manifest.
 *
 * A real, side-effect-free production manifest. It registers the `task` entity
 * type, the two structural links a Task owns (`task.belongs_to_area` and
 * `task.belongs_to_project`, both directed child → parent), and the Task
 * completion Activity types. Hierarchy correctness lives in the SpineRepository
 * (ADR-014 §4.1); this manifest only declares discoverable metadata. FND-09 adds
 * the single navigable placeholder route the shell composes; the Tasks product
 * experience arrives in its own roadmap phase.
 */

import { defineModule } from "~/kernel/modules";
import {
  AREA,
  PROJECT,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
  TASK_REOPENED,
} from "~/kernel/spine";
import {
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_ON,
  TASK_WAITING_STARTED,
} from "~/kernel/tasks";

import routes from "./routes.manifest";

export default defineModule({
  id: "tasks",
  name: "Tasks",
  description: "Atomic units of action under an Area or a Project.",
  order: 40,
  routes,
  entityTypes: [{ type: TASK, singular: "Task", plural: "Tasks" }],
  entityLinkTypes: [
    {
      type: TASK_BELONGS_TO_AREA,
      sourceLabel: "belongs to area",
      targetLabel: "has task",
      sourceEntityType: TASK,
      targetEntityType: AREA,
    },
    {
      type: TASK_BELONGS_TO_PROJECT,
      sourceLabel: "belongs to project",
      targetLabel: "has task",
      sourceEntityType: TASK,
      targetEntityType: PROJECT,
    },
    {
      // TODAY-03: the reserved link recording the entity a task is waiting on. The
      // target may be a Person, Project, Goal, Area or Task, so no single
      // `targetEntityType` metadata applies. Written only by the TaskRepository.
      type: TASK_WAITING_ON,
      sourceLabel: "waiting on",
      targetLabel: "blocking task",
      sourceEntityType: TASK,
    },
  ],
  activityTypes: [
    {
      type: TASK_COMPLETED,
      label: "Task completed",
      description: "A task was marked complete.",
    },
    {
      type: TASK_REOPENED,
      label: "Task reopened",
      description: "A completed task was reopened.",
    },
    {
      type: TASK_WAITING_STARTED,
      label: "Started waiting",
      description: "A task was marked as waiting on someone or something.",
    },
    {
      type: TASK_WAITING_CHANGED,
      label: "Changed waiting",
      description: "A waiting task's subject was changed.",
    },
    {
      type: TASK_WAITING_CLEARED,
      label: "Stopped waiting",
      description: "A task's waiting state was cleared.",
    },
  ],
});
