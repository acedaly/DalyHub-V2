/**
 * PROJ-01 — the "New task in this project" form (hosted in the shared DS-03 Drawer).
 *
 * DS-06 controls + `useForm` (required title, duplicate-submit prevention,
 * server-authoritative errors). It posts to `/projects/:projectId/mutate`
 * (intent `create_task`); the parent is bound to THIS project SERVER-side (the form
 * sends only a title, never a project id), so a client can't retarget the task.
 * Creation goes through `SpineRepository.createTask` and generates Activity via the
 * existing spine mutation. On success the parent revalidates (the task appears and
 * the roll-up total updates) and can open the new task in the shared Task Drawer.
 */

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { ProjectMutationResult } from "./routes/mutate";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

interface NewTaskFormProps {
  readonly projectId: string;
  /** Called with the new task's id after a successful create. */
  readonly onCreated: (taskId: string) => void;
  readonly onCancel: () => void;
}

export function NewTaskForm({
  projectId,
  onCreated,
  onCancel,
}: NewTaskFormProps) {
  const form = useForm<Values>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "create_task");
      body.set("title", values.title);
      let data: ProjectMutationResult;
      try {
        const response = await fetch(
          `/projects/${encodeURIComponent(projectId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as ProjectMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That task couldn't be created. Please try again.",
        };
      }
      if (data.kind === "create_task" && data.ok) {
        onCreated(data.taskId);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "create_task" ? data.formError : undefined,
        fieldErrors:
          data.kind === "create_task"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  const titleField = form.field("title");

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
        placeholder="What needs doing?"
        {...titleField}
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
          Add task
        </FormButton>
      </FormActions>
    </Form>
  );
}
