/**
 * AREA-01 — the "New area" form (hosted in the shared DS-03 Drawer).
 *
 * Uses DS-06 explicit form controls and posts to the trusted `/areas/new` action.
 * The server creates through `SpineRepository.createArea`, so the client never
 * supplies parentage, workspace or actor data.
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

import type { CreateAreaResult } from "./routes/new";

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

interface NewAreaFormProps {
  readonly onCreated: (areaId: string) => void;
  readonly onCancel: () => void;
}

export function NewAreaForm({ onCreated, onCancel }: NewAreaFormProps) {
  const form = useForm<Values>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      let data: CreateAreaResult;
      try {
        const response = await fetch("/areas/new", { method: "POST", body });
        data = (await response.json()) as CreateAreaResult;
      } catch {
        return {
          status: "error",
          formError: "That Area couldn't be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.areaId);
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
      aria-label="New area"
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
          Create Area
        </FormButton>
      </FormActions>
    </Form>
  );
}
