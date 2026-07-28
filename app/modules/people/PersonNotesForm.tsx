/**
 * PEOPLE-01 — the Person "Notes" editor (the record's Notes tab).
 *
 * A single free-text field for what you want to remember about this person, saved
 * with `intent=update` to `/person/:id/mutate`. Only the `notes` field is
 * submitted, so it never disturbs the contact details.
 */

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { SerializedPerson } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

type Values = { readonly notes: string };

const FIELD_LABELS: Record<string, string> = { notes: "Notes" };

interface PersonNotesFormProps {
  readonly person: SerializedPerson;
  readonly onSaved: () => void;
}

export function PersonNotesForm({ person, onSaved }: PersonNotesFormProps) {
  const form = useForm<Values>({
    initialValues: { notes: person.notes ?? "" },
    fieldOrder: ["notes"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "update");
      body.set("notes", values.notes);
      let data: PersonMutationResult;
      try {
        const response = await fetch(
          `/person/${encodeURIComponent(person.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as PersonMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.kind === "update" && data.ok) {
        onSaved();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "update" ? data.formError : undefined,
        fieldErrors:
          data.kind === "update"
            ? (data.fieldErrors as Partial<Record<"notes", string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Person notes"
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
        label="Notes"
        multiline
        rows={8}
        maxLength={20000}
        placeholder="What do you want to remember about this person?"
        {...form.field("notes")}
      />
      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save notes
        </FormButton>
      </FormActions>
    </Form>
  );
}
