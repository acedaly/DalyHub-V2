/**
 * ASSET-02 — the Asset obligation form (create and edit).
 *
 * Two shapes in one restrained form, because the owner is answering one question:
 * "when does this next need doing?" — and the answer is either a DATE, a METER
 * reading, or both ("six months or 10,000 km, whichever comes first").
 *
 * The repeat control is deliberately small: a kind and an interval. There is no
 * expression language, no cron, no "advanced schedule" — "every 6 months" and
 * "every 10,000 km" cover a personal life's assets, and anything beyond that is a
 * fleet-maintenance product DalyHub is not becoming (§5, §6).
 *
 * Server-side validation is authoritative. It refuses an obligation with neither a
 * date nor a meter target, a meter target with no unit, and a repeat that could
 * never advance — and routes each refusal back to the control that caused it.
 */

import {
  ASSET_METER_UNIT_OPTIONS,
  ASSET_OBLIGATION_CATEGORY_OPTIONS,
  ASSET_RECURRENCE_OPTIONS,
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

import type { SerializedAssetObligation } from "./asset-history-view";
import type { AssetHistoryResult } from "./routes/history";

const CATEGORY_OPTIONS = ASSET_OBLIGATION_CATEGORY_OPTIONS.map((c) => ({
  value: c.value,
  label: c.label,
}));
const RECURRENCE_OPTIONS = ASSET_RECURRENCE_OPTIONS.map((r) => ({
  value: r.value,
  label: r.label,
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
  dueDate: string;
  leadDays: string;
  recurrenceKind: string;
  recurrenceInterval: string;
  meterThreshold: string;
  meterUnit: string;
  meterInterval: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  title: "Title",
  dueDate: "Due date",
  leadDays: "Warn me this many days ahead",
  recurrenceKind: "Repeats",
  recurrenceInterval: "Every",
  meterThreshold: "Due at meter reading",
  meterUnit: "Meter unit",
  meterInterval: "Repeat every",
  description: "Notes",
};

interface AssetObligationFormProps {
  readonly assetId: string;
  /** Present when editing; absent when creating. */
  readonly obligation?: SerializedAssetObligation | null;
  readonly defaultMeterUnit: string;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

export function AssetObligationForm({
  assetId,
  obligation = null,
  defaultMeterUnit,
  onSaved,
  onCancel,
}: AssetObligationFormProps) {
  const editing = obligation !== null;

  const form = useForm<Values>({
    initialValues: {
      category: obligation?.category ?? "service",
      title: obligation?.title ?? "",
      dueDate: obligation?.dueDate ?? "",
      leadDays: String(obligation?.leadDays ?? 14),
      recurrenceKind: obligation?.recurrenceKind ?? "none",
      recurrenceInterval: obligation?.recurrenceInterval
        ? String(obligation.recurrenceInterval)
        : "1",
      meterThreshold: obligation?.meterThreshold
        ? String(obligation.meterThreshold)
        : "",
      meterUnit: obligation?.meterUnit ?? defaultMeterUnit,
      meterInterval: obligation?.meterInterval
        ? String(obligation.meterInterval)
        : "",
      description: obligation?.description ?? "",
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", editing ? "update-obligation" : "create-obligation");
      if (editing) body.set("obligationId", obligation.id);
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

  const repeatsByDate =
    form.values.recurrenceKind !== "none" &&
    form.values.recurrenceKind !== "meter";
  const repeatsByMeter = form.values.recurrenceKind === "meter";

  return (
    <Form
      aria-label={editing ? "Edit obligation" : "Add obligation"}
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

      <FormSection title="What is due">
        <SelectField
          label="Category"
          required
          options={CATEGORY_OPTIONS}
          {...form.field("category")}
        />
        <TextField
          label="Title"
          required
          maxLength={200}
          {...form.field("title")}
        />
        <DateField
          label="Due date"
          help="Leave blank if this is only due at a meter reading."
          {...form.field("dueDate")}
        />
        <TextField
          label="Warn me this many days ahead"
          inputMode="numeric"
          help="How early this starts reading as due soon."
          {...form.field("leadDays")}
        />
      </FormSection>

      <FormSection title="Meter">
        <TextField
          label="Due at meter reading"
          inputMode="numeric"
          help="For example, a service due at 60,000 km. Leave blank for a date-only obligation."
          {...form.field("meterThreshold")}
        />
        <SelectField
          label="Meter unit"
          options={METER_UNIT_OPTIONS}
          help="Readings are only compared within the same unit — nothing is converted."
          {...form.field("meterUnit")}
        />
      </FormSection>

      <FormSection title="Repeat">
        <SelectField
          label="Repeats"
          options={RECURRENCE_OPTIONS}
          {...form.field("recurrenceKind")}
        />
        {repeatsByDate ? (
          <TextField
            label="Every"
            inputMode="numeric"
            help="The next one is scheduled from the day the work is actually done."
            {...form.field("recurrenceInterval")}
          />
        ) : null}
        {repeatsByMeter ? (
          <TextField
            label="Repeat every"
            inputMode="numeric"
            help="How far apart, in the meter unit above. For example, 10000 for every 10,000 km."
            {...form.field("meterInterval")}
          />
        ) : null}
      </FormSection>

      <details className="dh-asset-disclosure">
        <summary>Notes</summary>
        <div className="dh-asset-disclosure__body">
          <FormSection title="Notes">
            <TextField
              label="Notes"
              multiline
              rows={3}
              maxLength={4000}
              {...form.field("description")}
            />
          </FormSection>
        </div>
      </details>

      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          {editing ? "Save changes" : "Add obligation"}
        </FormButton>
        <FormButton type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </FormButton>
      </FormActions>
    </Form>
  );
}
