/**
 * ASSET-01 / ASSET-03 — the ONE "New Asset" form.
 *
 * Hosted by the `/new/asset` page, the DS-03 Drawer AND the shared Quick Capture
 * sheet — the same component, the same `/assets/create` action, the same
 * `AssetRepository.create` authority, so there is no capture-only Asset form to
 * drift (AGENTS.md §9.8). The client never supplies workspace or actor data.
 *
 * It starts with name + type and PROGRESSIVELY reveals the fields relevant to the
 * chosen type (`newAssetFieldsForType`), so it never shows an intimidating wall of
 * fields; switching type keeps the values already entered and submits only the
 * fields the FINAL type actually uses. The full field set is edited later on the
 * record's Details tab.
 *
 * ASSET-03 (phone-first creation) changed three things and nothing else:
 *   - the Type field opts in to the shared select's compact SHEET presentation,
 *     with the thirteen types grouped for scanning and carrying their PX-05
 *     subtype glyph — a listbox capped at 16rem under an open keyboard was the
 *     control that made phone creation unpleasant;
 *   - the commitment row is sticky below `md`, so Create is reachable with the
 *     keyboard up and clear of the phone navigation and home indicator;
 *   - a host may point the sheet's initial focus at the Name field.
 */

import { useMemo } from "react";
import type { RefObject } from "react";

import { type AssetType } from "~/kernel/assets";
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
import { useCompactViewport } from "~/shared/viewport";

import { assetTypeOptions, newAssetFieldsForType } from "./asset-form-model";
import { assetTypeIcon } from "./asset-icons";
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

/**
 * DS-16 — the type vocabulary, and ONLY the type vocabulary.
 *
 * This list used to open with `{ value: "", label: "Choose a type…" }` — a
 * PLACEHOLDER dressed as an option. It could be arrowed to and chosen, and
 * choosing it "selected" a non-type that the required-field validation then had
 * to reject. `SelectField` already renders a real placeholder in the empty
 * input, so the prompt belongs there, where it cannot be picked.
 *
 * ASSET-03 adds each option's presentation GROUP — a heading in the compact
 * sheet, never a stored value and never a second vocabulary.
 */
const TYPE_OPTIONS = assetTypeOptions();

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
  /**
   * How this form is hosted. `page` (default) is the `/new/asset` page and the
   * Drawer; `sheet` is the shared Quick Capture sheet, whose own Close control
   * (and Escape, and the scrim) is the cancel, and whose sticky action row is
   * the capture surface's — so capture keeps ONE commitment button in the place
   * every other capture panel puts it.
   */
  readonly surface?: "page" | "sheet";
  /**
   * The host's initial-focus target. Quick Capture points it at Name so the
   * phone keyboard opens onto the field being captured.
   */
  readonly firstFieldRef?: RefObject<HTMLElement | null>;
}

export function NewAssetForm({
  onCreated,
  onCancel,
  surface = "page",
  firstFieldRef,
}: NewAssetFormProps) {
  const compact = useCompactViewport();
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
          formError: "That asset couldn’t be created. Please try again.",
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
  const titleField = form.field("title");

  return (
    <Form
      aria-label="New Asset"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      {/*
        The summary is a POST-SUBMIT affordance — "here is everything that went
        wrong, jump to it" — and `FormErrorSummary`'s own contract says so. It is
        rendered only after a submit actually failed, because on a phone it is
        otherwise a moving target: blurring the untouched Name field to reach
        Type inserts ~118px above the fields, so the Type control slides out from
        under the thumb between finger-down and finger-up and the tap is lost.
        The field's own inline error still appears on blur, immediately beside
        the field it belongs to, where it moves nothing the owner is aiming at.
      */}
      {form.submit.status === "error" ? (
        <FormErrorSummary
          formError={form.formError}
          fieldErrors={form.fieldErrors}
          order={form.fieldOrder as string[]}
          labels={FIELD_LABELS}
          onFocusField={form.focusField}
        />
      ) : null}
      <TextField
        label="Name"
        required
        maxLength={512}
        placeholder="What are you adding?"
        {...titleField}
        controlRef={(node) => {
          if (firstFieldRef) {
            firstFieldRef.current = node instanceof HTMLElement ? node : null;
          }
          titleField.controlRef?.(node);
        }}
      />
      {/*
        The one shared select. On a phone it presents as the option Sheet
        (`sheetOnCompact`); on a laptop it stays the combobox with type-to-filter,
        so ASSET-03 improves phone capture without changing desktop creation.
      */}
      <SelectField
        label="Type"
        required
        placeholder="Choose a type…"
        options={TYPE_OPTIONS}
        sheetOnCompact
        sheetTitle="What kind of asset?"
        renderOptionIcon={(option) => {
          // The PX-05 map directly rather than through the shared registry: the
          // registry is populated by importing this module, and capture may be
          // the FIRST thing that renders an Asset type — a lazily-loaded picker
          // showing the same fallback glyph on all thirteen rows is a row of
          // decoration that tells the owner nothing.
          const Icon = assetTypeIcon(option.value);
          return <Icon />;
        }}
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
      {surface === "sheet" ? (
        // The capture sheet's own sticky commitment row — the same one every
        // other capture panel uses, so Create sits above the keyboard in the
        // same place whatever you are capturing. Cancel is the sheet's Close.
        <div className="dh-capture-actions">
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Create asset
          </FormButton>
        </div>
      ) : (
        // Sticky only where the form genuinely scrolls under a keyboard: on a
        // phone. A sticky bar over three fields on a laptop is chrome that costs
        // rows and earns nothing (MOBILE-01, `FormActions sticky`).
        <FormActions sticky={compact}>
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
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Create asset
          </FormButton>
        </FormActions>
      )}
    </Form>
  );
}
