/**
 * TODAY-02 / PROJ-01 — the shared Task record Drawer content.
 *
 * The re-homed, module-agnostic task record surface: given a task id, it loads the
 * task from the `/tasks/:id` resource route, renders the shared DS-02 Record Layout
 * (Header + Summary + Details / Links / Activity tabs, Activity last), and drives
 * every mutation (edit, completion, link/unlink, waiting, planning) back through
 * that route — so the user stays on their current surface (Today OR a Project) while
 * opening, editing, completing and reopening the task. A successful mutation
 * refreshes the Drawer AND revalidates the current route loader, so edits appear on
 * the host surface (e.g. a project's rollup + task list) with no hard reload. A
 * missing/deleted/cross-workspace id renders the calm not-found state.
 *
 * This is the ONE task record Drawer, task action route and completion path (ADR-028
 * / ADR-033). It knows nothing of Today's keyboard workflow: it exposes its live task
 * state and mutation handlers through the optional `onApiChange` seam so the Today
 * module can register its contextual keyboard commands (TODAY-05) around it without a
 * second drawer, form, action route or completion path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useDrawer } from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import { FormButton, type SubmitOutcome } from "~/shared/forms";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import { CollectionSkeleton } from "~/shared/skeleton";

import type { TaskActionData, TaskDetailData } from "./contract";
import { TaskDetailsTab, type TaskDetailsValues } from "./TaskDetailsTab";
import { TaskLinksTab } from "./TaskLinksTab";
import { TaskTimelineTab } from "./TaskTimelineTab";
import {
  TaskPlanningSection,
  type PlanningActionOutcome,
} from "./TaskPlanningSection";
import {
  TaskWaitingSection,
  type WaitingActionOutcome,
} from "./TaskWaitingSection";
import {
  isTaskComplete,
  taskDisplayStatus,
  taskPriorityLabel,
  type SerializedTaskView,
} from "./task-view";

/**
 * The live task-record API a host module can observe to add behaviour AROUND the
 * shared Drawer (e.g. Today's contextual keyboard commands) without duplicating any
 * of its state, mutations or routes. `null` while the task is loading.
 */
export interface TaskRecordDrawerApi {
  readonly task: SerializedTaskView | null;
  /** The effective completed state (optimistic override applied). */
  readonly completed: boolean;
  /** Whether the task is actively waiting (and not completed). */
  readonly waitingActive: boolean;
  readonly toggleCompletion: (complete: boolean) => void;
  readonly planTask: (scheduledDate: string) => Promise<PlanningActionOutcome>;
  readonly clearPlan: () => Promise<PlanningActionOutcome>;
  readonly clearWaiting: () => Promise<WaitingActionOutcome>;
  readonly close: () => void;
}

interface TaskRecordDrawerProps {
  readonly taskId: string;
  /**
   * The base path of the task resource route. Defaults to `/tasks` — the canonical
   * re-homed endpoint. Exposed only for tests; product code uses the default.
   */
  readonly basePath?: string;
  /**
   * Optional seam: called with the live task API whenever it changes, so a host
   * module can compose behaviour around the shared Drawer (TODAY-05 keyboard
   * commands). Omitted by consumers (e.g. Projects) that need no extra behaviour.
   */
  readonly onApiChange?: (api: TaskRecordDrawerApi) => void;
}

type DetailResponse = TaskDetailData | { readonly error: string };

export function TaskRecordDrawer({
  taskId,
  basePath = "/tasks",
  onApiChange,
}: TaskRecordDrawerProps) {
  const detailUrl = `${basePath}/${encodeURIComponent(taskId)}`;
  const revalidator = useRevalidator();
  const { closeDrawer } = useDrawer();
  const { notifySuccess, notifyError } = useFeedback();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [optimisticComplete, setOptimisticComplete] = useState<boolean | null>(
    null,
  );
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(detailUrl, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as DetailResponse;
      setData(body);
      setLoadError(false);
      setOptimisticComplete(null);
    } catch {
      setLoadError(true);
    }
  }, [detailUrl]);

  // Load once per task, and expose `load` for refreshes after a mutation.
  useEffect(() => {
    if (loadedFor.current !== detailUrl) {
      loadedFor.current = detailUrl;
      void load();
    }
  });

  const postAction = useCallback(
    async (form: FormData): Promise<TaskActionData> => {
      const response = await fetch(detailUrl, { method: "POST", body: form });
      return (await response.json()) as TaskActionData;
    },
    [detailUrl],
  );

  const refresh = useCallback(() => {
    void load();
    revalidator.revalidate();
  }, [load, revalidator]);

  const submitUpdate = useCallback(
    async (
      values: TaskDetailsValues,
    ): Promise<SubmitOutcome<TaskDetailsValues>> => {
      const form = new FormData();
      form.set("intent", "update");
      form.set("title", values.title);
      form.set("status", values.status);
      form.set("priority", values.priority);
      form.set("dueDate", values.dueDate);
      form.set("scheduledDate", values.scheduledDate);
      form.set("description", values.description);
      const result = await postAction(form);
      if (result.kind === "update" && result.status === "success") {
        notifySuccess("Task saved.");
        refresh();
        return { status: "success" };
      }
      if (result.kind === "update" && result.status === "error") {
        return {
          status: "error",
          formError: result.formError,
          fieldErrors: result.fieldErrors as
            | Partial<Record<keyof TaskDetailsValues & string, string>>
            | undefined,
        };
      }
      return {
        status: "error",
        formError: "Your changes couldn't be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  const toggleCompletion = useCallback(
    async (complete: boolean) => {
      setCompletionPending(true);
      setOptimisticComplete(complete);
      const form = new FormData();
      form.set("intent", complete ? "complete" : "reopen");
      try {
        const result = await postAction(form);
        if (result.kind === "completion" && result.ok) {
          notifySuccess(complete ? "Task completed." : "Task reopened.");
          refresh();
        } else {
          setOptimisticComplete(null);
          notifyError(
            result.kind === "completion" && !result.ok
              ? result.message
              : "That couldn't be saved. Please try again.",
          );
        }
      } catch {
        setOptimisticComplete(null);
        notifyError("That couldn't be saved. Please try again.");
      } finally {
        setCompletionPending(false);
      }
    },
    [postAction, notifySuccess, notifyError, refresh],
  );

  const searchTargets = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const url = new URL(`${detailUrl}/link-targets`, window.location.origin);
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
    [detailUrl],
  );

  const linkTarget = useCallback(
    async (params: {
      readonly target: EntityLinkTargetOption;
      readonly linkType: string;
      readonly direction: "outgoing" | "incoming";
    }) => {
      const form = new FormData();
      form.set("intent", "link");
      form.set("targetId", params.target.id);
      form.set("linkType", params.linkType);
      form.set("direction", params.direction);
      const result = await postAction(form);
      if (!(result.kind === "link" && result.ok)) {
        throw new Error(
          result.kind === "link" && result.message
            ? result.message
            : "That link couldn't be created.",
        );
      }
      refresh();
    },
    [postAction, refresh],
  );

  const unlinkTarget = useCallback(
    async (link: EntityLinkSelection) => {
      const form = new FormData();
      form.set("intent", "unlink");
      form.set("linkId", link.linkId);
      const result = await postAction(form);
      if (!(result.kind === "unlink" && result.ok)) {
        throw new Error("That link couldn't be removed.");
      }
      refresh();
    },
    [postAction, refresh],
  );

  const searchWaitingTargets = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const url = new URL(
        `${detailUrl}/waiting-targets`,
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
    [detailUrl],
  );

  const setWaiting = useCallback(
    async (
      payload:
        | { readonly mode: "entity"; readonly targetId: string }
        | { readonly mode: "text"; readonly note: string },
    ): Promise<WaitingActionOutcome> => {
      const form = new FormData();
      form.set("intent", "set_waiting");
      form.set("waitingMode", payload.mode);
      if (payload.mode === "entity") {
        form.set("waitingTargetId", payload.targetId);
      } else {
        form.set("waitingNote", payload.note);
      }
      const result = await postAction(form);
      if (result.kind === "waiting" && result.status === "success") {
        notifySuccess("Marked as waiting.");
        refresh();
        return { ok: true };
      }
      if (result.kind === "waiting" && result.status === "error") {
        return {
          ok: false,
          formError: result.formError,
          fieldErrors: result.fieldErrors,
        };
      }
      return {
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  const clearWaiting = useCallback(async (): Promise<WaitingActionOutcome> => {
    const form = new FormData();
    form.set("intent", "clear_waiting");
    const result = await postAction(form);
    if (result.kind === "waiting" && result.status === "success") {
      notifySuccess("No longer waiting.");
      refresh();
      return { ok: true };
    }
    if (result.kind === "waiting" && result.status === "error") {
      return { ok: false, formError: result.formError };
    }
    return {
      ok: false,
      formError: "That couldn't be saved. Please try again.",
    };
  }, [postAction, notifySuccess, refresh]);

  const planTask = useCallback(
    async (scheduledDate: string): Promise<PlanningActionOutcome> => {
      const form = new FormData();
      form.set("intent", "plan");
      form.set("scheduledDate", scheduledDate);
      const result = await postAction(form);
      if (result.kind === "planning" && result.status === "success") {
        notifySuccess("Plan updated.");
        refresh();
        return { ok: true };
      }
      if (result.kind === "planning" && result.status === "error") {
        return {
          ok: false,
          formError: result.formError,
          fieldErrors: result.fieldErrors,
        };
      }
      return {
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  const clearPlan = useCallback(async (): Promise<PlanningActionOutcome> => {
    const form = new FormData();
    form.set("intent", "clear_plan");
    const result = await postAction(form);
    if (result.kind === "planning" && result.status === "success") {
      notifySuccess("Plan cleared.");
      refresh();
      return { ok: true };
    }
    if (result.kind === "planning" && result.status === "error") {
      return { ok: false, formError: result.formError };
    }
    return {
      ok: false,
      formError: "That couldn't be saved. Please try again.",
    };
  }, [postAction, notifySuccess, refresh]);

  const activeTask = data !== null && !("error" in data) ? data.task : null;
  const activeCompleted = activeTask
    ? optimisticComplete !== null
      ? optimisticComplete
      : isTaskComplete(activeTask)
    : false;
  const activeWaiting =
    activeTask !== null && activeTask.waiting !== null && !activeCompleted;

  // Publish the live task API to an optional host (TODAY-05 keyboard commands). The
  // memo is keyed on the observable state + the stable mutation handlers, so it fires
  // only when something a host would care about changes — never on every render.
  const api = useMemo<TaskRecordDrawerApi>(
    () => ({
      task: activeTask,
      completed: activeCompleted,
      waitingActive: activeWaiting,
      toggleCompletion: (complete) => void toggleCompletion(complete),
      planTask,
      clearPlan,
      clearWaiting,
      close: () => closeDrawer(),
    }),
    [
      activeTask,
      activeCompleted,
      activeWaiting,
      toggleCompletion,
      planTask,
      clearPlan,
      clearWaiting,
      closeDrawer,
    ],
  );
  useEffect(() => {
    onApiChange?.(api);
  }, [api, onApiChange]);

  if (loadError) {
    return (
      <EmptyState
        title="We couldn't load this task"
        description="Something went wrong. Please try again."
        primaryAction={
          <FormButton
            type="button"
            variant="secondary"
            onClick={() => void load()}
          >
            Retry
          </FormButton>
        }
      />
    );
  }

  if (data === null) {
    return <CollectionSkeleton count={3} />;
  }

  if ("error" in data) {
    return (
      <EmptyState
        title="We couldn't find that task"
        description="It may have been deleted, or the link is out of date."
      />
    );
  }

  const task = data.task;
  const completed =
    optimisticComplete !== null ? optimisticComplete : isTaskComplete(task);
  const waitingActive = task.waiting !== null && !completed;
  const status = taskDisplayStatus(completed, task.status, waitingActive);

  // Scheduled + Due are shown by the Planning section (TODAY-04), so they are not
  // duplicated here; the summary metadata carries the remaining task facts.
  const metadata: RecordMetaItem[] = [];
  metadata.push({
    id: "priority",
    label: "Priority",
    value: taskPriorityLabel(task.priority),
  });
  if (task.project) {
    metadata.push({
      id: "project",
      label: "Project",
      value: task.project.title,
    });
  }
  if (task.goal) {
    metadata.push({ id: "goal", label: "Goal", value: task.goal.title });
  }
  if (task.area) {
    metadata.push({ id: "area", label: "Area", value: task.area.title });
  }

  return (
    <RecordLayout
      title={task.title}
      headingLevel={3}
      typeLabel="Task"
      icon={<EntityIcon type="task" />}
      status={status}
      summary={{
        description: (
          <div className="dh-task-drawer__summary-controls">
            <TaskCompletion
              completed={completed}
              pending={completionPending}
              onToggle={toggleCompletion}
            />
            <TaskWaitingSection
              waiting={task.waiting}
              completed={completed}
              searchTargets={searchWaitingTargets}
              onSetWaiting={setWaiting}
              onClear={clearWaiting}
            />
            <TaskPlanningSection
              scheduledDate={task.scheduledDate}
              dueDate={task.dueDate}
              completed={completed}
              onPlan={planTask}
              onClear={clearPlan}
            />
          </div>
        ),
        metadata,
      }}
      tabs={[
        {
          id: "details",
          label: "Details",
          content: (
            <TaskDetailsTab
              task={task}
              isEditing={isEditing}
              onEdit={() => setEditing(true)}
              onCancel={() => setEditing(false)}
              onSubmit={submitUpdate}
              onSaved={() => setEditing(false)}
            />
          ),
        },
        {
          id: "links",
          label: "Links",
          content: (
            <TaskLinksTab
              task={task}
              links={data.links}
              searchTargets={searchTargets}
              onLink={linkTarget}
              onUnlink={unlinkTarget}
            />
          ),
        },
        {
          id: "activity",
          label: "Activity",
          content: <TaskTimelineTab taskId={taskId} basePath={basePath} />,
        },
      ]}
    />
  );
}

/** The completion control shown in the Summary — an accessible, 44px checkbox. */
function TaskCompletion({
  completed,
  pending,
  onToggle,
}: {
  readonly completed: boolean;
  readonly pending: boolean;
  readonly onToggle: (complete: boolean) => void;
}) {
  return (
    <label className="dh-task-drawer__completion">
      <input
        type="checkbox"
        checked={completed}
        disabled={pending}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <span>{completed ? "Completed" : "Mark complete"}</span>
    </label>
  );
}
