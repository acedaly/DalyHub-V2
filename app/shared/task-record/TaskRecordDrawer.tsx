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

import { TASK_PRIORITIES } from "~/kernel/tasks";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { useDrawer } from "~/shared/drawer";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import { FormButton, type SubmitOutcome } from "~/shared/forms";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";
import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
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
import { PriorityFlag } from "./PriorityIndicator";
import { UrgencyChip } from "./UrgencyChip";
import {
  isTaskComplete,
  taskDisplayState,
  taskPriorityLabel,
  taskRecurrenceLabel,
  timeSectorLabel,
  type SerializedTaskView,
} from "./task-view";

/**
 * EDIT-02 — the Task record's three most-changed values, edited where they are
 * shown.
 *
 * A Task's priority and dates were reachable only through the Details FORM (open
 * the tab, press "Edit details", change one control among twelve, press "Save
 * changes") or through the quick-edit panel on another surface entirely. Both
 * are heavier than the change deserves, and neither matches how the same values
 * are changed on an Area or a Project. The title, the priority and the two dates
 * now use the shared DS-16 fields; the form stays for the rest, because
 * delegation, recurrence and status genuinely interact and belong together.
 *
 * The priority menu carries REAL priorities only. "No priority" was an option in
 * the list, which made an untriaged Task read as though someone had chosen that
 * — so it is now the field's EMPTY state, and unsetting is one separated Clear
 * command that appears only when a priority is actually set.
 */
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: taskPriorityLabel(priority),
}));

/**
 * The live task-record API a host module can observe to add behaviour AROUND the
 * shared Drawer (e.g. Today's contextual keyboard commands) without duplicating any
 * of its state, mutations or routes. `null` while the task is loading.
 */
export interface TaskRecordDrawerApi {
  readonly task: SerializedTaskView | null;
  /**
   * AUDIT-14 — the OWNER's calendar day, exactly as the record route resolved it
   * from their stored timezone. Published so a host composing behaviour around
   * this drawer (the Today module's keyboard plan commands) plans against the
   * same day the drawer shows, instead of re-deriving one in the browser.
   * `null` until the record has loaded.
   */
  readonly todayIso: string | null;
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
  const capture = useCapture();
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
      // EDIT-02 — the title, the priority and the two dates are NOT submitted
      // here any more: they are edited on the record, and carrying them would
      // let this Save revert a change made in the Summary while the form was
      // open. The action treats an absent key as unchanged.
      form.set("status", values.status);
      form.set("timeSector", values.timeSector);
      form.set("commitmentState", values.commitmentState);
      form.set("delegateTo", values.delegateTo);
      form.set("delegatedOn", values.delegatedOn);
      form.set("followUpOn", values.followUpOn);
      form.set("delegateNote", values.delegateNote);
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
        formError: "Your changes couldn’t be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  /**
   * A single-id `/tasks/bulk` field change — the SAME trusted authority the bulk
   * bar and the quick-edit panel already use, so priority and due-date edits
   * from the record go through one server path rather than a third one. It
   * returns the DS-16 outcome shape: a refusal keeps the field's own message
   * beside the value and never applies anything optimistically.
   */
  const postBulkField = useCallback(
    async (fields: Record<string, string>): Promise<InlineSaveOutcome> => {
      const body = new FormData();
      body.append("id", taskId);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      try {
        const response = await fetch(`${basePath}/bulk`, {
          method: "POST",
          body,
        });
        const result = (await response.json()) as {
          readonly ok?: boolean;
          readonly formError?: string;
        };
        if (result.ok) {
          refresh();
          return { ok: true };
        }
        return {
          ok: false,
          message:
            result.formError ??
            "That couldn’t be saved. Nothing was changed — try again.",
        };
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Nothing was changed — try again.",
        };
      }
    },
    [basePath, refresh, taskId],
  );

  const renameTask = useCallback(
    async (title: string): Promise<InlineSaveOutcome> => {
      const form = new FormData();
      form.set("intent", "rename");
      form.set("title", title);
      try {
        const result = await postAction(form);
        if (result.kind === "update" && result.status === "success") {
          refresh();
          return { ok: true };
        }
        return {
          ok: false,
          message:
            (result.kind === "update" && result.status === "error"
              ? (result.fieldErrors?.title ?? result.formError)
              : undefined) ??
            "That couldn’t be saved. Your text is safe — try again.",
        };
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Your text is safe — try again.",
        };
      }
    },
    [postAction, refresh],
  );

  const setPriority = useCallback(
    (priority: string) => postBulkField({ intent: "set_priority", priority }),
    [postBulkField],
  );

  // TASKS-03: the DUE date is a deadline, distinct from the scheduled date —
  // setting one never touches the other. An empty value clears it.
  const setDueDate = useCallback(
    (dueDate: string | null) =>
      postBulkField({ intent: "set_due", dueDate: dueDate ?? "" }),
    [postBulkField],
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
              : "That couldn’t be saved. Please try again.",
          );
        }
      } catch {
        setOptimisticComplete(null);
        notifyError("That couldn’t be saved. Please try again.");
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
            : "That link couldn’t be created.",
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
        throw new Error("That link couldn’t be removed.");
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
        formError: "That couldn’t be saved. Please try again.",
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
      formError: "That couldn’t be saved. Please try again.",
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
        formError: "That couldn’t be saved. Please try again.",
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
      formError: "That couldn’t be saved. Please try again.",
    };
  }, [postAction, notifySuccess, refresh]);

  const activeTask = data !== null && !("error" in data) ? data.task : null;
  const activeTodayIso =
    data !== null && !("error" in data) ? data.todayIso : null;
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
      todayIso: activeTodayIso,
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
      activeTodayIso,
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
        title="We couldn’t load this task"
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
        title="We couldn’t find that task"
        description="It may have been deleted, or the link is out of date."
      />
    );
  }

  const task = data.task;
  const completed =
    optimisticComplete !== null ? optimisticComplete : isTaskComplete(task);
  const waitingActive = task.waiting !== null && !completed;
  const displayState = taskDisplayState({
    deletedAt: task.deletedAt,
    completedAt: completed ? (task.completedAt ?? task.updatedAt) : null,
    status: task.status,
    commitmentState: task.commitmentState,
    timeSector: task.timeSector,
    scheduledDate: task.scheduledDate,
    waiting: waitingActive ? task.waiting : null,
  });
  const status = { label: displayState.label, tone: displayState.tone };

  // Scheduled + Due are shown by the Planning section (TODAY-04), so they are not
  // duplicated here; the summary metadata carries the remaining task facts.
  const metadata: RecordMetaItem[] = [];
  // The shared coloured PriorityIndicator (TASKS-02) — `showEmpty` so an untriaged
  // task reads "No priority" here rather than an absent field. The full action word
  // ("Do"…"Delete / Review") is available to assistive tech.
  metadata.push({
    id: "priority",
    label: "Priority",
    // DS-16 — direct change, no clearing step: the current priority is the
    // trigger, every other priority is one press away in the menu, and the
    // separated Clear command appears only when there is one to clear.
    value: (
      <InlineSelectField
        label="Priority"
        value={task.priority ?? ""}
        options={PRIORITY_OPTIONS}
        onSave={setPriority}
        emptyLabel="Priority 4"
        renderValue={(option) =>
          option ? (
            <PriorityFlag
              priority={option.value as SerializedTaskView["priority"]}
              size="md"
              showLabel
            />
          ) : null
        }
        renderOption={(option) => (
          <PriorityFlag
            priority={option.value as SerializedTaskView["priority"]}
            size="md"
            showLabel
          />
        )}
        data-testid="task-priority-edit"
      />
    ),
  });
  if (task.dueDate || task.scheduledDate) {
    metadata.push({
      id: "urgency",
      label: "When",
      value: <UrgencyChip task={task} todayIso={data.todayIso} />,
    });
  }
  metadata.push({
    id: "sector",
    label: "Time Sector",
    value: timeSectorLabel(task.timeSector),
  });
  if (task.commitmentState === "someday") {
    metadata.push({
      id: "commitment",
      label: "Commitment",
      value: "Someday / Maybe",
    });
  }
  if (task.delegation) {
    metadata.push({
      id: "delegated",
      label: "Delegated to",
      value: task.delegation.to,
    });
  }
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
  // TASKS-04 — an Inbox task has NO structural parent, and the record says so with the
  // product's word for it. Silence would read as "we lost it".
  if (!task.project && !task.area) {
    metadata.push({ id: "parent", label: "Parent", value: "Unassigned" });
  }
  // A stored recurrence rule is a fact about the task, so it is reported here in the
  // same restrained vocabulary the parser and the Repeat control use.
  const recurrenceLabel = taskRecurrenceLabel(task.recurrence);
  if (recurrenceLabel !== null) {
    metadata.push({ id: "repeats", label: "Repeats", value: recurrenceLabel });
  }
  const taskCaptureContext: CaptureContextContract = {
    sourceEntityId: task.id,
    sourceEntityType: "task",
    sourceEntityTitle: task.title,
    sourceModule: "tasks",
    originatingRoute: `/tasks?drawer=task:${task.id}`,
    mode: "removable",
    relationshipMeaning: "related",
    returnTo: `/tasks?drawer=task:${task.id}`,
  };
  const contextualActions = [
    {
      id: "capture-note",
      label: "New linked note",
      onSelect: () => capture?.openCapture("note", null, taskCaptureContext),
    },
    {
      id: "capture-meeting",
      label: "New meeting",
      onSelect: () => capture?.openCapture("meeting", null, taskCaptureContext),
    },
    {
      id: "capture-diary",
      label: "New diary entry",
      onSelect: () => capture?.openCapture("diary", null, taskCaptureContext),
    },
  ];

  return (
    /*
     * DS-04 — the Task record's own scope hook.
     *
     * `RecordLayout` and `RecordSummary` are shared by every record type, and
     * DS-04 redesigns the TASK Drawer only (§27, §61). The wrapper is the
     * narrowest way to say "this one": the shared components are untouched, a
     * Project's or a Person's record keeps exactly what it had, and the rules
     * that de-card this panel cannot reach them.
     */
    <div className="dh-task-record">
      <RecordLayout
        title={task.title}
        titleSlot={
          <InlineTextField
            label="Task title"
            value={task.title}
            onSave={renameTask}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="task-title-edit"
          />
        }
        headingLevel={3}
        /*
         * RECORD-01 — no `typeLabel`. This record has no breadcrumb because it is
         * hosted in the Drawer, whose own panel header says "Task" and "Task
         * record" directly above the title — so the eyebrow was the third
         * statement of the same word in the first 100px of the panel.
         */
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
                todayIso={data.todayIso}
                completed={completed}
                onPlan={planTask}
                onClear={clearPlan}
                onSetDue={setDueDate}
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
            id: "linked",
            label: "Linked",
            content: (
              <TaskLinksTab
                task={task}
                links={data.links}
                searchTargets={searchTargets}
                onLink={linkTarget}
                onUnlink={unlinkTarget}
                contextualActions={contextualActions}
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
    </div>
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
