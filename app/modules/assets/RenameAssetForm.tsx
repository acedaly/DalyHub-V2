/**
 * ASSET-01 — the "Rename asset" form (hosted in the DS-03 Drawer).
 *
 * A single-field DS-06 form posting `intent=rename` to `/asset/:id/mutate`, which
 * updates the entity TITLE through the generic `EntityRepository` (the single
 * authority for identity/title). Preserves entered text on a validation error.
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

import type { AssetMutationResult } from "./routes/mutate";

type Values = { readonly title: string };

interface RenameAssetFormProps {
  readonly assetId: string;
  readonly currentTitle: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function RenameAssetForm({
  assetId,
  currentTitle,
  onDone,
  onCancel,
}: RenameAssetFormProps) {
  const form = useForm<Values>({
    initialValues: { title: currentTitle },
    fields: { title: { validate: required("A name is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", values.title);
      let data: AssetMutationResult;
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(assetId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as AssetMutationResult;
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
      aria-label="Rename asset"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={{ title: "Name" }}
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
