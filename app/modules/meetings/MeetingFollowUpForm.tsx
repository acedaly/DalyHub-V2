/**
 * MEET-02 — the follow-up / conversion form (hosted in the shared DS-03 Drawer).
 *
 * Built entirely from DS-06 shared controls, mirroring the `/tasks` quick-capture
 * form: a required editable title (prefilled from the source meeting item, or a
 * calm meeting-context default for a direct follow-up), the shared server-backed
 * parent picker (a Task requires exactly one Area/Project), and the optional
 * planning fields the Task contracts already support (priority, status, time
 * sector, commitment, due/scheduled dates). It posts to the trusted
 * `/meeting/:id/follow-up` action, which runs the atomic-with-recovery conversion
 * orchestration; the server owns duplicate prevention and every Task field.
 *
 * The title/description NEVER carry private meeting notes — the prefill is the
 * item's own text (which the owner chose to convert) or a neutral meeting label.
 */

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
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";
import {
  taskStatusLabel,
  timeSectorLabel,
} from "~/shared/task-record/task-view";
import { COMMITMENT_STATES, TASK_STATUSES, TIME_SECTORS } from "~/kernel/tasks";

import type { MeetingFollowUpResult } from "./routes/follow-up";
import { TASK_PRIORITY_SELECT_OPTIONS } from "~/shared/task-record/priority-options";

type Values = {
  readonly title: string;
  readonly parentId: string;
  readonly priority: string;
  readonly status: string;
  readonly timeSector: string;
  readonly commitmentState: string;
  readonly dueDate: string;
  readonly scheduledDate: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Project or Area",
  priority: "Priority",
  status: "Status",
  timeSector: "Time sector",
  commitmentState: "Commitment",
  dueDate: "Due date",
  scheduledDate: "Scheduled date",
};

/* DH-DS — the REAL values only; an unset optional field is the placeholder, not
 * a first option that reads as a selected default (see `NewTaskForm`). */
/** DHDS-09 — the canonical four, from the one module that owns them. */
const PRIORITY_OPTIONS: readonly SelectOption[] = TASK_PRIORITY_SELECT_OPTIONS;
const STATUS_OPTIONS: readonly SelectOption[] = TASK_STATUSES.map((s) => ({
  value: s,
  label: taskStatusLabel(s),
}));
// TASKS-04 vocabulary: the absence of a Time Sector is "No sector". "Inbox" now
// means an UNASSIGNED Task, and a follow-up Task always has a parent.
const SECTOR_OPTIONS: readonly SelectOption[] = TIME_SECTORS.map((s) => ({
  value: s,
  label: timeSectorLabel(s),
}));
const COMMITMENT_OPTIONS: readonly SelectOption[] = COMMITMENT_STATES.map(
  (c) => ({ value: c, label: c === "someday" ? "Someday / Maybe" : "Active" }),
);

export interface MeetingFollowUpFormProps {
  readonly meetingId: string;
  /** The source item id, or `null` for a direct meeting follow-up. */
  readonly itemId: string | null;
  /** Prefilled, fully-editable title. */
  readonly initialTitle: string;
  /** Called with the created (or existing) Task id on success. */
  readonly onCreated: (taskId: string) => void;
  readonly onCancel: () => void;
}

export function MeetingFollowUpForm({
  meetingId,
  itemId,
  initialTitle,
  onCreated,
  onCancel,
}: MeetingFollowUpFormProps) {
  const parentSearch = useTaskParentSearch();

  const form = useForm<Values>({
    initialValues: {
      title: initialTitle,
      parentId: "",
      priority: "",
      status: "todo",
      timeSector: "",
      commitmentState: "active",
      dueDate: "",
      scheduledDate: "",
    },
    fields: {
      title: { validate: required("A title is required") },
      parentId: { validate: required("Choose a Project or an Area") },
    },
    fieldOrder: [
      "title",
      "parentId",
      "priority",
      "status",
      "timeSector",
      "commitmentState",
      "dueDate",
      "scheduledDate",
    ],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const parentKind = parentSearch.kindOf(values.parentId);
      if (!parentKind || !values.parentId) {
        return {
          status: "error",
          fieldErrors: {
            parentId: "Choose a Project or an Area for this task.",
          },
        };
      }

      const body = new FormData();
      body.set("intent", itemId === null ? "create_follow_up" : "convert_item");
      if (itemId !== null) body.set("itemId", itemId);
      body.set("title", values.title);
      body.set("parentId", values.parentId);
      body.set("parentKind", parentKind);
      if (values.priority) body.set("priority", values.priority);
      if (values.status && values.status !== "todo") {
        body.set("status", values.status);
      }
      if (values.timeSector) body.set("timeSector", values.timeSector);
      if (values.commitmentState && values.commitmentState !== "active") {
        body.set("commitmentState", values.commitmentState);
      }
      if (values.dueDate) body.set("dueDate", values.dueDate);
      if (values.scheduledDate) body.set("scheduledDate", values.scheduledDate);

      let data: MeetingFollowUpResult;
      try {
        const response = await fetch(
          `/meeting/${encodeURIComponent(meetingId)}/follow-up`,
          { method: "POST", body },
        );
        data = (await response.json()) as MeetingFollowUpResult;
      } catch {
        return {
          status: "error",
          formError:
            "That follow-up couldn’t be created. Your text is safe — try again.",
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

  return (
    <Form
      aria-label="New follow-up task"
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
        help="Edit the task title before creating it."
        {...form.field("title")}
      />
      <SelectField
        label="Project or Area"
        help="A task belongs to exactly one Project or Area."
        placeholder="Search Projects and Areas"
        required
        options={parentSearch.withSelected(form.field("parentId").value)}
        onSearch={parentSearch.search}
        loading={parentSearch.loading}
        emptyMessage="No matching Projects or Areas"
        {...form.field("parentId")}
      />
      <SelectField
        label="Priority"
        placeholder="No priority"
        options={PRIORITY_OPTIONS}
        {...form.field("priority")}
      />
      <DateField label="Due date" {...form.field("dueDate")} />

      <details className="dh-progressive-section">
        <summary>More details</summary>
        <SelectField
          label="Status"
          options={STATUS_OPTIONS}
          {...form.field("status")}
        />
        <DateField label="Scheduled date" {...form.field("scheduledDate")} />
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
