/**
 * MOBILE-01 — Quick Capture: Task.
 *
 * The product's fastest path to a captured Task, and the one the acceptance
 * criteria name explicitly: **open capture, type a title, press Enter**. With no
 * contextual Project or Area, that creates an Unassigned Inbox Task.
 *
 * Everything else is progressive disclosure:
 *   - Priority and Due date are optional CHIP rows — one tap each, never a
 *     collapsed select the thumb has to hunt for;
 *   - the optional parent picker is the same server-backed search the full form
 *     uses; leaving it empty keeps the Task in Inbox.
 *
 * It posts to `POST /tasks/new` — the SAME atomic TASKS-01 creation route the
 * full New Task form uses, so parent verification, validation and the created
 * task's Activity are identical whichever surface captured it. The title is run
 * through the deterministic TASKS-01 quick-capture parser, so `p1`/`next week`
 * tokens behave exactly as they do on `/tasks`.
 */

import { useCallback, useMemo, useState } from "react";

import {
  Form,
  FormButton,
  FormErrorSummary,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { parseQuickCapture } from "~/shared/task-record/quick-capture";
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";
import { taskPriorityLabel } from "~/shared/task-record/task-view";
import { TASK_PRIORITIES, type TaskPriority } from "~/kernel/tasks";

import { CaptureResult } from "./CaptureResult";
import {
  captureRelationshipPlan,
  encodeCaptureContext,
} from "./capture-context";
import { useCaptureContext } from "./use-capture-context";
import type { CapturePanelProps, CaptureSuccess } from "./types";

type Values = {
  readonly title: string;
  readonly parentId: string;
  readonly priority: string;
  readonly dueDate: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Project or Area",
  priority: "Priority",
  dueDate: "Due date",
};

/** The create result shape `/tasks/new` returns (TASKS-01 contract). */
type TasksCreateResponse =
  | { readonly kind: "create"; readonly ok: true; readonly taskId: string }
  | {
      readonly kind: "create";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

/** Add-a-day helpers for the one-tap due-date chips (owner calendar, ISO dates). */
function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const base = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const shifted = new Date(base + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

export function TaskCapturePanel({
  firstFieldRef,
  onClose,
  captureContext,
}: CapturePanelProps) {
  const { context, loading } = useCaptureContext();
  const parentSearch = useTaskParentSearch();
  const [success, setSuccess] = useState<CaptureSuccess | null>(null);

  const contextPlan = captureContext
    ? captureRelationshipPlan("task", captureContext.sourceEntityType)
    : null;
  const contextualParent =
    contextPlan?.kind === "task_parent"
      ? {
          id: captureContext!.sourceEntityId,
          kind: contextPlan.parentKind,
          title: captureContext!.sourceEntityTitle,
        }
      : null;
  const defaultParent = contextualParent ?? context?.defaultTaskParent ?? null;
  const todayIso = context?.todayIso ?? null;
  const canChooseParent = !loading && defaultParent === null;

  const form = useForm<Values>({
    initialValues: { title: "", parentId: "", priority: "", dueDate: "" },
    fields: {
      title: { validate: required("A title is required") },
    },
    fieldOrder: ["title", "parentId", "priority", "dueDate"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const parentId = defaultParent?.id ?? values.parentId;
      const parentKind =
        defaultParent?.kind ?? parentSearch.kindOf(values.parentId);

      // The SAME deterministic parser `/tasks` uses — never a second vocabulary.
      const interpretation = parseQuickCapture(values.title, {
        todayIso: todayIso ?? undefined,
      });
      const body = new FormData();
      body.set("intent", "create");
      body.set("title", interpretation.title);
      if (parentId && parentKind) {
        body.set("parentId", parentId);
        body.set("parentKind", parentKind);
      }
      if (captureContext) {
        body.set("captureContext", encodeCaptureContext(captureContext));
      }
      const priority = values.priority || interpretation.priority || "";
      if (priority) body.set("priority", priority);
      if (interpretation.timeSector) {
        body.set("timeSector", interpretation.timeSector);
      }
      if (interpretation.commitmentState !== "active") {
        body.set("commitmentState", interpretation.commitmentState);
      }
      const dueDate = values.dueDate || interpretation.dueDate || "";
      if (dueDate) body.set("dueDate", dueDate);
      if (interpretation.scheduledDate) {
        body.set("scheduledDate", interpretation.scheduledDate);
      }

      let data: TasksCreateResponse;
      try {
        const response = await fetch("/tasks/new", { method: "POST", body });
        data = (await response.json()) as TasksCreateResponse;
      } catch {
        // Recoverable: the entered text stays in the form (useForm contract).
        return {
          status: "error",
          formError:
            "That task couldn’t be created. Your text is safe — try again.",
        };
      }
      if (data.ok) {
        setSuccess({
          id: data.taskId,
          href: `/tasks?drawer=task:${data.taskId}`,
          openLabel: "Open task",
          message: `Task captured: ${interpretation.title}`,
        });
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.formError,
        fieldErrors: data.fieldErrors as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  const titleField = form.field("title");
  const parentField = form.field("parentId");
  const priorityValue = form.values.priority;
  const dueValue = form.values.dueDate;

  const addAnother = useCallback(() => {
    setSuccess(null);
    // `resetToInitial`, not `reset`: after a successful save the committed
    // baseline IS the captured task, so `reset` would restore it rather than
    // clear the form.
    form.resetToInitial();
    // Focus returns to the title so the next capture is typing plus Enter.
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [form, firstFieldRef]);

  const dueChips = useMemo(() => {
    if (todayIso === null) return [];
    return [
      { value: todayIso, label: "Today" },
      { value: shiftIso(todayIso, 1), label: "Tomorrow" },
      { value: shiftIso(todayIso, 7), label: "Next week" },
    ];
  }, [todayIso]);

  if (success) {
    return (
      <CaptureResult
        success={success}
        onAddAnother={addAnother}
        onDone={onClose}
      />
    );
  }

  return (
    <Form
      aria-label="Capture a task"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
      className="dh-capture-form"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />

      {/* A single-line capture field: Enter submits (the browser's implicit
          submission for a lone text input in a form), which IS the fast path. */}
      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="What needs doing?"
        {...titleField}
        controlRef={(node) => {
          firstFieldRef.current = node instanceof HTMLElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      {defaultParent ? (
        <p className="dh-capture-parent">
          Filing under <strong>{defaultParent.title}</strong>
        </p>
      ) : canChooseParent ? (
        <SelectField
          label="Parent"
          help="Leave blank to keep this task in Inbox."
          placeholder="Search Projects and Areas"
          options={parentSearch.withSelected(parentField.value)}
          onSearch={parentSearch.search}
          loading={parentSearch.loading}
          emptyMessage="No matching Projects or Areas"
          {...parentField}
        />
      ) : null}

      {/* Optional classification as one-tap chips — a priority or a date costs a
          single additional tap, never a trip into a collapsed form section. */}
      <div className="dh-capture-chips" role="group" aria-label="Priority">
        <span className="dh-capture-chips__label">Priority</span>
        <div className="dh-capture-chips__row">
          {TASK_PRIORITIES.map((priority: TaskPriority) => {
            const selected = priorityValue === priority;
            return (
              <button
                key={priority}
                type="button"
                className="dh-capture-chip"
                aria-pressed={selected}
                onClick={() =>
                  form.setValue("priority", selected ? "" : priority)
                }
              >
                {taskPriorityLabel(priority)}
              </button>
            );
          })}
        </div>
      </div>

      {dueChips.length > 0 ? (
        <div className="dh-capture-chips" role="group" aria-label="Due date">
          <span className="dh-capture-chips__label">Due</span>
          <div className="dh-capture-chips__row">
            {dueChips.map((chip) => {
              const selected = dueValue === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  className="dh-capture-chip"
                  aria-pressed={selected}
                  onClick={() =>
                    form.setValue("dueDate", selected ? "" : chip.value)
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="dh-capture-actions">
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Create task
        </FormButton>
      </div>
    </Form>
  );
}
