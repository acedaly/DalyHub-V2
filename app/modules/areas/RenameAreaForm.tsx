/**
 * AREA-01 — the "Rename area" form.
 *
 * The only Area edit path in AREA-01. It posts to the Area mutation resource and
 * the server renames through `SpineRepository.rename`.
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

import type { AreaMutationResult } from "./routes/mutate";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

interface RenameAreaFormProps {
  readonly areaId: string;
  readonly currentTitle: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function RenameAreaForm({
  areaId,
  currentTitle,
  onDone,
  onCancel,
}: RenameAreaFormProps) {
  const form = useForm<Values>({
    initialValues: { title: currentTitle },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", values.title);
      let data: AreaMutationResult;
      try {
        const response = await fetch(
          `/areas/${encodeURIComponent(areaId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as AreaMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn't be saved. Please try again.",
        };
      }
      if (data.ok === true) {
        onDone();
        return { status: "success" };
      }
      const failed = data as Extract<AreaMutationResult, { ok: false }>;
      return {
        status: "error",
        formError: failed.formError,
        fieldErrors: failed.fieldErrors as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  const titleField = form.field("title");

  return (
    <Form
      aria-label="Rename area"
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
