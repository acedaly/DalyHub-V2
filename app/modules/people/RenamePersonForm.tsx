/**
 * PEOPLE-01 — the "Rename person" form (hosted in the DS-03 Drawer).
 *
 * Posts `intent=rename` to `/person/:id/mutate`, which updates the display name
 * through the generic `EntityRepository` (the single authority for identity/title).
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

import type { PersonMutationResult } from "./routes/mutate";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Name" };

interface RenamePersonFormProps {
  readonly personId: string;
  readonly currentTitle: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function RenamePersonForm({
  personId,
  currentTitle,
  onDone,
  onCancel,
}: RenamePersonFormProps) {
  const form = useForm<Values>({
    initialValues: { title: currentTitle },
    fields: { title: { validate: required("A name is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", values.title);
      let data: PersonMutationResult;
      try {
        const response = await fetch(
          `/person/${encodeURIComponent(personId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as PersonMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
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
            ? (data.fieldErrors as Partial<Record<"title", string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Rename person"
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
        label="Name"
        required
        maxLength={512}
        {...form.field("title")}
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
          Save name
        </FormButton>
      </FormActions>
    </Form>
  );
}
