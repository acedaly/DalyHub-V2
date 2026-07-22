/**
 * PROJ-01 — the project overview record route (`/projects/:projectId`).
 *
 * The project home: it reads the project through the trusted authenticated
 * composition boundary (the project read projection for the header/summary, the
 * SpineRepository rollup as the SOURCE OF TRUTH for progress, and the bounded
 * project-task query for the task list), and renders it through the shared DS-02
 * Record Layout. A task opens in the SAME shared Task Drawer used on Today
 * (`?drawer=task:<id>`) — keeping the project behind the Drawer — and every project
 * mutation goes through the trusted `/projects/:projectId/mutate` action (rename,
 * complete, reopen, create task, link/unlink). A successful mutation revalidates this
 * loader, so the roll-up progress and task list update with no hard reload.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo, useState } from "react";
import { isRouteErrorResponse, useRevalidator } from "react-router";

import { listActiveLinks } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { evaluateProjectHealth } from "~/kernel/project-health";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  createOwnerHealthContext,
  type ProjectHealth,
} from "~/shared/project-health";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { NewTaskForm } from "../NewTaskForm";
import { ProjectLinksTab } from "../ProjectLinksTab";
import { ProjectOverview } from "../ProjectOverview";
import { NEW_TASK_KEY, ProjectTasksTab } from "../ProjectTasksTab";
import { RenameProjectForm } from "../RenameProjectForm";
import { PROJECT_RELATES_TO } from "../project-links";
import {
  projectProgressFromRollup,
  serializeProjectOverview,
  serializeProjectTask,
  type ProjectProgress,
  type SerializedProjectOverview,
  type SerializedProjectTask,
} from "../project-view";
import type { ProjectMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";
type TaskState = "open" | "completed" | "all";

export function meta() {
  return [{ title: "Project · DalyHub" }];
}

function parseTaskState(value: string | null): TaskState {
  return value === "completed" || value === "all" ? value : "open";
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const projectId = params.projectId;
  const taskState = parseTaskState(
    new URL(request.url).searchParams.get("tasks"),
  );
  const todayIso = ownerCalendarIso(new Date());

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const overview = await scope.projects.getProjectOverview(projectId);
  if (!overview) {
    // Missing, soft-deleted, non-project or cross-workspace → the calm not-found.
    throw new Response("Not Found", { status: 404 });
  }

  // The AUTHORITATIVE roll-up (PROJ-01 §4): progress is derived from the spine, never
  // a cached column. `getRollup` returns a project rollup over active direct tasks.
  const rollup = await scope.spine.getRollup(projectId);
  const progress: ProjectProgress =
    rollup.kind === "project"
      ? projectProgressFromRollup(rollup.tasks)
      : projectProgressFromRollup({ total: 0, completed: 0, ratio: null });

  // The DERIVED health signal (PROJ-02): gather this project's facts and evaluate
  // with the owner-calendar clock. Facts are read live (never cached) so health
  // cannot drift from tasks, Activity or the rollup.
  const healthContext = createOwnerHealthContext(new Date());
  const healthFacts = await scope.projectHealth.getProjectHealthFacts(
    projectId,
    healthContext.todayIso,
  );
  const health: ProjectHealth = evaluateProjectHealth(
    healthFacts ?? {
      projectId,
      completedAt: overview.completedAt,
      createdAt: overview.createdAt,
      updatedAt: overview.updatedAt,
      taskTotal: rollup.kind === "project" ? rollup.tasks.total : 0,
      taskCompleted: rollup.kind === "project" ? rollup.tasks.completed : 0,
      waitingOpen: 0,
      overdueOpen: 0,
      slippedOpen: 0,
      upcomingDueOpen: 0,
      upcomingScheduledOpen: 0,
      oldestWaitingSince: null,
      lastMeaningfulActivityAt: null,
    },
    healthContext,
  );

  const [taskPage, links] = await Promise.all([
    scope.tasks.listProjectTasks(projectId, { state: taskState }),
    listActiveLinks(
      { entities: scope.entities, entityLinks: scope.entityLinks },
      {
        anchorId: projectId,
        direction: "outgoing",
        linkTypes: [PROJECT_RELATES_TO],
      },
    ),
  ]);

  return {
    overview: serializeProjectOverview(overview),
    progress,
    health,
    tasks: taskPage.items.map(serializeProjectTask),
    tasksNextCursor: taskPage.nextCursor,
    taskState,
    links,
    todayIso,
  };
}

export default function ProjectDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const {
    overview,
    progress,
    health,
    tasks,
    tasksNextCursor,
    taskState,
    links,
    todayIso,
  } = loaderData;

  const renderDrawer = useMemo(
    () => createProjectDrawerRenderer(overview),
    [overview],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <ProjectDetail
        overview={overview}
        progress={progress}
        health={health}
        tasks={tasks}
        tasksNextCursor={tasksNextCursor}
        taskState={taskState}
        links={links}
        todayIso={todayIso}
      />
    </DrawerProvider>
  );
}

/** The Drawer resolver: a task record, the new-task form, or the rename form. */
function createProjectDrawerRenderer(overview: SerializedProjectOverview) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    const separator = entry.key.indexOf(":");
    const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
    const id = separator === -1 ? "" : entry.key.slice(separator + 1);

    if (kind === "task" && id.length > 0) {
      return {
        title: "Task",
        description: "Task record",
        children: <TaskRecordDrawer taskId={id} />,
      };
    }
    if (entry.key === NEW_TASK_KEY) {
      return {
        title: "New task",
        description: `Add a task to ${overview.title}.`,
        children: <NewTaskDrawerHost projectId={overview.id} />,
      };
    }
    if (entry.key === RENAME_KEY) {
      return {
        title: "Rename project",
        description: "Give this project a clearer name.",
        children: (
          <RenameDrawerHost
            projectId={overview.id}
            currentTitle={overview.title}
          />
        ),
      };
    }
    return null;
  };
}

function NewTaskDrawerHost({ projectId }: { readonly projectId: string }) {
  const { closeDrawer, replaceDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <NewTaskForm
      projectId={projectId}
      onCreated={(taskId) => {
        // Reflect the new task and roll-up, then open it in the shared Task Drawer.
        revalidator.revalidate();
        replaceDrawer(`task:${taskId}`);
      }}
      onCancel={closeDrawer}
    />
  );
}

function RenameDrawerHost({
  projectId,
  currentTitle,
}: {
  readonly projectId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenameProjectForm
      projectId={projectId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

function ProjectDetail({
  overview,
  progress,
  health,
  tasks,
  tasksNextCursor,
  taskState,
  links,
  todayIso,
}: {
  readonly overview: SerializedProjectOverview;
  readonly progress: ProjectProgress;
  readonly health: ProjectHealth;
  readonly tasks: readonly SerializedProjectTask[];
  readonly tasksNextCursor: string | null;
  readonly taskState: TaskState;
  readonly links: readonly EntityLinkSelection[];
  readonly todayIso: string;
}) {
  const revalidator = useRevalidator();
  const { openDrawer } = useDrawer();
  const { notifySuccess, notifyError, notifyUndo } = useFeedback();
  const [completionPending, setCompletionPending] = useState(false);

  const completed = overview.completedAt !== null;

  const postMutation = useCallback(
    async (body: FormData): Promise<ProjectMutationResult> => {
      const response = await fetch(
        `/projects/${encodeURIComponent(overview.id)}/mutate`,
        { method: "POST", body },
      );
      return (await response.json()) as ProjectMutationResult;
    },
    [overview.id],
  );

  const submitCompletion = useCallback(
    async (intent: "complete" | "reopen") => {
      const body = new FormData();
      body.set("intent", intent);
      const result = await postMutation(body);
      if (result.kind === "completion" && result.ok) {
        revalidator.revalidate();
        return true;
      }
      return false;
    },
    [postMutation, revalidator],
  );

  const onToggleComplete = useCallback(
    async (complete: boolean) => {
      setCompletionPending(true);
      try {
        const ok = await submitCompletion(complete ? "complete" : "reopen");
        if (!ok) {
          notifyError("That couldn't be saved. Please try again.");
          return;
        }
        if (complete) {
          // Completing a project is reversible — offer Undo (which reopens it).
          notifyUndo("Project completed", {
            onUndo: () => void submitCompletion("reopen"),
          });
        } else {
          notifySuccess("Project reopened.");
        }
      } catch {
        notifyError("That couldn't be saved. Please try again.");
      } finally {
        setCompletionPending(false);
      }
    },
    [submitCompletion, notifyUndo, notifySuccess, notifyError],
  );

  const searchTargets = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const url = new URL(
        `/projects/${encodeURIComponent(overview.id)}/link-targets`,
        window.location.origin,
      );
      url.searchParams.set("q", query);
      const response = await fetch(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) return [];
      const body = (await response.json()) as {
        readonly options?: readonly EntityLinkTargetOption[];
      };
      return body.options ?? [];
    },
    [overview.id],
  );

  const onLink = useCallback(
    async (params: {
      readonly target: EntityLinkTargetOption;
      readonly linkType: string;
      readonly direction: "outgoing" | "incoming";
    }) => {
      const body = new FormData();
      body.set("intent", "link");
      body.set("targetId", params.target.id);
      body.set("linkType", params.linkType);
      body.set("direction", params.direction);
      const result = await postMutation(body);
      if (!(result.kind === "link" && result.ok)) {
        throw new Error(
          result.kind === "link" && result.message
            ? result.message
            : "That link couldn't be created.",
        );
      }
      revalidator.revalidate();
    },
    [postMutation, revalidator],
  );

  const onUnlink = useCallback(
    async (link: EntityLinkSelection) => {
      const body = new FormData();
      body.set("intent", "unlink");
      body.set("linkId", link.linkId);
      const result = await postMutation(body);
      if (!(result.kind === "unlink" && result.ok)) {
        throw new Error("That link couldn't be removed.");
      }
      revalidator.revalidate();
    },
    [postMutation, revalidator],
  );

  return (
    <ProjectOverview
      overview={overview}
      progress={progress}
      health={health}
      completed={completed}
      completionPending={completionPending}
      onToggleComplete={(complete) => void onToggleComplete(complete)}
      onRename={() => openDrawer(RENAME_KEY)}
      tasksTab={
        <ProjectTasksTab
          projectId={overview.id}
          tasks={tasks}
          nextCursor={tasksNextCursor}
          taskState={taskState}
          todayIso={todayIso}
        />
      }
      linksTab={
        <ProjectLinksTab
          projectId={overview.id}
          area={overview.area}
          goal={overview.goal}
          links={links}
          searchTargets={searchTargets}
          onLink={onLink}
          onUnlink={onUnlink}
        />
      }
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-project-not-found">
        <EmptyState
          icon={<EntityIcon type="project" />}
          title="We couldn't find that project"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/projects">
              Back to Projects
            </a>
          }
        />
      </div>
    );
  }
  return (
    <div className="dh-project-not-found">
      <EmptyState
        title="Something went wrong"
        description="We couldn't load this project. Please try again."
        primaryAction={
          <a className="dh-btn dh-btn--primary" href="/projects">
            Back to Projects
          </a>
        }
      />
    </div>
  );
}
