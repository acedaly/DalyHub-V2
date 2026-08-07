/**
 * TODAY-02 — the task Drawer's Details tab.
 *
 * A clear VIEW state (rendered Markdown description + created/updated metadata) and
 * an EDIT state built entirely from DS-06 shared controls (`useForm`, `TextField`,
 * `SelectField`, `DateField`) over the shared writing surface
 * (`MarkdownEditorField`), with explicit Save/Cancel, dirty tracking,
 * server-authoritative validation and unsaved-changes protection wired to the
 * Drawer via `UnsavedChangesGuard`. No bespoke field controls, no second parser
 * or HTML sink (Markdown renders through the ONE shared pipeline), no raw JSON.
 *
 * EDIT-02 narrowed what this form is FOR. The title, the priority and the two
 * dates are now edited on the record itself, where they are shown; the form
 * keeps the fields that genuinely interact — status, commitment, recurrence and
 * the four delegation fields — because those are a workflow, not four
 * independent values, and inlining them one by one would let a user build a
 * half-delegated task one refused save at a time (§1, category E).
 */

import { useEffect, useState } from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { MarkdownContent } from "~/shared/markdown";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TextField,
  UnsavedChangesGuard,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { MarkdownEditorField } from "~/shared/markdown-editor";

import {
  formatCalendarDate,
  taskRecurrenceLabel,
  type SerializedTaskView,
} from "./task-view";

/** The editable values of the Details form (all strings for the shared controls). */
export type TaskDetailsValues = {
  readonly description: string;
  readonly status: string;
  readonly timeSector: string;
  readonly commitmentState: string;
  readonly delegateTo: string;
  readonly delegatedOn: string;
  readonly followUpOn: string;
  readonly delegateNote: string;
};

interface TaskDetailsTabProps {
  readonly task: SerializedTaskView;
  readonly isEditing: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  /** Persist the values; returns the server-authoritative outcome. */
  readonly onSubmit: (
    values: TaskDetailsValues,
  ) => Promise<SubmitOutcome<TaskDetailsValues>>;
  /** Called after a successful save so the parent can leave edit mode + refresh. */
  readonly onSaved: () => void;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "cancelled", label: "Cancelled" },
];

const SECTOR_OPTIONS = [
  { value: "", label: "No sector" },
  { value: "this_week", label: "This Week" },
  { value: "next_week", label: "Next Week" },
  { value: "this_month", label: "This Month" },
  { value: "next_month", label: "Next Month" },
  { value: "long_term", label: "Long Term" },
  { value: "routines", label: "Routines" },
];

const COMMITMENT_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "someday", label: "Someday / Maybe" },
];

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  status: "Status",
  timeSector: "Time Sector",
  commitmentState: "Commitment",
  delegateTo: "Delegated to",
  delegatedOn: "Delegated on",
  followUpOn: "Follow up",
  delegateNote: "Delegation note",
};

/** Render Markdown source safely through the ONE shared pipeline (lazy-loaded). */
function MarkdownView({ source }: { source: string }) {
  const [html, setHtml] = useState<SanitizedMarkdownHtml | null>(null);
  useEffect(() => {
    let active = true;
    import("~/platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (active) setHtml(renderMarkdownSource(source).html);
      })
      .catch(() => {
        /* fall back to plain source below */
      });
    return () => {
      active = false;
    };
  }, [source]);
  if (html === null) {
    return <p className="dh-task-drawer__description-fallback">{source}</p>;
  }
  return <MarkdownContent html={html} />;
}

export function TaskDetailsTab({
  task,
  isEditing,
  onEdit,
  onCancel,
  onSubmit,
  onSaved,
}: TaskDetailsTabProps) {
  if (isEditing) {
    return (
      <TaskDetailsForm
        task={task}
        onCancel={onCancel}
        onSubmit={onSubmit}
        onSaved={onSaved}
      />
    );
  }

  const createdLabel = formatCalendarDate(task.createdAt.slice(0, 10));
  const updatedLabel = formatCalendarDate(task.updatedAt.slice(0, 10));

  return (
    <div className="dh-record-stack">
      <section aria-label="Description" className="dh-record-section">
        <h4 className="dh-record-section__label">Description</h4>
        {task.description ? (
          <MarkdownView source={task.description} />
        ) : (
          <p className="dh-record-muted">No description yet.</p>
        )}
      </section>

      <dl className="dh-task-drawer__meta">
        {/* TASKS-04 — the Details tab states whether the task repeats even when it
            does not, so "does it repeat?" is answerable without hunting. The parent
            is NOT repeated here: the Record Summary above already reports it. */}
        <div>
          <dt>Repeats</dt>
          <dd>{taskRecurrenceLabel(task.recurrence) ?? "Does not repeat"}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{createdLabel ?? "—"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{updatedLabel ?? "—"}</dd>
        </div>
      </dl>

      <FormButton type="button" variant="secondary" onClick={onEdit}>
        Edit details
      </FormButton>
    </div>
  );
}

function TaskDetailsForm({
  task,
  onCancel,
  onSubmit,
  onSaved,
}: Omit<TaskDetailsTabProps, "isEditing" | "onEdit">) {
  const form = useForm<TaskDetailsValues>({
    initialValues: {
      description: task.description ?? "",
      status: task.status,
      timeSector: task.timeSector ?? "",
      commitmentState: task.commitmentState,
      delegateTo: task.delegation?.to ?? "",
      delegatedOn: task.delegation?.delegatedOn ?? "",
      followUpOn: task.delegation?.followUpOn ?? "",
      delegateNote: task.delegation?.note ?? "",
    },
    fieldOrder: [
      "status",
      "timeSector",
      "commitmentState",
      "delegateTo",
      "delegatedOn",
      "followUpOn",
      "delegateNote",
      "description",
    ],
    onSubmit: async (values) => {
      const outcome = await onSubmit(values);
      if (outcome.status === "success") {
        onSaved();
      }
      return outcome;
    },
  });

  const descriptionField = form.field("description");
  const statusField = form.field("status");
  const sectorField = form.field("timeSector");
  const commitmentField = form.field("commitmentState");
  const delegateToField = form.field("delegateTo");
  const delegatedOnField = form.field("delegatedOn");
  const followUpOnField = form.field("followUpOn");
  const delegateNoteField = form.field("delegateNote");

  return (
    <Form
      aria-label="Edit task"
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
      <SelectField label="Status" options={STATUS_OPTIONS} {...statusField} />
      <SelectField
        label="Time Sector"
        help="When you intend to work on this — separate from the due date."
        options={SECTOR_OPTIONS}
        {...sectorField}
      />
      <SelectField
        label="Commitment"
        help="Someday / Maybe is parked — kept out of active views."
        options={COMMITMENT_OPTIONS}
        {...commitmentField}
      />
      <TextField
        label="Delegated to"
        help="A person or party — leave blank if not delegated."
        maxLength={200}
        {...delegateToField}
      />
      <DateField label="Delegated on" {...delegatedOnField} />
      <DateField label="Follow up" {...followUpOnField} />
      <TextField
        label="Delegation note"
        maxLength={500}
        {...delegateNoteField}
      />
      <MarkdownEditorField
        label="Description"
        help="Markdown — headings, lists, checklists, quotes and tables format as you type."
        rows={6}
        placeholder="Anything worth remembering about this task…"
        disabled={form.isSubmitting}
        {...descriptionField}
      />
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
          Save changes
        </FormButton>
      </FormActions>
      <UnsavedChangesGuard
        when={form.isDirty && !form.isSubmitting}
        drawerKey={`task:${task.id}`}
      />
    </Form>
  );
}
