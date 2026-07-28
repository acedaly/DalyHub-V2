/**
 * ASSET-01 — the Asset "Details" tab (structured editing).
 *
 * A DS-06 explicit-save form editing the whole structured slice, organised into
 * restrained groups (Identity, Ownership & location, Acquisition, Warranty &
 * service, Document/policy/licence, Notes). It posts `intent=update` to
 * `/asset/:id/mutate`; the kernel touches only changed columns, so a partial edit
 * never churns the rest, and CHANGING the type never clears other data (the form
 * submits every field's current value, preserving them). Money is entered as a plain
 * decimal string and parsed server-side to integer minor units. Owner / responsible
 * Person and Area are chosen from the workspace's records (canonical ids, never
 * duplicated), supplied by the loader.
 */

import { ASSET_STATUSES, ASSET_TYPES } from "~/kernel/assets";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  FormSection,
  SelectField,
  TagsField,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { SerializedAsset } from "./asset-view";
import type { AssetMutationResult } from "./routes/mutate";

/** A selectable canonical record (Person or Area) for the reference fields. */
export interface RecordOption {
  readonly id: string;
  readonly title: string;
}

interface AssetDetailsFormProps {
  readonly asset: SerializedAsset;
  readonly people: readonly RecordOption[];
  readonly areas: readonly RecordOption[];
  readonly onSaved: () => void;
}

type Values = {
  assetType: string;
  status: string;
  manufacturer: string;
  model: string;
  description: string;
  serialNumber: string;
  referenceCode: string;
  ownerPersonId: string;
  responsiblePersonId: string;
  location: string;
  areaId: string;
  acquisitionDate: string;
  purchasePrice: string;
  currencyCode: string;
  supplier: string;
  replacementValue: string;
  disposalDate: string;
  disposalNotes: string;
  warrantyExpiry: string;
  serviceInterval: string;
  lastServiceDate: string;
  nextServiceDate: string;
  serviceProvider: string;
  maintenanceNotes: string;
  issuer: string;
  referenceNumber: string;
  issueDate: string;
  renewalDate: string;
  url: string;
  documentNotes: string;
  tags: readonly string[];
};

const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
}));
const STATUS_OPTIONS = ASSET_STATUSES.map((s) => ({
  value: s.value,
  label: s.label,
}));

const FIELD_LABELS: Record<string, string> = {
  assetType: "Type",
  status: "Status",
  manufacturer: "Manufacturer",
  model: "Model",
  description: "Description",
  serialNumber: "Serial number",
  referenceCode: "Identifying reference",
  ownerPersonId: "Owner",
  responsiblePersonId: "Responsible",
  location: "Location",
  areaId: "Area",
  acquisitionDate: "Acquisition date",
  purchasePrice: "Purchase price",
  currencyCode: "Currency",
  supplier: "Supplier",
  replacementValue: "Replacement value",
  disposalDate: "Disposal date",
  disposalNotes: "Disposal notes",
  warrantyExpiry: "Warranty expires",
  serviceInterval: "Service interval",
  lastServiceDate: "Last service",
  nextServiceDate: "Next service",
  serviceProvider: "Service provider",
  maintenanceNotes: "Maintenance notes",
  issuer: "Issuer or provider",
  referenceNumber: "Reference number",
  issueDate: "Issue date",
  renewalDate: "Renewal or expiry date",
  url: "Link",
  documentNotes: "Notes",
  tags: "Tags",
};

function recordOptions(
  records: readonly RecordOption[],
  current: string | null,
) {
  const options = [
    { value: "", label: "Not set" },
    ...records.map((r) => ({ value: r.id, label: r.title })),
  ];
  // Keep a currently-set id selectable even if it's not in the bounded list.
  if (current && !records.some((r) => r.id === current)) {
    options.push({ value: current, label: "(current selection)" });
  }
  return options;
}

export function AssetDetailsForm({
  asset,
  people,
  areas,
  onSaved,
}: AssetDetailsFormProps) {
  const form = useForm<Values>({
    initialValues: {
      assetType: asset.assetType,
      status: asset.status,
      manufacturer: asset.manufacturer ?? "",
      model: asset.model ?? "",
      description: asset.description ?? "",
      serialNumber: asset.serialNumber ?? "",
      referenceCode: asset.referenceCode ?? "",
      ownerPersonId: asset.ownerPersonId ?? "",
      responsiblePersonId: asset.responsiblePersonId ?? "",
      location: asset.location ?? "",
      areaId: asset.areaId ?? "",
      acquisitionDate: asset.acquisitionDate ?? "",
      purchasePrice: asset.purchasePriceInput,
      currencyCode: asset.currencyCode ?? "",
      supplier: asset.supplier ?? "",
      replacementValue: asset.replacementValueInput,
      disposalDate: asset.disposalDate ?? "",
      disposalNotes: asset.disposalNotes ?? "",
      warrantyExpiry: asset.warrantyExpiry ?? "",
      serviceInterval: asset.serviceInterval ?? "",
      lastServiceDate: asset.lastServiceDate ?? "",
      nextServiceDate: asset.nextServiceDate ?? "",
      serviceProvider: asset.serviceProvider ?? "",
      maintenanceNotes: asset.maintenanceNotes ?? "",
      issuer: asset.issuer ?? "",
      referenceNumber: asset.referenceNumber ?? "",
      issueDate: asset.issueDate ?? "",
      renewalDate: asset.renewalDate ?? "",
      url: asset.url ?? "",
      documentNotes: asset.documentNotes ?? "",
      tags: asset.tags,
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "update");
      for (const [key, value] of Object.entries(values)) {
        if (key === "tags") continue;
        body.set(key, typeof value === "string" ? value : "");
      }
      body.set("tags", JSON.stringify(values.tags));
      let data: AssetMutationResult;
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(asset.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as AssetMutationResult;
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
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Asset details"
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

      <FormSection title="Identity">
        <SelectField
          label="Type"
          required
          options={TYPE_OPTIONS}
          {...form.field("assetType")}
        />
        <SelectField
          label="Status"
          required
          options={STATUS_OPTIONS}
          help="The asset’s real-world state — separate from archiving the record."
          {...form.field("status")}
        />
        <TextField
          label="Manufacturer"
          maxLength={200}
          {...form.field("manufacturer")}
        />
        <TextField label="Model" maxLength={200} {...form.field("model")} />
        <TextField
          label="Description"
          multiline
          rows={3}
          maxLength={2000}
          {...form.field("description")}
        />
        <TextField
          label="Serial number"
          maxLength={200}
          {...form.field("serialNumber")}
          help="Kept private — never shown on cards or in search."
        />
        <TextField
          label="Identifying reference"
          maxLength={200}
          {...form.field("referenceCode")}
        />
        <TagsField label="Tags" {...form.field("tags")} />
      </FormSection>

      <FormSection title="Ownership and location">
        <SelectField
          label="Owner"
          options={recordOptions(people, asset.ownerPersonId)}
          {...form.field("ownerPersonId")}
        />
        <SelectField
          label="Responsible"
          options={recordOptions(people, asset.responsiblePersonId)}
          {...form.field("responsiblePersonId")}
        />
        <TextField
          label="Location"
          maxLength={300}
          {...form.field("location")}
          help="Where it lives, in plain words."
        />
        <SelectField
          label="Area"
          options={recordOptions(areas, asset.areaId)}
          {...form.field("areaId")}
        />
      </FormSection>

      <FormSection title="Acquisition and value">
        <DateField
          label="Acquisition date"
          {...form.field("acquisitionDate")}
        />
        <TextField
          label="Purchase price"
          inputMode="text"
          maxLength={24}
          {...form.field("purchasePrice")}
          help="Kept private — never shown on cards. Amounts only, no symbol."
        />
        <TextField
          label="Currency"
          maxLength={3}
          {...form.field("currencyCode")}
          help="A 3-letter code, e.g. AUD."
        />
        <TextField
          label="Supplier"
          maxLength={200}
          {...form.field("supplier")}
        />
        <TextField
          label="Replacement value"
          inputMode="text"
          maxLength={24}
          {...form.field("replacementValue")}
        />
        <DateField label="Disposal date" {...form.field("disposalDate")} />
        <TextField
          label="Disposal notes"
          multiline
          rows={2}
          maxLength={20000}
          {...form.field("disposalNotes")}
        />
      </FormSection>

      <FormSection title="Warranty and service">
        <DateField label="Warranty expires" {...form.field("warrantyExpiry")} />
        <TextField
          label="Service interval"
          maxLength={200}
          {...form.field("serviceInterval")}
          help="e.g. Every 12 months or 15,000 km."
        />
        <DateField label="Last service" {...form.field("lastServiceDate")} />
        <DateField label="Next service" {...form.field("nextServiceDate")} />
        <TextField
          label="Service provider"
          maxLength={200}
          {...form.field("serviceProvider")}
        />
        <TextField
          label="Maintenance notes"
          multiline
          rows={2}
          maxLength={20000}
          {...form.field("maintenanceNotes")}
        />
      </FormSection>

      <FormSection title="Document, policy or licence">
        <TextField
          label="Issuer or provider"
          maxLength={200}
          {...form.field("issuer")}
        />
        <TextField
          label="Reference number"
          maxLength={200}
          {...form.field("referenceNumber")}
          help="Kept private — never shown on cards or in search."
        />
        <DateField label="Issue date" {...form.field("issueDate")} />
        <DateField
          label="Renewal or expiry date"
          {...form.field("renewalDate")}
        />
        <TextField
          label="Link"
          type="url"
          maxLength={4096}
          {...form.field("url")}
        />
      </FormSection>

      <FormSection title="Notes">
        <TextField
          label="Notes"
          multiline
          rows={4}
          maxLength={20000}
          {...form.field("documentNotes")}
        />
      </FormSection>

      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save details
        </FormButton>
      </FormActions>
    </Form>
  );
}
