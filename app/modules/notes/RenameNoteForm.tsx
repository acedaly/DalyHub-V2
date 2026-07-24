/**
 * NOTES-01B — the "Rename note" form.
 *
 * Posts to the Note mutation resource; the server renames through the generic
 * `EntityRepository.update` — title stays owned by the generic entity kernel,
 * never a second Notes-owned title field (mirrors
 * `~/modules/goals/RenameGoalForm.tsx`, swapping `scope.spine.rename` for
 * `scope.entities.update`, since Notes are not a spine type).
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

import type { NoteMutationResult } from "./routes/mutate";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

interface RenameNoteFormProps {
  readonly noteId: string;
  readonly currentTitle: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function RenameNoteForm({
  noteId,
  currentTitle,
  onDone,
  onCancel,
}: RenameNoteFormProps) {
  const form = useForm<Values>({
    initialValues: { title: currentTitle },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", values.title);
      let data: NoteMutationResult;
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as NoteMutationResult;
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
      aria-label="Rename note"
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
