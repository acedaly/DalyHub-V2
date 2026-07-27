/**
 * TASKS-01 — the "New task" quick-capture form (hosted in the shared DS-03 Drawer).
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
 *     kinds resolved server-side). A Task structurally requires exactly one parent.
 *
 * A deterministic quick-capture preview (ADR-043 §14) parses the title as the user
 * types and offers to fill the priority / sector / commitment fields and strip the
 * recognised tokens — never AI, never a guess beyond the closed token vocabulary.
 * Every entered value survives a validation or server failure (useForm contract).
 */

import { useMemo, useState } from "react";

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
  parentId: "Project or Area",
  priority: "Priority",
  timeSector: "Time sector",
  commitmentState: "Commitment",
  dueDate: "Due date",
  scheduledDate: "Scheduled date",
};

const PRIORITY_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "No priority" },
  ...TASK_PRIORITIES.map((p) => ({ value: p, label: taskPriorityLabel(p) })),
];

const SECTOR_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "Inbox (no sector)" },
  ...TIME_SECTORS.map((s) => ({ value: s, label: timeSectorLabel(s) })),
];

const COMMITMENT_OPTIONS: readonly SelectOption[] = COMMITMENT_STATES.map(
  (c) => ({ value: c, label: c === "someday" ? "Someday / Maybe" : "Active" }),
);

export interface NewTaskFormProps {
  /**
   * FIXED-parent mode: bind the task to this Project. When set, the parent picker
   * is hidden and the parent kind is `project`.
   */
  readonly projectId?: string;
  /** Called with the new task's id after a successful create. */
  readonly onCreated: (taskId: string) => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
}

export function NewTaskForm({
  projectId,
  onCreated,
  onCancel,
}: NewTaskFormProps) {
  const fixedParent = projectId !== undefined;
  const parentSearch = useTaskParentSearch();

  const fieldOrder = useMemo<ReadonlyArray<keyof Values & string>>(
    () =>
      fixedParent
        ? [
            "title",
            "priority",
            "timeSector",
            "commitmentState",
            "dueDate",
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
      parentId: "",
      priority: "",
      timeSector: "",
      commitmentState: "active",
      dueDate: "",
      scheduledDate: "",
    },
    fields: {
      title: { validate: required("A title is required") },
      ...(fixedParent
        ? {}
        : { parentId: { validate: required("Choose a Project or an Area") } }),
    },
    fieldOrder,
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const parentIdValue = fixedParent ? projectId : values.parentId;
      const parentKind = fixedParent
        ? "project"
        : parentSearch.kindOf(values.parentId);
      if (!parentKind || !parentIdValue) {
        return {
          status: "error",
          fieldErrors: {
            parentId: "Choose a Project or an Area for this task.",
          },
        };
      }

      const body = new FormData();
      body.set("intent", "create");
      body.set("title", values.title);
      body.set("parentId", parentIdValue);
      body.set("parentKind", parentKind);
      if (values.priority) body.set("priority", values.priority);
      if (values.timeSector) body.set("timeSector", values.timeSector);
      if (values.commitmentState && values.commitmentState !== "active") {
        body.set("commitmentState", values.commitmentState);
      }
      if (values.dueDate) body.set("dueDate", values.dueDate);
      if (values.scheduledDate) body.set("scheduledDate", values.scheduledDate);

      let data: TasksCreateResult;
      try {
        const response = await fetch("/tasks/new", { method: "POST", body });
        data = (await response.json()) as TasksCreateResult;
      } catch {
        return {
          status: "error",
          formError:
            "That task couldn't be created. Your text is safe — try again.",
        };
      }
      if (data.ok) {
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

  // The deterministic quick-capture preview. Recomputed from the current title on
  // every render; shown only when it materially changes the task AND the user has
  // not dismissed this exact text.
  const [dismissedText, setDismissedText] = useState<string | null>(null);
  const interpretation = useMemo(
    () => parseQuickCapture(titleField.value),
    [titleField.value],
  );
  const showPreview =
    interpretationIsMeaningful(interpretation) &&
    dismissedText !== titleField.value;

  const applyInterpretation = () => {
    form.setValue("title", interpretation.title);
    form.setValue("priority", interpretation.priority ?? "");
    form.setValue("timeSector", interpretation.timeSector ?? "");
    form.setValue("commitmentState", interpretation.commitmentState);
    setDismissedText(null);
  };

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

      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="Capture a task — try “Draft the brief p1 next week”"
        help="Recognised words like p1–p4, this week or someday can be applied below."
        {...titleField}
      />

      {showPreview ? (
        <div
          className="dh-tasks-capture"
          role="group"
          aria-label="Quick-capture interpretation"
        >
          <p className="dh-tasks-capture__title">
            <span className="dh-tasks-capture__label">Interpreted as</span>{" "}
            {interpretation.title}
          </p>
          <ul className="dh-tasks-capture__tokens">
            {interpretation.tokens.map((token) => (
              <li
                key={`${token.kind}:${token.raw}`}
                className="dh-tasks-capture__token"
              >
                {token.label}
              </li>
            ))}
          </ul>
          <div className="dh-tasks-capture__actions">
            <FormButton
              type="button"
              variant="secondary"
              onClick={applyInterpretation}
            >
              Apply
            </FormButton>
            <FormButton
              type="button"
              variant="ghost"
              onClick={() => setDismissedText(titleField.value)}
            >
              Ignore
            </FormButton>
          </div>
        </div>
      ) : null}

      {fixedParent ? null : (
        <SelectField
          label="Project or Area"
          help="A task belongs to exactly one Project or Area."
          placeholder="Search Projects and Areas"
          required
          options={parentSearch.withSelected(parentField.value)}
          onSearch={parentSearch.search}
          loading={parentSearch.loading}
          emptyMessage="No matching Projects or Areas"
          {...parentField}
        />
      )}

      <SelectField
        label="Priority"
        options={PRIORITY_OPTIONS}
        {...form.field("priority")}
      />
      <SelectField
        label="Time sector"
        options={SECTOR_OPTIONS}
        {...form.field("timeSector")}
      />
      <SelectField
        label="Commitment"
        options={COMMITMENT_OPTIONS}
        {...form.field("commitmentState")}
      />
      <DateField label="Due date" {...form.field("dueDate")} />
      <DateField label="Scheduled date" {...form.field("scheduledDate")} />

      <FormActions>
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
