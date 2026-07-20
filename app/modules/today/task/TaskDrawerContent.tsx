/**
 * TODAY-02 — the task Drawer content (client orchestrator).
 *
 * Mounted by the Today DrawerProvider for a `task:<id>` key. It loads the task from
 * the `/today/task/:id` resource route, renders the shared DS-02 Record Layout
 * (Header + Summary + Details / Links / Activity tabs, Activity last), and drives
 * every mutation (edit, completion, link/unlink) back through that route — so the
 * user stays on /today while opening, editing, completing and reopening the task.
 * A successful mutation refreshes the Drawer AND revalidates the /today loader, so
 * edits appear on Today with no hard reload. A missing/deleted/cross-workspace id
 * renders the calm not-found state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

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

import type { TaskActionData, TaskDetailData } from "../routes/task-detail";
import { TaskDetailsTab, type TaskDetailsValues } from "./TaskDetailsTab";
import { TaskLinksTab } from "./TaskLinksTab";
import { TaskTimelineTab } from "./TaskTimelineTab";
import {
  TaskWaitingSection,
  type WaitingActionOutcome,
} from "./TaskWaitingSection";
import {
  formatCalendarDate,
  isTaskComplete,
  taskDisplayStatus,
  taskPriorityLabel,
} from "./task-view";

interface TaskDrawerContentProps {
  readonly taskId: string;
}

type DetailResponse = TaskDetailData | { readonly error: string };

export function TaskDrawerContent({ taskId }: TaskDrawerContentProps) {
  const detailUrl = `/today/task/${encodeURIComponent(taskId)}`;
  const revalidator = useRevalidator();
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

  const metadata: RecordMetaItem[] = [];
  const dueLabel = formatCalendarDate(task.dueDate);
  if (dueLabel) metadata.push({ id: "due", label: "Due", value: dueLabel });
  const scheduledLabel = formatCalendarDate(task.scheduledDate);
  if (scheduledLabel) {
    metadata.push({
      id: "scheduled",
      label: "Scheduled",
      value: scheduledLabel,
    });
  }
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
          content: <TaskTimelineTab taskId={taskId} />,
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
