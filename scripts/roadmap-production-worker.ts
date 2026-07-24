import type { EntityRecord, EntityType } from "~/kernel/entities";
import { AREA, GOAL, PROJECT, type SpineRecord } from "~/kernel/spine";
import type { TaskListItem } from "~/kernel/tasks";
import {
  resolveWorkspaceScope,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces/composition";

const AREA_TITLE = "Personal Systems & Development";
const GOAL_TITLE = "Complete DalyHub V2";
const PROJECT_TITLE = "DalyHub V2 Development Roadmap";
const GOAL_DEFINITION =
  "Deliver the DalyHub V2 roadmap as a dependable, production-safe personal planning and knowledge system, including core modules, mobile usability, data portability, backup and appropriate AI assistance.";
const CONFIRMATION = "CREATE DALYHUB ROADMAP";
const PAGE_SIZE = 100;

const COMPLETED_MILESTONES = [
  {
    title: "Milestone — Foundation and production platform",
    requiredIds: [
      "FND-01",
      "FND-02",
      "FND-03",
      "FND-04",
      "FND-05",
      "FND-06",
      "FND-07",
      "FND-08",
      "FND-09",
    ],
  },
  {
    title: "Milestone — Shared design system and interaction framework",
    requiredPrefixes: ["DS-", "PX-"],
  },
  {
    title: "Milestone — Today and task planning",
    requiredPrefixes: ["TODAY-"],
  },
  {
    title: "Milestone — Projects and project workflow",
    requiredIds: ["PROJ-01", "PROJ-02", "PROJ-04", "PROJ-05", "PROJ-06"],
  },
  {
    title: "Milestone — Areas, Goals and alignment",
    requiredIds: ["AREA-01", "AREA-02", "AREA-03"],
  },
] as const;

export type RoadmapExecutionMode = "dry-run" | "apply";

export type RoadmapItemInput = {
  readonly id: string;
  readonly title: string;
  readonly phase: string;
  readonly purpose: string;
  readonly dependencies: string;
  readonly expectedOutcome: string;
  readonly priority: string;
  readonly operationalBucket: "Current / Next" | "Upcoming" | "Later";
};

export type RoadmapRunInput = {
  readonly mode: RoadmapExecutionMode;
  readonly expectedWorkspaceId: string;
  readonly roadmapHash: string;
  readonly roadmapCommit: string;
  readonly openItems: readonly RoadmapItemInput[];
  readonly completedIds: readonly string[];
  readonly confirmation?: string;
};

type RecordAction = "created" | "reused" | "updated" | "skipped";

type RecordResult = {
  readonly kind: "area" | "goal" | "project" | "task" | "milestone";
  readonly id: string | null;
  readonly title: string;
  readonly action: RecordAction;
  readonly detail?: string;
};

export type RoadmapRunReport = {
  readonly mode: RoadmapExecutionMode;
  readonly workspaceId: string;
  readonly roadmapHash: string;
  readonly roadmapCommit: string;
  readonly records: readonly RecordResult[];
  readonly validation: {
    readonly area: { readonly id: string | null; readonly title: string };
    readonly goal: { readonly id: string | null; readonly title: string };
    readonly project: { readonly id: string | null; readonly title: string };
    readonly projectWorkflowStatus: string;
    readonly projectToGoalLink: "verified" | "planned";
    readonly openTasks: number;
    readonly completedMilestones: number;
    readonly totalTasks: number;
    readonly duplicateCheck: "passed";
    readonly applicationUrl: string;
    readonly projectUrl: string | null;
  };
  readonly ui: readonly string[];
  readonly limitations: readonly string[];
};

type RoadmapWorkerEnv = WorkspaceScopeEnv & {
  readonly ROADMAP_RUN_TOKEN?: string;
  readonly ROADMAP_TARGET?: string;
};

function normaliseTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function listEntitiesByType(
  scope: WorkspaceScope,
  type: EntityType,
): Promise<readonly EntityRecord[]> {
  const items: EntityRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await scope.entities.list({
      type,
      limit: PAGE_SIZE,
      cursor,
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function findUniqueEntityByTitle(
  scope: WorkspaceScope,
  type: EntityType,
  title: string,
): Promise<EntityRecord | null> {
  const wanted = normaliseTitle(title);
  const matches = (await listEntitiesByType(scope, type)).filter(
    (entity) => normaliseTitle(entity.title) === wanted,
  );
  if (matches.length > 1) {
    throw new Error(
      `Refusing to continue: found ${matches.length} active ${type} records titled “${title}”.`,
    );
  }
  return matches[0] ?? null;
}

async function listAllProjectTasks(
  scope: WorkspaceScope,
  projectId: string,
): Promise<readonly TaskListItem[]> {
  const items: TaskListItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await scope.tasks.listProjectTasks(projectId, {
      state: "all",
      limit: PAGE_SIZE,
      cursor,
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

function assertUniqueTaskTitles(tasks: readonly TaskListItem[]): void {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const title = normaliseTitle(task.title);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    throw new Error(
      `Refusing to continue: duplicate task titles exist in the roadmap project: ${duplicates
        .map(([title, count]) => `${title} (${count})`)
        .join(", ")}`,
    );
  }
}

function descriptionFor(item: RoadmapItemInput): string {
  return [
    `## ${item.id}`,
    "",
    `**Operational horizon:** ${item.operationalBucket}`,
    `**Roadmap phase:** ${item.phase}`,
    `**Priority:** ${item.priority}`,
    `**Dependencies:** ${item.dependencies}`,
    "",
    `**Purpose:** ${item.purpose}`,
    "",
    `**Expected outcome:** ${item.expectedOutcome}`,
    "",
    "Source of truth: `docs/roadmap/ROADMAP_V2.md` in `acedaly/DalyHub-V2`.",
  ].join("\n");
}

function isManagedRoadmapDescription(
  description: string,
  itemId: string,
): boolean {
  return (
    description.includes(`## ${itemId}`) &&
    description.includes("Source of truth: `docs/roadmap/ROADMAP_V2.md`")
  );
}

function milestoneDescription(title: string): string {
  return [
    "Completed phase summary for the DalyHub V2 development roadmap.",
    "",
    `Milestone: ${title.replace(/^Milestone — /, "")}`,
    "",
    "This is a compact visual summary of completed delivery, created and completed through DalyHub’s real task and Activity contracts. It is not a fabricated historical event or a separate milestone entity.",
  ].join("\n");
}

function isManagedMilestoneDescription(
  description: string,
  title: string,
): boolean {
  return (
    description.includes(
      "Completed phase summary for the DalyHub V2 development roadmap.",
    ) && description.includes(title.replace(/^Milestone — /, ""))
  );
}

function shouldCreateMilestone(
  milestone: (typeof COMPLETED_MILESTONES)[number],
  completedIds: ReadonlySet<string>,
  openIds: ReadonlySet<string>,
): boolean {
  if ("requiredIds" in milestone) {
    return milestone.requiredIds.every((id) => completedIds.has(id));
  }
  const completedMatching = [...completedIds].filter((id) =>
    milestone.requiredPrefixes.some((prefix) => id.startsWith(prefix)),
  );
  const hasOpenMatching = [...openIds].some((id) =>
    milestone.requiredPrefixes.some((prefix) => id.startsWith(prefix)),
  );
  return completedMatching.length > 0 && !hasOpenMatching;
}

async function verifyExistingHierarchy(
  scope: WorkspaceScope,
  area: SpineRecord,
  goal: SpineRecord,
  project: SpineRecord,
): Promise<void> {
  if (goal.parent?.kind !== "area" || goal.parent.id !== area.id) {
    throw new Error(
      `Existing Goal “${GOAL_TITLE}” is not under Area “${AREA_TITLE}”; refusing to move it.`,
    );
  }
  if (project.parent?.kind !== "goal" || project.parent.id !== goal.id) {
    throw new Error(
      `Existing Project “${PROJECT_TITLE}” is not linked to Goal “${GOAL_TITLE}”; refusing to move it.`,
    );
  }
}

async function resolveSpineRecord(
  scope: WorkspaceScope,
  entity: EntityRecord,
  expectedKind: "area" | "goal" | "project",
): Promise<SpineRecord> {
  const record = await scope.spine.getById(entity.id);
  if (!record || record.kind !== expectedKind) {
    throw new Error(
      `Entity “${entity.title}” exists but is not a valid active ${expectedKind} spine record.`,
    );
  }
  return record;
}

export type RoadmapRunHooks = {
  readonly afterMutation?: (label: string) => Promise<void> | void;
};

export async function runRoadmapPlan(
  scope: WorkspaceScope,
  input: RoadmapRunInput,
  hooks: RoadmapRunHooks = {},
): Promise<RoadmapRunReport> {
  if (scope.context.workspaceId !== input.expectedWorkspaceId) {
    throw new Error(
      `Workspace mismatch: resolved ${scope.context.workspaceId}, expected ${input.expectedWorkspaceId}.`,
    );
  }
  if (input.mode === "apply" && input.confirmation !== CONFIRMATION) {
    throw new Error(
      `Apply mode requires the exact confirmation “${CONFIRMATION}”.`,
    );
  }
  if (input.openItems.length === 0) {
    throw new Error(
      "The roadmap parser found no outstanding items; refusing to create an empty project.",
    );
  }

  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const item of input.openItems) {
    if (ids.has(item.id)) {
      throw new Error(`Duplicate roadmap id in input: ${item.id}`);
    }
    const title = normaliseTitle(item.title);
    if (titles.has(title)) {
      throw new Error(`Duplicate roadmap task title in input: ${item.title}`);
    }
    ids.add(item.id);
    titles.add(title);
  }

  const records: RecordResult[] = [];
  const apply = input.mode === "apply";
  const checkpoint = async (label: string) => {
    await hooks.afterMutation?.(label);
  };
  const openIds = new Set(input.openItems.map((item) => item.id));

  const areaEntity = await findUniqueEntityByTitle(scope, AREA, AREA_TITLE);
  const goalEntity = await findUniqueEntityByTitle(scope, GOAL, GOAL_TITLE);
  const projectEntity = await findUniqueEntityByTitle(
    scope,
    PROJECT,
    PROJECT_TITLE,
  );

  let area: SpineRecord | null = areaEntity
    ? await resolveSpineRecord(scope, areaEntity, "area")
    : null;
  let goal: SpineRecord | null = goalEntity
    ? await resolveSpineRecord(scope, goalEntity, "goal")
    : null;
  let project: SpineRecord | null = projectEntity
    ? await resolveSpineRecord(scope, projectEntity, "project")
    : null;

  if (!area && goal) {
    throw new Error(
      `Goal “${GOAL_TITLE}” already exists but Area “${AREA_TITLE}” does not; refusing to create a second hierarchy.`,
    );
  }
  if (!goal && project) {
    throw new Error(
      `Project “${PROJECT_TITLE}” already exists but Goal “${GOAL_TITLE}” does not; refusing to create a second hierarchy.`,
    );
  }
  if (
    area &&
    goal &&
    (goal.parent?.kind !== "area" || goal.parent.id !== area.id)
  ) {
    throw new Error(
      `Existing Goal “${GOAL_TITLE}” is not under Area “${AREA_TITLE}”; refusing to move it.`,
    );
  }
  if (
    goal &&
    project &&
    (project.parent?.kind !== "goal" || project.parent.id !== goal.id)
  ) {
    throw new Error(
      `Existing Project “${PROJECT_TITLE}” is not linked to Goal “${GOAL_TITLE}”; refusing to move it.`,
    );
  }

  const existingGoalDetails = goal ? await scope.goalDetails.get(goal.id) : null;
  if (goal && !existingGoalDetails) {
    throw new Error("Goal details could not be read.");
  }
  if (
    existingGoalDetails?.definitionOfDone !== null &&
    existingGoalDetails?.definitionOfDone !== undefined &&
    normaliseTitle(existingGoalDetails.definitionOfDone) !==
      normaliseTitle(GOAL_DEFINITION)
  ) {
    throw new Error(
      `Existing Goal “${GOAL_TITLE}” has a different definition of done; refusing to overwrite it.`,
    );
  }

  const existingProjectSettings = project
    ? await scope.projectSettings.get(project.id)
    : null;
  if (project && !existingProjectSettings) {
    throw new Error("Project settings could not be read.");
  }
  if (existingProjectSettings?.archivedAt) {
    throw new Error(
      "The roadmap Project is archived; restore it manually before running this script.",
    );
  }

  let existingTasks = project ? await listAllProjectTasks(scope, project.id) : [];
  assertUniqueTaskTitles(existingTasks);
  const taskByTitle = new Map(
    existingTasks.map((task) => [normaliseTitle(task.title), task]),
  );

  if (!area) {
    if (apply) {
      area = await scope.spine.createArea({ title: AREA_TITLE });
      await checkpoint("area.created");
      records.push({
        kind: "area",
        id: area.id,
        title: AREA_TITLE,
        action: "created",
      });
    } else {
      records.push({
        kind: "area",
        id: null,
        title: AREA_TITLE,
        action: "created",
        detail: "planned",
      });
    }
  } else {
    records.push({
      kind: "area",
      id: area.id,
      title: AREA_TITLE,
      action: "reused",
    });
  }

  if (!goal) {
    if (apply) {
      if (!area) {
        throw new Error("Area was not created.");
      }
      goal = await scope.spine.createGoal({
        title: GOAL_TITLE,
        areaId: area.id,
      });
      await checkpoint("goal.created");
      records.push({
        kind: "goal",
        id: goal.id,
        title: GOAL_TITLE,
        action: "created",
      });
    } else {
      records.push({
        kind: "goal",
        id: null,
        title: GOAL_TITLE,
        action: "created",
        detail: "planned",
      });
    }
  } else {
    records.push({
      kind: "goal",
      id: goal.id,
      title: GOAL_TITLE,
      action: "reused",
    });
  }

  if (
    goal &&
    (!existingGoalDetails || existingGoalDetails.definitionOfDone === null)
  ) {
    if (apply) {
      await scope.goalDetails.update(goal.id, {
        definitionOfDone: GOAL_DEFINITION,
      });
      await checkpoint("goal.definition.updated");
      records.push({
        kind: "goal",
        id: goal.id,
        title: GOAL_TITLE,
        action: "updated",
        detail: "definition of done set",
      });
    } else {
      records.push({
        kind: "goal",
        id: goal.id,
        title: GOAL_TITLE,
        action: "updated",
        detail: "definition of done will be set",
      });
    }
  }

  if (!project) {
    if (apply) {
      if (!goal) {
        throw new Error("Goal was not created.");
      }
      project = await scope.spine.createProject({
        title: PROJECT_TITLE,
        parent: { kind: "goal", id: goal.id },
      });
      await checkpoint("project.created");
      records.push({
        kind: "project",
        id: project.id,
        title: PROJECT_TITLE,
        action: "created",
      });
    } else {
      records.push({
        kind: "project",
        id: null,
        title: PROJECT_TITLE,
        action: "created",
        detail: "planned",
      });
    }
  } else {
    records.push({
      kind: "project",
      id: project.id,
      title: PROJECT_TITLE,
      action: "reused",
    });
  }

  if (area && goal && project) {
    await verifyExistingHierarchy(scope, area, goal, project);
  }

  if (project) {
    const settings = await scope.projectSettings.get(project.id);
    if (!settings) {
      throw new Error("Project settings could not be read.");
    }
    if (settings.status !== "active") {
      if (apply) {
        await scope.projectSettings.setStatus(project.id, "active");
        await checkpoint("project.status.active");
        records.push({
          kind: "project",
          id: project.id,
          title: PROJECT_TITLE,
          action: "updated",
          detail: "workflow status set to Active",
        });
      } else {
        records.push({
          kind: "project",
          id: project.id,
          title: PROJECT_TITLE,
          action: "updated",
          detail: "workflow status will be set to Active",
        });
      }
    }
  }

  for (const item of input.openItems) {
    const title = `${item.id} — ${item.title}`;
    const existing = taskByTitle.get(normaliseTitle(title));
    if (existing) {
      const fullTask = await scope.tasks.getTask(existing.id);
      if (!fullTask) {
        throw new Error(`Task ${existing.id} disappeared during validation.`);
      }
      if (
        fullTask.description !== null &&
        !isManagedRoadmapDescription(fullTask.description, item.id)
      ) {
        throw new Error(
          `Existing task “${title}” is not managed by the roadmap runner; refusing to reuse it.`,
        );
      }

      const shouldBeInProgress =
        item.id === "AREA-04" || item.id === "NOTES-01";
      const needsDescription = fullTask.description === null;
      const needsStatus =
        shouldBeInProgress && fullTask.status !== "in_progress";
      const needsReopen = fullTask.completedAt !== null;

      if (apply) {
        if (needsDescription || needsStatus) {
          await scope.tasks.updateTask(existing.id, {
            ...(needsStatus ? { status: "in_progress" as const } : {}),
            ...(needsDescription ? { description: descriptionFor(item) } : {}),
          });
          await checkpoint(`task.repaired:${item.id}`);
        }
        if (needsReopen) {
          await scope.spine.reopen(existing.id);
          await checkpoint(`task.reopened:${item.id}`);
        }
      }

      if (needsDescription || needsStatus || needsReopen) {
        const changes = [
          needsDescription ? "description" : null,
          needsStatus ? "Current / Next status" : null,
          needsReopen ? "open state" : null,
        ].filter(Boolean);
        records.push({
          kind: "task",
          id: existing.id,
          title,
          action: "updated",
          detail: apply
            ? `${changes.join(", ")} corrected`
            : `${changes.join(", ")} will be corrected`,
        });
      } else {
        records.push({
          kind: "task",
          id: existing.id,
          title,
          action: "reused",
        });
      }
      continue;
    }

    if (!apply) {
      records.push({
        kind: "task",
        id: null,
        title,
        action: "created",
        detail: item.operationalBucket,
      });
      continue;
    }
    if (!project) {
      throw new Error("Project was not created.");
    }
    const task = await scope.spine.createTask({
      title,
      parent: { kind: "project", id: project.id },
    });
    await scope.tasks.updateTask(task.id, {
      status:
        item.id === "AREA-04" || item.id === "NOTES-01"
          ? "in_progress"
          : "todo",
      description: descriptionFor(item),
    });
    await checkpoint(`task.created:${item.id}`);
    const created = await scope.tasks.getTask(task.id);
    if (!created) {
      throw new Error(`Created task ${task.id} could not be read back.`);
    }
    taskByTitle.set(normaliseTitle(title), created);
    records.push({
      kind: "task",
      id: task.id,
      title,
      action: "created",
      detail: item.operationalBucket,
    });
  }

  const completedIds = new Set(input.completedIds);
  for (const milestone of COMPLETED_MILESTONES) {
    if (!shouldCreateMilestone(milestone, completedIds, openIds)) {
      records.push({
        kind: "milestone",
        id: null,
        title: milestone.title,
        action: "skipped",
        detail: "completion conditions not met",
      });
      continue;
    }

    const existing = taskByTitle.get(normaliseTitle(milestone.title));
    if (existing) {
      const fullTask = await scope.tasks.getTask(existing.id);
      if (!fullTask) {
        throw new Error(
          `Milestone ${existing.id} disappeared during validation.`,
        );
      }
      if (
        fullTask.description !== null &&
        !isManagedMilestoneDescription(fullTask.description, milestone.title)
      ) {
        throw new Error(
          `Existing task “${milestone.title}” is not managed by the roadmap runner; refusing to reuse it.`,
        );
      }
      if (apply && fullTask.description === null) {
        await scope.tasks.updateTask(existing.id, {
          description: milestoneDescription(milestone.title),
        });
        await checkpoint(`milestone.repaired:${milestone.title}`);
      }
      if (!existing.completedAt) {
        if (apply) {
          await scope.tasks.completeTask(existing.id);
          await checkpoint(`milestone.completed:${milestone.title}`);
          records.push({
            kind: "milestone",
            id: existing.id,
            title: milestone.title,
            action: "updated",
            detail: "marked complete",
          });
        } else {
          records.push({
            kind: "milestone",
            id: existing.id,
            title: milestone.title,
            action: "updated",
            detail:
              fullTask.description === null
                ? "description will be repaired and task marked complete"
                : "will be marked complete",
          });
        }
      } else if (fullTask.description === null) {
        records.push({
          kind: "milestone",
          id: existing.id,
          title: milestone.title,
          action: "updated",
          detail: apply
            ? "missing milestone description repaired"
            : "missing milestone description will be repaired",
        });
      } else {
        records.push({
          kind: "milestone",
          id: existing.id,
          title: milestone.title,
          action: "reused",
        });
      }
      continue;
    }

    if (!apply) {
      records.push({
        kind: "milestone",
        id: null,
        title: milestone.title,
        action: "created",
        detail: "will be completed immediately",
      });
      continue;
    }
    if (!project) {
      throw new Error("Project was not created.");
    }
    const task = await scope.spine.createTask({
      title: milestone.title,
      parent: { kind: "project", id: project.id },
    });
    await scope.tasks.updateTask(task.id, {
      description: milestoneDescription(milestone.title),
    });
    await scope.tasks.completeTask(task.id);
    await checkpoint(`milestone.created:${milestone.title}`);
    const completed = await scope.tasks.getTask(task.id);
    if (!completed) {
      throw new Error(`Completed milestone ${task.id} could not be read back.`);
    }
    taskByTitle.set(normaliseTitle(milestone.title), completed);
    records.push({
      kind: "milestone",
      id: task.id,
      title: milestone.title,
      action: "created",
      detail: "created and completed",
    });
  }

  if (apply && project) {
    existingTasks = await listAllProjectTasks(scope, project.id);
    assertUniqueTaskTitles(existingTasks);
  }

  const finalSettings = project
    ? await scope.projectSettings.get(project.id)
    : null;
  const finalTasks = apply && project ? existingTasks : [...taskByTitle.values()];
  const targetTitles = new Set([
    ...input.openItems.map((item) =>
      normaliseTitle(`${item.id} — ${item.title}`),
    ),
    ...COMPLETED_MILESTONES.filter((milestone) =>
      shouldCreateMilestone(milestone, completedIds, openIds),
    ).map((milestone) => normaliseTitle(milestone.title)),
  ]);
  const targetTasks = finalTasks.filter((task) =>
    targetTitles.has(normaliseTitle(task.title)),
  );
  const plannedMilestones = COMPLETED_MILESTONES.filter((milestone) =>
    shouldCreateMilestone(milestone, completedIds, openIds),
  );
  const missingOpenTasks = input.openItems.filter(
    (item) =>
      !taskByTitle.has(normaliseTitle(`${item.id} — ${item.title}`)),
  ).length;
  const missingMilestones = plannedMilestones.filter(
    (milestone) => !taskByTitle.has(normaliseTitle(milestone.title)),
  ).length;
  const openTasks = apply
    ? finalTasks.filter((task) => !task.completedAt).length
    : finalTasks.filter((task) => !task.completedAt).length + missingOpenTasks;
  const completedMilestones = apply
    ? targetTasks.filter(
        (task) =>
          task.completedAt && task.title.startsWith("Milestone — "),
      ).length
    : plannedMilestones.length;
  const totalTasks = apply
    ? finalTasks.length
    : finalTasks.length + missingOpenTasks + missingMilestones;

  return {
    mode: input.mode,
    workspaceId: scope.context.workspaceId,
    roadmapHash: input.roadmapHash,
    roadmapCommit: input.roadmapCommit,
    records,
    validation: {
      area: { id: area?.id ?? null, title: AREA_TITLE },
      goal: { id: goal?.id ?? null, title: GOAL_TITLE },
      project: { id: project?.id ?? null, title: PROJECT_TITLE },
      projectWorkflowStatus:
        finalSettings?.status ?? (apply ? "unknown" : "active (planned)"),
      projectToGoalLink: project && goal ? "verified" : "planned",
      openTasks,
      completedMilestones,
      totalTasks,
      duplicateCheck: "passed",
      applicationUrl: "https://hub.daly.id.au",
      projectUrl: project
        ? `https://hub.daly.id.au/projects/${project.id}`
        : null,
    },
    ui: [
      "Project → Tasks: actionable and completed roadmap work, with honest roll-up progress.",
      "Project → Activity: the real shared Activity timeline for creation, status and completion events.",
      "Project → Settings: Active workflow status and Goal/Area organisation.",
      "Goal record: Project contribution and Alignment evidence.",
      "Area record: Goal, Project and momentum roll-ups.",
      "Today: Current/Next tasks when they are open and eligible for Today’s real task views.",
    ],
    limitations: [
      "DalyHub does not yet provide a Gantt-style roadmap timeline.",
      "DalyHub does not yet provide a dedicated Project board or milestone entity; completed milestone tasks are used sparingly instead.",
      "Project descriptions are not currently persisted, so no new field is invented for the requested project context.",
      "Operational horizons are documented in task descriptions; no fake due dates or priority-based columns are created.",
    ],
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: RoadmapWorkerEnv): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    if (env.ROADMAP_TARGET !== "production") {
      return json({ error: "target_not_production" }, 503);
    }
    const token = request.headers.get("authorization");
    if (
      !env.ROADMAP_RUN_TOKEN ||
      token !== `Bearer ${env.ROADMAP_RUN_TOKEN}`
    ) {
      return json({ error: "unauthorised" }, 401);
    }
    try {
      const input = (await request.json()) as RoadmapRunInput;
      const scope = await resolveWorkspaceScope(env);
      const report = await runRoadmapPlan(scope, input);
      return json(report);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown roadmap runner error";
      return json({ error: "roadmap_run_failed", message }, 400);
    }
  },
};
