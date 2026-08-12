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
import {
  applyRecurrenceFields,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";
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

/** The priority row's options. The empty value is a real choice, not a blank. */
const PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "No priority" },
  ...TASK_PRIORITIES.map((priority: TaskPriority) => ({
    value: priority,
    label: taskPriorityLabel(priority),
  })),
];

/** Add-a-day helpers for the one-tap due-date options (owner calendar, ISO dates). */
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

  /*
   * The due-date row's options: the three days a quick capture actually uses,
   * plus the empty value that means "no due date".
   *
   * An arbitrary calendar date is deliberately NOT here. This surface exists to
   * get a task out of the owner's head in two taps; a date picker in it is the
   * fuller form, and the fuller form is one link away at the top of the sheet
   * with the typed title carried across. The deterministic quick-capture parser
   * also still reads "next friday" straight out of the title, exactly as it does
   * on `/tasks`.
   */
  const dueOptions = useMemo(() => {
    if (todayIso === null) return [];
    return [
      { value: "", label: "No due date" },
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
        UIX-01 — the optional classification, as METADATA ROWS.
        
        The reference draws a new-task sheet as a big title with a short list of
        rows under it: a glyph, the current value, and the field's name. That is
        what these are. Before this the same three facts were a "Filing under
        Inbox" sentence, a searchable select, a row of four priority chips and a
        row of three date chips — eleven controls under a one-line field, on the
        surface whose entire purpose is speed.
        
        Every row is an ordinary labelled control, so each is one tap, keyboard
        operable, and announced with its own name. NONE of them is required:
        title-only capture is still type-and-Enter, and each row's own empty
        state ("No due date", "No priority", "Inbox") is a real value rather
        than a placeholder the owner must clear.
      */}
      <div className="dh-capture-rows">
        {dueOptions.length > 0 ? (
          <SelectField
            label="Due date"
            className="dh-capture-row"
            showOptionalCue={false}
            options={dueOptions}
            {...form.field("dueDate")}
          />
        ) : null}

        <SelectField
          label="Priority"
          className="dh-capture-row"
          showOptionalCue={false}
          options={PRIORITY_OPTIONS}
          {...form.field("priority")}
        />

        {/*
          TASKS-04 — the sheet ALWAYS states where the task will be filed,
          because "somewhere" is the one thing a trustworthy inbox may never be.
          With a fixed destination (captured from a Project record) that is a
          read-only row; otherwise it is the picker, whose empty value reads
          "Inbox" — a real destination, not the absence of one.
        */}
        {defaultParent ? (
          <p className="dh-capture-row dh-capture-row--fixed">
            <span className="dh-capture-row__value">{defaultParent.title}</span>
            <span className="dh-capture-row__name">Project</span>
          </p>
        ) : canChooseParent ? (
          <SelectField
            label="Project"
            className="dh-capture-row"
            placeholder="Inbox"
            showOptionalCue={false}
            options={parentSearch.withSelected(parentField.value)}
            onSearch={parentSearch.search}
            loading={parentSearch.loading}
            emptyMessage="No matching Projects or Areas"
            {...parentField}
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
