/**
 * ASSET-01 — the "New asset" form (hosted in the DS-03 Drawer or the `/new/asset`
 * page). Uses DS-06 explicit form controls and posts to the trusted `/assets/create`
 * action, which creates through `AssetRepository.create` — the client never supplies
 * workspace or actor data. It starts with title + type and PROGRESSIVELY reveals the
 * fields relevant to the chosen type (`newAssetFieldsForType`), so it never shows an
 * intimidating wall of fields; switching type keeps the values already entered. The
 * full field set is edited later on the record's Details tab.
 */

import { useMemo } from "react";

import { ASSET_TYPES, type AssetType } from "~/kernel/assets";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TagsField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import { newAssetFieldsForType } from "./asset-form-model";
import type { CreateAssetResult } from "./routes/create";

type Values = {
  readonly title: string;
  readonly assetType: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly location: string;
  readonly warrantyExpiry: string;
  readonly issuer: string;
  readonly referenceNumber: string;
  readonly issueDate: string;
  readonly renewalDate: string;
  readonly url: string;
  readonly tags: readonly string[];
};

/** The string-valued field keys (every value type is `string`). */
type StringField = Exclude<keyof Values, "tags">;

const TYPE_OPTIONS = [
  { value: "", label: "Choose a type…" },
  ...ASSET_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

// All possible revealed field names, so `useForm` always holds their value even
// before they are shown (switching type never loses a common value).
const ALL_FIELD_NAMES = [
  "manufacturer",
  "model",
  "serialNumber",
  "location",
  "warrantyExpiry",
  "issuer",
  "referenceNumber",
  "issueDate",
  "renewalDate",
  "url",
];

const FIELD_LABELS: Record<string, string> = {
  title: "Name",
  assetType: "Type",
  manufacturer: "Manufacturer",
  model: "Model",
  serialNumber: "Serial number",
  location: "Location",
  warrantyExpiry: "Warranty expires",
  issuer: "Issuer or provider",
  referenceNumber: "Reference number",
  issueDate: "Issue date",
  renewalDate: "Renewal or expiry date",
  url: "Link",
  tags: "Tags",
};

interface NewAssetFormProps {
  readonly onCreated: (assetId: string) => void;
  readonly onCancel?: () => void;
}

export function NewAssetForm({ onCreated, onCancel }: NewAssetFormProps) {
  const initialValues = useMemo<Values>(
    () => ({
      title: "",
      assetType: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      location: "",
      warrantyExpiry: "",
      issuer: "",
      referenceNumber: "",
      issueDate: "",
      renewalDate: "",
      url: "",
      tags: [],
    }),
    [],
  );

  const form = useForm<Values>({
    initialValues,
    fields: {
      title: { validate: required("A name is required") },
      assetType: { validate: required("Choose a type") },
    },
    fieldOrder: [
      "title",
      "assetType",
      ...ALL_FIELD_NAMES,
      "tags",
    ] as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("assetType", values.assetType);
      // Only submit the fields relevant to the chosen type (an omitted field is
      // simply not set — the kernel leaves it unset).
      for (const f of newAssetFieldsForType(
        values.assetType as AssetType | "",
      )) {
        const value = values[f.name as StringField];
        if (typeof value === "string" && value.trim() !== "") {
          body.set(f.name, value);
        }
      }
      body.set("tags", JSON.stringify(values.tags));
      let data: CreateAssetResult;
      try {
        const response = await fetch("/assets/create", {
          method: "POST",
          body,
        });
        data = (await response.json()) as CreateAssetResult;
      } catch {
        return {
          status: "error",
          formError: "That asset couldn't be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.assetId);
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

  const revealed = newAssetFieldsForType(
    form.values.assetType as AssetType | "",
  );

  return (
    <Form
      aria-label="New asset"
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
      <SelectField
        label="Type"
        required
        options={TYPE_OPTIONS}
        {...form.field("assetType")}
      />
      {revealed.map((f) =>
        f.kind === "date" ? (
          <DateField
            key={f.name}
            label={f.label}
            help={f.help}
            {...form.field(f.name as StringField)}
          />
        ) : (
          <TextField
            key={f.name}
            label={f.label}
            help={f.help}
            maxLength={f.name === "url" ? 4096 : 300}
            {...form.field(f.name as StringField)}
          />
        ),
      )}
      <TagsField label="Tags" {...form.field("tags")} />
      <FormActions>
        {onCancel ? (
          <FormButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={form.isSubmitting}
          >
            Cancel
          </FormButton>
        ) : null}
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Create asset
        </FormButton>
      </FormActions>
    </Form>
  );
}
