/**
 * ASSET-02 — the Asset event form (fast capture, progressive disclosure).
 *
 * The rule this form exists to obey (§13): **ask for the least that can work.**
 * "Update meter" is two fields. "Record service" is a date, a title and a handful
 * of things a person actually has on the invoice in front of them. Everything else
 * — the warranty date an event asserts, the linked Note, the person — lives behind
 * a "More details" disclosure that most captures never open.
 *
 * Each quick action seeds a different, smaller form rather than one giant generic
 * one with thirty visible fields. The shape comes from `QUICK_EVENT_PRESETS`, so
 * adding a preset is data, not another component.
 *
 * Posts to `/asset/:id/history`; server-side validation is authoritative and its
 * field errors are routed back to the exact control that caused them (§20).
 */

import {
  ASSET_EVENT_CATEGORY_OPTIONS,
  ASSET_METER_UNIT_OPTIONS,
} from "~/kernel/assets";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  FormSection,
  SelectField,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { RecordOption } from "./AssetDetailsForm";
import type { QuickEventAction } from "./AssetHistoryTab";
import type { SerializedAssetEvent } from "./asset-history-view";
import type { AssetHistoryResult } from "./routes/history";

/** Which optional fields a preset reveals up front. */
type PresetShape = {
  readonly title: string;
  readonly heading: string;
  readonly category: string;
  readonly defaultTitle: string;
  readonly showCost: boolean;
  readonly showValue: boolean;
  readonly showMeter: boolean;
  readonly showProvider: boolean;
  readonly showNextDue: boolean;
  /** The label the "next due" control carries, in this preset's own words. */
  readonly nextDueLabel: string;
};

/**
 * The fast-capture presets. Each names the SMALLEST useful field set for one real
 * action an owner takes — never a superset "just in case".
 */
export const QUICK_EVENT_PRESETS: Record<QuickEventAction, PresetShape> = {
  service: {
    title: "Record service",
    heading: "What was done",
    category: "service",
    defaultTitle: "Service",
    showCost: true,
    showValue: false,
    showMeter: true,
    showProvider: true,
    showNextDue: true,
    nextDueLabel: "Next service due",
  },
  repair: {
    title: "Record repair",
    heading: "What was repaired",
    category: "repair",
    defaultTitle: "Repair",
    showCost: true,
    showValue: false,
    showMeter: true,
    showProvider: true,
    showNextDue: false,
    nextDueLabel: "Next due",
  },
  meter: {
    title: "Update meter",
    heading: "Current reading",
    category: "history",
    defaultTitle: "Meter reading",
    showCost: false,
    showValue: false,
    showMeter: true,
    showProvider: false,
    showNextDue: false,
    nextDueLabel: "Next due",
  },
  renewal: {
    title: "Record renewal",
    heading: "What was renewed",
    category: "registration",
    defaultTitle: "Renewal",
    showCost: true,
    showValue: false,
    showMeter: false,
    showProvider: true,
    showNextDue: true,
    nextDueLabel: "Next renewal due",
  },
  valuation: {
    title: "Record valuation",
    heading: "What it is worth",
    category: "valuation",
    defaultTitle: "Valuation",
    showCost: false,
    showValue: true,
    showMeter: false,
    showProvider: true,
    showNextDue: false,
    nextDueLabel: "Next due",
  },
  history: {
    title: "Add history entry",
    heading: "What happened",
    category: "history",
    defaultTitle: "",
    showCost: false,
    showValue: false,
    showMeter: false,
    showProvider: false,
    showNextDue: false,
    nextDueLabel: "Next due",
  },
};

const CATEGORY_OPTIONS = ASSET_EVENT_CATEGORY_OPTIONS.map((c) => ({
  value: c.value,
  label: c.label,
}));
const METER_UNIT_OPTIONS = [
  { value: "", label: "Not set" },
  ...ASSET_METER_UNIT_OPTIONS.map((u) => ({
    value: u.value,
    label: u.label,
  })),
];

type Values = {
  category: string;
  title: string;
  eventDate: string;
  cost: string;
  value: string;
  currencyCode: string;
  provider: string;
  personId: string;
  meterValue: string;
  meterUnit: string;
  nextDueDate: string;
  warrantyExpiry: string;
  noteId: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  title: "Title",
  eventDate: "Date",
  cost: "Cost",
  value: "Value",
  currencyCode: "Currency",
  provider: "Provider",
  personId: "Contact",
  meterValue: "Meter reading",
  meterUnit: "Meter unit",
  nextDueDate: "Next due",
  warrantyExpiry: "Warranty expires",
  noteId: "Linked note",
  description: "Notes",
};

interface AssetEventFormProps {
  readonly assetId: string;
  readonly action: QuickEventAction;
  /** Present when editing an existing entry rather than capturing a new one. */
  readonly event?: SerializedAssetEvent | null;
  /** Owner-calendar today, so the date defaults to the owner's day, not UTC's. */
  readonly today: string;
  readonly defaultCurrency: string;
  readonly defaultMeterUnit: string;
  readonly people: readonly RecordOption[];
  readonly notes: readonly RecordOption[];
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

function optionsFor(records: readonly RecordOption[], current: string) {
  const options = [
    { value: "", label: "Not set" },
    ...records.map((r) => ({ value: r.id, label: r.title })),
  ];
  if (current && !records.some((r) => r.id === current)) {
    options.push({ value: current, label: "(current selection)" });
  }
  return options;
}

export function AssetEventForm({
  assetId,
  action,
  event = null,
  today,
  defaultCurrency,
  defaultMeterUnit,
  people,
  notes,
  onSaved,
  onCancel,
}: AssetEventFormProps) {
  const preset = QUICK_EVENT_PRESETS[action];
  const editing = event !== null;

  const form = useForm<Values>({
    initialValues: {
      category: event?.category ?? preset.category,
      title: event?.title ?? preset.defaultTitle,
      eventDate: event?.eventDate ?? today,
      cost: event?.costDisplay ? stripCurrency(event.costDisplay) : "",
      value: event?.valueDisplay ? stripCurrency(event.valueDisplay) : "",
      currencyCode: event?.currencyCode ?? defaultCurrency,
      provider: event?.provider ?? "",
      personId: event?.personId ?? "",
      meterValue: "",
      meterUnit: defaultMeterUnit,
      nextDueDate: event?.nextDueDate ?? "",
      warrantyExpiry: event?.warrantyExpiry ?? "",
      noteId: event?.noteId ?? "",
      description: event?.description ?? "",
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set(
        "intent",
        editing
          ? "update-event"
          : action === "meter"
            ? "update-meter"
            : "record-event",
      );
      if (editing) body.set("eventId", event.id);
      for (const [key, value] of Object.entries(values)) {
        body.set(key, value);
      }
      // The meter unit is a FIELD DEFAULT (a vehicle's is km), not an assertion
      // that a reading was taken. An empty reading clears the unit with it, so a
      // defaulted unit can never be mistaken for half a reading (§20).
      if (values.meterValue.trim() === "") {
        body.set("meterUnit", "");
      }
      let data: AssetHistoryResult;
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(assetId)}/history`,
          { method: "POST", body },
        );
        data = (await response.json()) as AssetHistoryResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.ok) {
        onSaved();
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

  return (
    <Form
      aria-label={preset.title}
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

      <FormSection title={preset.heading}>
        <DateField label="Date" required {...form.field("eventDate")} />
        <TextField
          label="Title"
          required
          maxLength={200}
          {...form.field("title")}
        />

        {preset.showMeter ? (
          <>
            <TextField
              label="Meter reading"
              inputMode="numeric"
              help="The odometer, hour meter or cycle count at the time."
              {...form.field("meterValue")}
            />
            <SelectField
              label="Meter unit"
              options={METER_UNIT_OPTIONS}
              {...form.field("meterUnit")}
            />
          </>
        ) : null}

        {preset.showCost ? (
          <TextField
            label="Cost"
            inputMode="decimal"
            help="What it cost. Leave blank if you would rather not record it."
            {...form.field("cost")}
          />
        ) : null}

        {preset.showValue ? (
          <TextField
            label="Value"
            inputMode="decimal"
            help="What this valuation says the asset is worth."
            {...form.field("value")}
          />
        ) : null}

        {preset.showProvider ? (
          <TextField
            label="Provider"
            maxLength={200}
            help="Who did the work. A plain name is fine — it does not create a person record."
            {...form.field("provider")}
          />
        ) : null}

        {preset.showNextDue ? (
          <DateField
            label={preset.nextDueLabel}
            help="Setting this updates the asset’s next due date."
            {...form.field("nextDueDate")}
          />
        ) : null}
      </FormSection>

      {/* Everything else, only when asked for. */}
      <details className="dh-asset-disclosure">
        <summary>More details</summary>
        <div className="dh-asset-disclosure__body">
          <FormSection title="More details">
            {editing || action === "history" ? (
              <SelectField
                label="Category"
                options={CATEGORY_OPTIONS}
                {...form.field("category")}
              />
            ) : null}
            {!preset.showCost ? (
              <TextField
                label="Cost"
                inputMode="decimal"
                {...form.field("cost")}
              />
            ) : null}
            <TextField
              label="Currency"
              maxLength={3}
              help="Amounts are always stored with an explicit currency; nothing is converted."
              {...form.field("currencyCode")}
            />
            {!preset.showProvider ? (
              <TextField
                label="Provider"
                maxLength={200}
                {...form.field("provider")}
              />
            ) : null}
            <SelectField
              label="Contact"
              options={optionsFor(people, form.values.personId)}
              help="Optionally link the person this was done with."
              {...form.field("personId")}
            />
            <DateField
              label="Warranty expires"
              help="Setting this updates the asset’s warranty expiry, if it is later than the current one."
              {...form.field("warrantyExpiry")}
            />
            {!preset.showNextDue ? (
              <DateField label="Next due" {...form.field("nextDueDate")} />
            ) : null}
            <SelectField
              label="Linked note"
              options={optionsFor(notes, form.values.noteId)}
              help="Attach a note holding the receipt, report or policy details."
              {...form.field("noteId")}
            />
            <TextField
              label="Notes"
              multiline
              rows={4}
              maxLength={20000}
              {...form.field("description")}
            />
          </FormSection>
        </div>
      </details>

      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          {editing ? "Save changes" : preset.title}
        </FormButton>
        <FormButton type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </FormButton>
      </FormActions>
    </Form>
  );
}

/** Strip currency symbols/separators so a formatted amount round-trips into a field. */
function stripCurrency(display: string): string {
  return display.replace(/[^\d.]/g, "");
}
