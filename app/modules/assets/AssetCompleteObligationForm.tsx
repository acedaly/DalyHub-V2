/**
 * ASSET-02 — the "complete an obligation" form.
 *
 * This is the moment history and obligations meet, and the form is written to make
 * that honest. Completing does not merely tick something off: it RECORDS WHAT
 * HAPPENED as an Asset Event, advances the Asset's canonical date, creates the next
 * occurrence when the obligation repeats, and closes any open linked Task — all in
 * one server transaction (§6, §7).
 *
 * So the form asks for the few things that make the record true — when it was done,
 * what it cost, who did it, the reading at the time — and nothing else. The next
 * due date is calculated for a repeating obligation, but stays editable, because
 * the date printed on the new registration certificate beats arithmetic every time.
 */

import { ASSET_METER_UNIT_OPTIONS } from "~/kernel/assets";
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
import type { SerializedAssetObligation } from "./asset-history-view";
import type { AssetHistoryResult } from "./routes/history";

const METER_UNIT_OPTIONS = [
  { value: "", label: "Not set" },
  ...ASSET_METER_UNIT_OPTIONS.map((u) => ({
    value: u.value,
    label: u.label,
  })),
];

type Values = {
  completedOn: string;
  title: string;
  cost: string;
  currencyCode: string;
  provider: string;
  personId: string;
  meterValue: string;
  meterUnit: string;
  nextDueDate: string;
  noteId: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  completedOn: "Date completed",
  title: "What was done",
  cost: "Cost",
  currencyCode: "Currency",
  provider: "Provider",
  personId: "Contact",
  meterValue: "Meter reading",
  meterUnit: "Meter unit",
  nextDueDate: "Next due",
  noteId: "Linked note",
  description: "Notes",
};

interface AssetCompleteObligationFormProps {
  readonly assetId: string;
  readonly obligation: SerializedAssetObligation;
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

export function AssetCompleteObligationForm({
  assetId,
  obligation,
  today,
  defaultCurrency,
  defaultMeterUnit,
  people,
  notes,
  onSaved,
  onCancel,
}: AssetCompleteObligationFormProps) {
  const repeats = obligation.recurrenceKind !== "none";
  const meterBased = obligation.meterThreshold !== null;

  const form = useForm<Values>({
    initialValues: {
      completedOn: today,
      title: obligation.title,
      cost: "",
      currencyCode: defaultCurrency,
      provider: "",
      personId: "",
      meterValue: "",
      meterUnit: obligation.meterUnit ?? defaultMeterUnit,
      // Left blank so the server's recurrence calculation is used unless the
      // owner deliberately overrides it with the real date.
      nextDueDate: "",
      noteId: "",
      description: "",
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "complete-obligation");
      body.set("obligationId", obligation.id);
      for (const [key, value] of Object.entries(values)) {
        body.set(key, value);
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
      aria-label={`Complete ${obligation.title}`}
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

      <p className="dh-asset-complete__intro">
        This records what actually happened as a history entry
        {repeats ? ", and schedules the next one" : ""}
        {obligation.taskId && obligation.taskOpen
          ? ", and completes the linked task"
          : ""}
        .
      </p>

      <FormSection title="What happened">
        <DateField
          label="Date completed"
          required
          {...form.field("completedOn")}
        />
        <TextField
          label="What was done"
          maxLength={200}
          {...form.field("title")}
        />
        <TextField label="Cost" inputMode="decimal" {...form.field("cost")} />
        <TextField
          label="Provider"
          maxLength={200}
          help="A plain name is fine — it does not create a person record."
          {...form.field("provider")}
        />
        {meterBased ? (
          <>
            <TextField
              label="Meter reading"
              inputMode="numeric"
              help="The reading when the work was done. The next one is measured from here."
              {...form.field("meterValue")}
            />
            <SelectField
              label="Meter unit"
              options={METER_UNIT_OPTIONS}
              {...form.field("meterUnit")}
            />
          </>
        ) : null}
        {repeats ? (
          <DateField
            label="Next due"
            help="Leave blank to schedule it automatically, or enter the real date if you have it."
            {...form.field("nextDueDate")}
          />
        ) : null}
      </FormSection>

      <details className="dh-asset-disclosure">
        <summary>More details</summary>
        <div className="dh-asset-disclosure__body">
          <FormSection title="More details">
            <TextField
              label="Currency"
              maxLength={3}
              {...form.field("currencyCode")}
            />
            <SelectField
              label="Contact"
              options={optionsFor(people, form.values.personId)}
              {...form.field("personId")}
            />
            <SelectField
              label="Linked note"
              options={optionsFor(notes, form.values.noteId)}
              help="Attach the note holding the receipt or report."
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
          Record and complete
        </FormButton>
        <FormButton type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </FormButton>
      </FormActions>
    </Form>
  );
}
