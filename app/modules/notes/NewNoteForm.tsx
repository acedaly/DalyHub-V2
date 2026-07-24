/**
 * NOTES-01B — the "New note" form (hosted in the shared DS-03 Drawer).
 *
 * Built entirely from DS-06 shared controls (`useForm`, `TextField`) with
 * explicit Save/Cancel, required-title validation, duplicate-submit
 * prevention (via `useForm`) and server-authoritative errors. Creation
 * requires only a title — Notes have no parent to choose (mirrors
 * `~/modules/goals/RenameGoalForm.tsx`'s single-field shape more than
 * `~/modules/projects/NewProjectForm.tsx`, which also resolves a parent). On
 * success the parent closes the Drawer and navigates to the new Note's
 * canonical record.
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

import type { CreateNoteResult } from "./routes/new";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

export interface NewNoteFormProps {
  /** Called with the new Note's id after a successful create. */
  readonly onCreated: (noteId: string) => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
}

export function NewNoteForm({ onCreated, onCancel }: NewNoteFormProps) {
  const form = useForm<Values>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      let data: CreateNoteResult;
      try {
        const response = await fetch("/notes/new", { method: "POST", body });
        data = (await response.json()) as CreateNoteResult;
      } catch {
        return {
          status: "error",
          formError: "That note couldn't be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.noteId);
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

  return (
    <Form
      aria-label="New note"
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
          Create note
        </FormButton>
      </FormActions>
    </Form>
  );
}
