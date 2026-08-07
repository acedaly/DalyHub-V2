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
import {
  isRouteErrorResponse,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { listActiveLinks } from "~/platform/entity-links";
import {
  DEFAULT_KNOWLEDGE_PAGE,
  loadProjectKnowledge,
} from "~/platform/entity-links/project-knowledge";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { evaluateProjectHealth } from "~/kernel/project-health";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
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
import { ProjectActivityTab } from "../ProjectActivityTab";
import {
  ProjectKnowledgeTab,
  type SerializedKnowledgePage,
} from "../ProjectKnowledgeTab";
import { ProjectLinksTab } from "../ProjectLinksTab";
import { ProjectOverview } from "../ProjectOverview";
import { ProjectSettingsTab } from "../ProjectSettingsTab";
import { NEW_TASK_KEY, ProjectTasksTab } from "../ProjectTasksTab";
import { PROJECT_RELATES_TO } from "../project-links";
import {
  isProjectArchived,
  projectProgressFromRollup,
  serializeProjectOverview,
  serializeProjectTask,
  type ProjectProgress,
  type SerializedProjectOverview,
  type SerializedProjectTask,
} from "../project-view";
import type { ProjectMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

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
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    timezone = (await scope.appPreferences.get(session.user.subject)).timezone;
  } catch {
    // Keep the project reachable with the deterministic owner-calendar default.
  }
  const todayIso = ownerCalendarIso(new Date(), timezone);

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
  const healthContext = createOwnerHealthContext(new Date(), timezone);
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

  // The Settings tab's "Area or Goal" picker seeds from the CURRENT parent
  // alone (already present on `overview`) — it never fetches the whole
  // Area/Goal catalogue. Every other eligible parent is discovered through the
  // existing `/projects/parent-options?q=` search, so this loader (and every
  // ordinary revalidation of it — a task edit, a completion, a settings
  // change) stays independent of how many Areas/Goals the workspace has.
  const [taskPage, links, knowledge, settings] = await Promise.all([
    scope.tasks.listProjectTasks(projectId, { state: taskState }),
    listActiveLinks(
      { entities: scope.entities, entityLinks: scope.entityLinks },
      {
        anchorId: projectId,
        direction: "outgoing",
        linkTypes: [PROJECT_RELATES_TO],
      },
    ),
    // PROJ-03 — the first page of the project's linked Notes, server-rendered so
    // the Knowledge tab is populated without JavaScript. A relationship failure
    // degrades to an empty page rather than costing the whole record.
    loadProjectKnowledge(scope, projectId, {
      limit: DEFAULT_KNOWLEDGE_PAGE,
    }).catch(() => ({ notes: [], nextCursor: null })),
    scope.projectSettings.get(projectId),
  ]);

  return {
    // The KEY only. The settings repository has already normalised it, so a key
    // this build no longer recognises arrives as `null` and the Project renders
    // its entity default rather than an empty box.
    overview: serializeProjectOverview(overview, settings?.iconKey ?? null),
    progress,
    health,
    tasks: taskPage.items.map(serializeProjectTask),
    tasksNextCursor: taskPage.nextCursor,
    taskState,
    links,
    knowledge: {
      notes: knowledge.notes.map((note) => ({
        id: note.id,
        title: note.title,
        archived: note.archived,
        excerpt: note.excerpt,
        linkedAt: note.linkedAt,
      })),
      nextCursor: knowledge.nextCursor,
    } satisfies SerializedKnowledgePage,
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
    knowledge,
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
        knowledge={knowledge}
        todayIso={todayIso}
      />
    </DrawerProvider>
  );
}

/**
 * The Drawer resolver: a task record, or the new-task form.
 *
 * EDIT-02 removed the rename form and its `?drawer=rename` key. DS-16 moved the
 * Project rename onto the heading in PR #124 and left the form registered with
 * nothing to open it — a dead surface reachable only by hand-editing the URL,
 * carrying a second (and worse) failure behaviour for the same mutation.
 *
 * An ARCHIVED project is read-only (PROJ-05 §5): a Task record itself stays
 * readable (its OWN Drawer still opens — the shared task surface already
 * communicates a rejected mutation calmly, no second error path is built here),
 * but the "New Task" form is never rendered — even for a stale or hand-edited
 * `?drawer=` deep link — because every mutation it would attempt is rejected
 * server-side anyway. A calm read-only panel explains why instead. The heading's
 * inline title field renders read-only for the same reason.
 */
function createProjectDrawerRenderer(overview: SerializedProjectOverview) {
  const archived = isProjectArchived(overview);
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
      if (archived) {
        return {
          title: "Project archived",
          description: "Restore this project to add tasks.",
          children: <ArchivedDrawerNotice action="add a task" />,
        };
      }
      return {
        title: "New Task",
        description: `Add a task to ${overview.title}.`,
        children: <NewTaskDrawerHost projectId={overview.id} />,
      };
    }
    return null;
  };
}

/** A calm, read-only explanation shown in place of a form that would only fail
 * against an archived project — never a raw error, never a dead end. */
function ArchivedDrawerNotice({ action }: { readonly action: string }) {
  return (
    <p className="dh-project-archived-notice">
      This project is archived and read-only, so you can’t {action}
      right now. Open the project’s Settings tab to restore it first.
    </p>
  );
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

function ProjectDetail({
  overview,
  progress,
  health,
  tasks,
  tasksNextCursor,
  taskState,
  links,
  knowledge,
  todayIso,
}: {
  readonly overview: SerializedProjectOverview;
  readonly progress: ProjectProgress;
  readonly health: ProjectHealth;
  readonly tasks: readonly SerializedProjectTask[];
  readonly tasksNextCursor: string | null;
  readonly taskState: TaskState;
  readonly links: readonly EntityLinkSelection[];
  readonly knowledge: SerializedKnowledgePage;
  readonly todayIso: string;
}) {
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { notifySuccess, notifyError, notifyUndo } = useFeedback();
  const [completionPending, setCompletionPending] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const completed = overview.completedAt !== null;
  const archived = isProjectArchived(overview);

  // The active record tab is deep-linked via `?tab=` (DESIGN_SYSTEM → Tabs: record
  // tabs are preserved per record and deep-linkable), so a reload, a shared URL or
  // Back/Forward return to the SAME tab. Tasks is the default and carries no param
  // (a clean canonical URL). Switching tabs preserves the `?tasks=` filter and the
  // `?drawer=` state, and replaces history (no per-click Back stop).
  const requestedTab = searchParams.get("tab");
  const activeTabId =
    requestedTab === "linked" ||
    requestedTab === "knowledge" ||
    requestedTab === "activity" ||
    requestedTab === "settings"
      ? requestedTab
      : "tasks";
  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "tasks") {
            next.delete("tab");
          } else {
            next.set("tab", tabId);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const postMutation = useCallback(
    async (
      body: FormData,
      signal?: AbortSignal,
    ): Promise<ProjectMutationResult> => {
      const response = await fetch(
        `/projects/${encodeURIComponent(overview.id)}/mutate`,
        { method: "POST", body, signal },
      );
      return (await response.json()) as ProjectMutationResult;
    },
    [overview.id],
  );

  /** A calm, generic failure message for a settings mutation whose route did
   * not itself return one (e.g. a network failure, or a malformed response). */
  const SETTINGS_GENERIC_ERROR = "That couldn’t be saved. Please try again.";

  /**
   * DS-16 — the Project rename, driven from the record heading.
   *
   * Same trusted `rename` intent, same endpoint, same server-side guards (the
   * dispatcher already refuses every non-restore intent on an archived Project).
   * The refusal is RETURNED rather than thrown so the inline field can keep the
   * typed name and show the message — which the Drawer form could not do,
   * because closing it discarded the draft.
   */
  const onRename = useCallback(
    async (title: string) => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", title);
      const result = await postMutation(body);
      if (result.kind === "rename" && result.ok) {
        revalidator.revalidate();
        return { ok: true } as const;
      }
      const fieldError =
        result.kind === "rename" && "fieldErrors" in result
          ? result.fieldErrors?.title
          : undefined;
      const formError =
        "formError" in result
          ? result.formError
          : "message" in result
            ? result.message
            : undefined;
      return {
        ok: false,
        message:
          fieldError ??
          formError ??
          "That couldn’t be saved. Your text is safe — try again.",
      } as const;
    },
    [postMutation, revalidator],
  );

  const onSetStatus = useCallback(
    async (status: ProjectWorkflowStatus, signal: AbortSignal) => {
      const body = new FormData();
      body.set("intent", "set_status");
      body.set("status", status);
      const result = await postMutation(body, signal);
      if (result.kind !== "settings" || !result.ok) {
        throw new Error(
          result.kind === "settings" && result.message
            ? result.message
            : SETTINGS_GENERIC_ERROR,
        );
      }
      if (result.outcome === "changed") {
        revalidator.revalidate();
      }
    },
    [postMutation, revalidator],
  );

  const onMove = useCallback(
    async (parentId: string, signal: AbortSignal) => {
      const body = new FormData();
      body.set("intent", "move");
      body.set("parentId", parentId);
      const result = await postMutation(body, signal);
      if (result.kind !== "settings" || !result.ok) {
        throw new Error(
          result.kind === "settings" && result.message
            ? result.message
            : SETTINGS_GENERIC_ERROR,
        );
      }
      if (result.outcome === "moved") {
        revalidator.revalidate();
      }
    },
    [postMutation, revalidator],
  );

  const onSetIcon = useCallback(
    async (iconKey: EntityIconKey | null) => {
      const body = new FormData();
      body.set("intent", "set_icon");
      // Empty means reset-to-default, which the server honours as a real
      // choice rather than reading as an omitted field.
      body.set("iconKey", iconKey ?? "");
      const result = await postMutation(body);
      if (result.kind !== "setIcon" || !result.ok) {
        throw new Error(
          result.kind === "setIcon" && !result.ok
            ? result.formError
            : SETTINGS_GENERIC_ERROR,
        );
      }
      revalidator.revalidate();
    },
    [postMutation, revalidator],
  );

  const onArchive = useCallback(async () => {
    const body = new FormData();
    body.set("intent", "archive");
    const result = await postMutation(body);
    if (result.kind !== "settings" || !result.ok) {
      // The typed `ProjectArchiveBlockedError` message (or another calm
      // server-supplied message) surfaces INLINE in the confirmation dialog —
      // never claims success, never mutates anything, never appends Activity.
      throw new Error(
        result.kind === "settings" && result.message
          ? result.message
          : SETTINGS_GENERIC_ERROR,
      );
    }
    revalidator.revalidate();
  }, [postMutation, revalidator]);

  const onRestore = useCallback(async () => {
    const body = new FormData();
    body.set("intent", "restore");
    const result = await postMutation(body);
    if (result.kind !== "settings" || !result.ok) {
      throw new Error(
        result.kind === "settings" && result.message
          ? result.message
          : SETTINGS_GENERIC_ERROR,
      );
    }
    revalidator.revalidate();
  }, [postMutation, revalidator]);

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
          notifyError("That couldn’t be saved. Please try again.");
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
        notifyError("That couldn’t be saved. Please try again.");
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
            : "That link couldn’t be created.",
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
        throw new Error("That link couldn’t be removed.");
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
      onRename={onRename}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tasksTab={
        <ProjectTasksTab
          projectId={overview.id}
          tasks={tasks}
          nextCursor={tasksNextCursor}
          taskState={taskState}
          todayIso={todayIso}
          archived={archived}
        />
      }
      knowledgeTab={
        <ProjectKnowledgeTab
          projectId={overview.id}
          page={knowledge}
          readOnly={archived}
          onOpenNote={(noteId) =>
            navigate(`/notes/${encodeURIComponent(noteId)}`)
          }
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
          archived={archived}
        />
      }
      activityTab={
        // The project's real FND-05 Activity, rendered by the shared DS-05 Timeline.
        // `reloadKey` is the project's `updatedAt`: a rename/complete/reopen (or a
        // PROJ-05 status/archive/restore change — the SAME effective timestamp,
        // ADR-037 §37.2) bumps it and revalidation re-reads the first page (the new
        // event appears at the top, no hard reload, no duplicate rows); a
        // drawer-only URL change leaves it untouched, so already-loaded Activity
        // pages are preserved.
        <ProjectActivityTab
          projectId={overview.id}
          reloadKey={overview.updatedAt}
        />
      }
      onArchive={onArchive}
      onRestore={onRestore}
      settingsTab={
        // PROJ-05 Slice 3 — the shared DS-10b Settings surface. Always the final
        // tab (DESIGN_SYSTEM.md → Tabs).
        <ProjectSettingsTab
          overview={overview}
          health={health}
          onSetStatus={onSetStatus}
          onMove={onMove}
          onArchive={onArchive}
          onRestore={onRestore}
          onSetIcon={onSetIcon}
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
          title="We couldn’t find that project"
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
        description="We couldn’t load this project. Please try again."
        primaryAction={
          <a className="dh-btn dh-btn--primary" href="/projects">
            Back to Projects
          </a>
        }
      />
    </div>
  );
}
