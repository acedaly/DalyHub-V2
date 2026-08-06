/**
 * AREA-01 — the "New Area" form (hosted in the shared DS-03 Drawer).
 *
 * Uses DS-06 explicit form controls and posts to the trusted `/areas/new` action.
 * The server creates through `SpineRepository.createArea`, so the client never
 * supplies parentage, workspace or actor data.
 */

import { useState } from "react";

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { EntityIconPicker } from "~/shared/entity";
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

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  iconKey: "Icon",
};

interface NewAreaFormProps {
  readonly onCreated: (areaId: string) => void;
  readonly onCancel: () => void;
}

export function NewAreaForm({ onCreated, onCancel }: NewAreaFormProps) {
  // Held outside `useForm` because the picker's value is a KEY chosen through a
  // modal, not a typed field: it has no text input to validate on blur and no
  // per-keystroke state. `useForm` still owns everything it submits alongside.
  const [iconKey, setIconKey] = useState<EntityIconKey | null>(null);

  const form = useForm<Values>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      // Always sent, empty when unchosen. The server reads "" as
      // reset-to-default and an absent field as "this form has no icon
      // control" — sending it unconditionally keeps this form in the first
      // category, which is what it is.
      body.set("iconKey", iconKey ?? "");
      let data: CreateAreaResult;
      try {
        const response = await fetch("/areas/new", { method: "POST", body });
        data = (await response.json()) as CreateAreaResult;
      } catch {
        return {
          status: "error",
          formError: "That Area couldn’t be created. Please try again.",
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
      aria-label="New Area"
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
      {/* Beside the identity fields, not after the operational settings: an
          icon is part of what this Area IS. */}
      <EntityIconPicker
        entityType="area"
        value={iconKey}
        onChange={setIconKey}
        help="Optional. Areas without one use the standard Area icon."
        error={form.fieldErrors.iconKey ?? null}
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
          Create Area
        </FormButton>
      </FormActions>
    </Form>
  );
}
