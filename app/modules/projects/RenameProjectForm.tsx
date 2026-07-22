/**
 * PROJ-01 — the "Rename project" form (hosted in the shared DS-03 Drawer).
 *
 * DS-06 controls + `useForm` (required title, dirty tracking, duplicate-submit
 * prevention, server-authoritative errors). It posts to `/projects/:projectId/mutate`
 * (intent `rename`), which renames through `SpineRepository.rename` (a same-title
 * submit is a no-op there). On success the parent revalidates and closes the Drawer.
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

interface RenameProjectFormProps {
  readonly projectId: string;
  readonly currentTitle: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function RenameProjectForm({
  projectId,
  currentTitle,
  onDone,
  onCancel,
}: RenameProjectFormProps) {
  const form = useForm<Values>({
    initialValues: { title: currentTitle },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "rename");
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
          formError: "That couldn't be saved. Please try again.",
        };
      }
      if (data.kind === "rename" && data.ok) {
        onDone();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "rename" ? data.formError : undefined,
        fieldErrors:
          data.kind === "rename"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  const titleField = form.field("title");

  return (
    <Form
      aria-label="Rename project"
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
      <TextField label="Title" required maxLength={512} {...titleField} />
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
          Save
        </FormButton>
      </FormActions>
    </Form>
  );
}
