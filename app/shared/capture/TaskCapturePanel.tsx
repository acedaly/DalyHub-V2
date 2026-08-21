/**
 * MOBILE-01 — Quick Capture: Task.
 *
 * The product's fastest path to a captured Task, and the one the acceptance
 * criteria name explicitly: **open capture, type a title, press Enter**. With no
 * contextual Project or Area, that creates an Unassigned Inbox Task.
 *
 * Everything else is progressive disclosure.
 *
 * ── DHDS-09 — the metadata is a CONTEXTUAL LINE, not three form rows ────────
 * It was three stacked `SelectField` rows under the title: three labels, three
 * closed controls, a fixed order, and — for the due date — three hard-coded days
 * with no way to say "the 14th" without abandoning capture for the full form.
 *
 * It is now one quiet line of metadata under the title, where each value opens
 * the SAME surface the Task row opens: the date popover with the product's
 * presets and its month grid, the canonical priority menu, and the searchable
 * Project picker over the same bounded endpoint. Nothing is required, nothing is
 * a pill, and none of it is in the way of type-and-Enter.
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
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import {
  TaskDueDateControl,
  TaskParentControl,
  TaskPriorityControl,
} from "~/shared/task-record/TaskMetaControls";
import {
  applyRecurrenceFields,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";

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

export function TaskCapturePanel({
  firstFieldRef,
  onClose,
  captureContext,
  formId,
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
      // The panel's OWN Due date control is merged in here, so a date the owner
      // picked outranks the anchor TASKS-11 would otherwise imply for an
      // after-completion rule.
      applyRecurrenceFields(
        body,
        interpretation.recurrence,
        {
          scheduledDate: interpretation.scheduledDate,
          dueDate: dueDate || null,
        },
        todayIso,
      );

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
  const priorityField = form.field("priority");
  const dueField = form.field("dueDate");

  /*
   * The parent candidates, in the shared picker's option shape.
   *
   * `withSelected` keeps the CURRENT choice in the list even after a search has
   * narrowed past it, so the trigger can always resolve the name it is showing.
   */
  const parentOptions = useMemo(
    () =>
      parentSearch.withSelected(parentField.value).map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.description ? { support: option.description } : {}),
      })),
    [parentField.value, parentSearch],
  );
  /*
   * UIX-01 — the "Filing under …" sentence and the two chip rows are gone, and
   * with them the three derived values that fed them. The Project row's own
   * control now states the destination (its empty value reads "Inbox"), which
   * is one place saying it rather than a sentence and a picker that could
   * disagree.
   */

  const addAnother = useCallback(() => {
    setSuccess(null);
    // `resetToInitial`, not `reset`: after a successful save the committed
    // baseline IS the captured task, so `reset` would restore it rather than
    // clear the form.
    form.resetToInitial();
    // Focus returns to the title so the next capture is typing plus Enter.
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [form, firstFieldRef]);

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
      id={formId}
      aria-label="Capture a task"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
      className="dh-capture-form dh-capture-form--task"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />

      {/*
        The TITLE, as the surface's own headline field.
        
        UIX-01 gives it the reference's large borderless treatment (see
        `capture.css`) and hides its visible label: a phone sheet titled "New
        task" with one large field under it does not need the word "Title" above
        that field, and the label stays in the accessibility tree.

        Enter still submits — the browser's implicit submission for a lone text
        input — which IS the fast path the acceptance criteria name: open, type,
        Enter. Nothing below is required to reach it.
      */}
      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="What needs doing?"
        className="dh-capture-title"
        {...titleField}
        controlRef={(node) => {
          firstFieldRef.current = node instanceof HTMLElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      {/*
        DHDS-09 — the optional classification, as ONE CONTEXTUAL LINE.
        
        Three values under the title, each of which opens the same picker the
        Task row opens. Not three form rows and not a row of pills: a value that
        looks like metadata and becomes interactive on hover AND on focus (§42),
        which is exactly the shared read affordance every inline field already
        uses.
        
        NONE of them is required — title-only capture is still type-and-Enter —
        and each states a real value rather than a placeholder the owner must
        clear: "No due date", "Priority 4", "Inbox".
      */}
      <div className="dh-capture-meta">
        <TaskDueDateControl
          value={dueField.value}
          onChange={dueField.onChange}
          todayIso={todayIso}
          data-testid="capture-task-due"
        />

        <TaskPriorityControl
          value={priorityField.value}
          onChange={priorityField.onChange}
          data-testid="capture-task-priority"
        />

        {/*
          TASKS-04 — the surface ALWAYS states where the task will be filed,
          because "somewhere" is the one thing a trustworthy inbox may never be.
          With a fixed destination (captured from a Project record) that is a
          read-only line; otherwise it is the searchable picker over the same
          bounded endpoint the full form uses, whose empty value reads "Inbox".
        */}
        {defaultParent ? (
          <p className="dh-capture-meta__fixed">
            <span className="dh-capture-meta__value">
              {defaultParent.title}
            </span>
            <span className="dh-visually-hidden"> — Project</span>
          </p>
        ) : canChooseParent ? (
          <TaskParentControl
            value={parentField.value}
            onChange={parentField.onChange}
            options={parentOptions}
            onSearch={parentSearch.search}
            loading={parentSearch.loading}
            data-testid="capture-task-parent"
          />
        ) : null}
      </div>

      {/*
        The in-body submit stays, and it is not a duplicate of the sheet's
        header Save: the header button only exists when this panel is hosted by
        the capture SHEET (which passes a `formId` for it to target). Rendered
        from the same form state, so the two can never disagree — and a panel
        rendered anywhere else still has a submit.
      */}
      {formId === undefined ? (
        <div className="dh-capture-actions">
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Create task
          </FormButton>
        </div>
      ) : null}
    </Form>
  );
}
