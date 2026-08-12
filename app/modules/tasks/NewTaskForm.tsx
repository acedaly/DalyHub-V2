/**
 * TASKS-01 — the "New Task" quick-capture form (hosted in the shared DS-03 Drawer).
 *
 * Built entirely from DS-06 shared controls (`useForm`, `TextField`, `SelectField`,
 * `DateField`, `Form`, `FormActions`, `FormButton`) with explicit Save/Cancel,
 * required-field validation, duplicate-submit prevention (via `useForm`) and
 * server-authoritative errors. It posts to the trusted `/tasks` action
 * (`intent=create`); the server re-verifies the chosen parent's kind independently.
 *
 * Two parent modes, one form:
 *   - FIXED parent (a Project record's "Add task"): `projectId` binds the parent, so
 *     no picker is shown — the task is created under that project.
 *   - FREE parent (the `/tasks` quick-capture): a SERVER-BACKED, searchable picker
 *     querying the bounded `/tasks/parent-options?q=` endpoint (workspace-scoped,
 *     kinds resolved server-side). Leaving it blank creates an Unassigned Inbox Task.
 *
 * A deterministic quick-capture preview (ADR-043 §14) parses the title as the user
 * types and offers to fill the priority / sector / commitment fields and strip the
 * recognised tokens — never AI, never a guess beyond the closed token vocabulary.
 * Every entered value survives a validation or server failure (useForm contract).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CaptureContextChip,
  encodeCaptureContext,
  useUrlCaptureContext,
} from "~/shared/capture";
import { captureRelationshipPlan } from "~/shared/capture/capture-context";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import type { SelectOption } from "~/shared/forms/types";
import {
  applyRecurrenceFields,
  interpretationIsMeaningful,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";
import {
  taskPriorityLabel,
  timeSectorLabel,
} from "~/shared/task-record/task-view";
import {
  COMMITMENT_STATES,
  TASK_PRIORITIES,
  TIME_SECTORS,
} from "~/kernel/tasks";

import type { TasksCreateResult } from "./tasks-contract";

type Values = {
  readonly title: string;
  readonly parentId: string;
  readonly priority: string;
  readonly timeSector: string;
  readonly commitmentState: string;
  readonly dueDate: string;
  readonly scheduledDate: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Parent",
  priority: "Priority",
  timeSector: "Time sector",
  commitmentState: "Commitment",
  dueDate: "Due date",
  scheduledDate: "Scheduled date",
};

/*
 * DS-06 / DH-DS — the REAL values only. An unset optional field is EMPTY.
 *
 * These carried a first option labelled `No priority` / `No sector` with an
 * empty value, and it did the two things EDIT-02 already removed from the
 * inline selects for exactly the same reasons: it reads as a SELECTED DEFAULT
 * (a task nobody has triaged is not "set to No priority" — the field has simply
 * not been filled in), and it takes the first slot in the list, which is where
 * both the eye and the keyboard start.
 *
 * The unset state is now the field's PLACEHOLDER, and clearing a value it does
 * have is the combobox's own clear control — so an optional field lost nothing
 * but the pretence that emptiness was a choice.
 */
const PRIORITY_OPTIONS: readonly SelectOption[] = TASK_PRIORITIES.map((p) => ({
  value: p,
  label: taskPriorityLabel(p),
}));

const SECTOR_OPTIONS: readonly SelectOption[] = TIME_SECTORS.map((s) => ({
  value: s,
  label: timeSectorLabel(s),
}));

const COMMITMENT_OPTIONS: readonly SelectOption[] = COMMITMENT_STATES.map(
  (c) => ({ value: c, label: c === "someday" ? "Someday / Maybe" : "Active" }),
);

export interface NewTaskFormProps {
  /**
   * FIXED-parent mode: bind the task to this Project. When set, the parent picker
   * is hidden and the parent kind is `project`.
   */
  readonly projectId?: string;
  /** Resolved owner/workspace default capture parent, if still valid. */
  readonly defaultParent?: {
    readonly id: string;
    readonly kind: "area" | "project";
    readonly title: string;
  } | null;
  /** Owner-calendar date for deterministic quick-capture calendar phrases. */
  readonly todayIso?: string | null;
  /** Called with the new task's id after a successful create. */
  readonly onCreated: (taskId: string) => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
}

export function NewTaskForm({
  projectId,
  defaultParent = null,
  todayIso = null,
  onCreated,
  onCancel,
}: NewTaskFormProps) {
  const fixedParent = projectId !== undefined;
  /*
   * DEBT-45 — the full-form hand-off. Quick Capture carries its source record in
   * the URL, so arriving here does not lose why the task is being created. The
   * SAME relationship matrix decides what the context means (ADR-060): a Project
   * or Area context is the task's structural PARENT (no generic link), everything
   * else becomes a `task.relates_to` link the route creates after the task exists.
   * Both are resolved server-side; this only mirrors it so the form tells the
   * truth about what it will do.
   */
  const capture = useUrlCaptureContext("task");
  const capturePlan = capture.context
    ? captureRelationshipPlan("task", capture.context.sourceEntityType)
    : null;
  const contextParent =
    capturePlan?.kind === "task_parent" && capture.context
      ? {
          id: capture.context.sourceEntityId,
          kind: capturePlan.parentKind,
          title: capture.context.sourceEntityTitle,
        }
      : null;
  const resolvedParent = fixedParent ? null : (contextParent ?? defaultParent);
  const parentSearch = useTaskParentSearch();
  const titleRef = useRef<HTMLInputElement | null>(null);

  const fieldOrder = useMemo<ReadonlyArray<keyof Values & string>>(
    () =>
      fixedParent
        ? [
            "title",
            "priority",
            "dueDate",
            "timeSector",
            "commitmentState",
            "scheduledDate",
          ]
        : [
            "title",
            "parentId",
            "priority",
            "timeSector",
            "commitmentState",
            "dueDate",
            "scheduledDate",
          ],
    [fixedParent],
  );

  const form = useForm<Values>({
    initialValues: {
      title: "",
      parentId: resolvedParent?.id ?? "",
      priority: "",
      timeSector: "",
      commitmentState: "active",
      dueDate: "",
      scheduledDate: "",
    },
    fields: {
      title: { validate: required("A title is required") },
    },
    fieldOrder,
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const parentIdValue = fixedParent ? projectId : values.parentId;
      const parentKind = fixedParent
        ? "project"
        : (parentSearch.kindOf(values.parentId) ??
          (values.parentId === resolvedParent?.id
            ? resolvedParent.kind
            : null));
      const hasParent = parentKind !== null && parentIdValue.length > 0;

      const body = new FormData();
      body.set("intent", "create");
      const parsedTitle = interpretation.title.trim();
      body.set("title", parsedTitle.length > 0 ? parsedTitle : values.title);
      if (hasParent) {
        body.set("parentId", parentIdValue);
        body.set("parentKind", parentKind);
      }
      if (capture.context) {
        body.set("captureContext", encodeCaptureContext(capture.context));
      }
      const priority = values.priority || interpretation.priority || "";
      const timeSector = values.timeSector || interpretation.timeSector || "";
      const commitmentState =
        values.commitmentState !== "active"
          ? values.commitmentState
          : interpretation.commitmentState;
      if (priority) body.set("priority", priority);
      if (timeSector) body.set("timeSector", timeSector);
      if (commitmentState && commitmentState !== "active") {
        body.set("commitmentState", commitmentState);
      }
      const dueDate = values.dueDate || interpretation.dueDate || "";
      const scheduledDate =
        values.scheduledDate || interpretation.scheduledDate || "";
      if (dueDate) body.set("dueDate", dueDate);
      if (scheduledDate) body.set("scheduledDate", scheduledDate);
      // TASKS-04: a recognised `every …` phrase is APPLIED, not merely previewed.
      // The route writes the rule in the same atomic create as the dates it repeats
      // from, and drops it if neither date is present rather than guessing one.
      //
      // The form's OWN date controls are merged in above and passed here, so a date
      // the owner picked is always the anchor a rule advances — TASKS-11's implied
      // "starts today" is reached only when there is no date at all.
      applyRecurrenceFields(
        body,
        interpretation.recurrence,
        { scheduledDate, dueDate },
        todayIso ?? null,
      );

      let data: TasksCreateResult;
      try {
        const response = await fetch("/tasks/new", { method: "POST", body });
        data = (await response.json()) as TasksCreateResult;
      } catch {
        return {
          status: "error",
          formError:
            "That task couldn’t be created. Your text is safe — try again.",
        };
      }
      if (data.ok) {
        // The hand-off parameter has done its job; drop it so re-opening "New
        // task" on this page starts neutral rather than re-offering a finished
        // context.
        capture.consume();
        onCreated(data.taskId);
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

  // The picker resolves an option's label from what it has searched. The default
  // capture parent is selected before any search has returned, so it is offered
  // explicitly — otherwise the field would open showing a bare id.
  const parentOptions = useMemo(() => {
    const searched = parentSearch.withSelected(parentField.value);
    if (
      !resolvedParent ||
      searched.some((o) => o.value === resolvedParent.id)
    ) {
      return searched;
    }
    return [
      {
        value: resolvedParent.id,
        label: resolvedParent.title,
        description: resolvedParent.kind === "project" ? "Project" : "Area",
      },
      ...searched,
    ];
  }, [parentSearch, parentField.value, resolvedParent]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // The deterministic quick-capture preview. Recomputed from the current title on
  // every render; shown only when it materially changes the task AND the user has
  // not dismissed this exact text.
  const [ignoredTokenIds, setIgnoredTokenIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const interpretation = useMemo(
    () =>
      parseQuickCapture(titleField.value, {
        ignoredTokenIds,
        todayIso: todayIso ?? undefined,
      }),
    [titleField.value, ignoredTokenIds, todayIso],
  );
  const showPreview =
    interpretationIsMeaningful(interpretation) &&
    interpretation.title !== titleField.value.trim();

  return (
    <Form
      aria-label="New task"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />

      {capture.context ? (
        <CaptureContextChip
          captureType="task"
          context={capture.context}
          onRemove={capture.clear}
        />
      ) : null}

      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="Capture a task — try “Draft the brief p1 next week”"
        help="Recognised words like p1, next week or someday are interpreted as removable chips."
        {...titleField}
        controlRef={(node) => {
          titleRef.current = node instanceof HTMLInputElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      {showPreview ? (
        <div
          className="dh-tasks-capture"
          role="group"
          aria-label="Quick-capture interpretation"
        >
          <p className="dh-tasks-capture__title">
            <span className="dh-tasks-capture__label">Title preview</span>{" "}
            {interpretation.title}
          </p>
          <ul className="dh-tasks-capture__tokens">
            {interpretation.tokens.map((token) => (
              <li key={token.id} className="dh-tasks-capture__token">
                {token.label}
                <button
                  type="button"
                  className="dh-tasks-capture__remove"
                  aria-label={`Treat ${token.raw} as task title text`}
                  onClick={() =>
                    setIgnoredTokenIds((prev) => {
                      const next = new Set(prev);
                      next.add(token.id);
                      return next;
                    })
                  }
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The owner's default destination PRE-SELECTS this field when it is a parent;
       * it does not
       * replace it. A saved preference is a starting point, not a lock — filing a
       * task somewhere else has to stay possible without a detour through
       * Settings, and the field keeps its label, its help text and its keyboard
       * behaviour either way. Only `projectId` (opened from a Project record, so
       * the parent is genuinely fixed by context) hides the picker. */}
      {fixedParent ? null : (
        <SelectField
          label="Project or Area"
          help="Leave blank to keep this task Unassigned in Inbox."
          placeholder="Search Projects and Areas"
          options={parentOptions}
          onSearch={parentSearch.search}
          loading={parentSearch.loading}
          emptyMessage="No matching Projects or Areas"
          {...parentField}
        />
      )}

      <SelectField
        label="Priority"
        help="Optional."
        placeholder="No priority"
        options={PRIORITY_OPTIONS}
        {...form.field("priority")}
      />
      <DateField label="Due date" {...form.field("dueDate")} />

      <details className="dh-progressive-section">
        <summary>More details</summary>
        <SelectField
          label="Time sector"
          placeholder="No sector"
          options={SECTOR_OPTIONS}
          {...form.field("timeSector")}
        />
        <SelectField
          label="Commitment"
          options={COMMITMENT_OPTIONS}
          {...form.field("commitmentState")}
        />
        <DateField label="Scheduled date" {...form.field("scheduledDate")} />
      </details>

      {/* MOBILE-01: sticky, so "Create task" stays above the phone keyboard
          in the full-screen Drawer rather than at the end of a scroll. */}
      <FormActions sticky>
        <FormButton
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={form.isSubmitting}
        >
          Cancel
        </FormButton>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Create task
        </FormButton>
      </FormActions>
    </Form>
  );
}
