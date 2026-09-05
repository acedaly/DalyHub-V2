/**
 * V2.10 LIFE-02 — the ONE obligation form (create and edit).
 *
 * Two shapes in one restrained form, because the owner is answering one
 * question: "when does this next need doing?" — and the answer is either a
 * DATE, a METER reading, or both ("six months or 10,000 km, whichever comes
 * first").
 *
 * The repeat control is deliberately small: a kind and an interval. There is no
 * expression language, no cron, no "advanced schedule" — "every 6 months" and
 * "every 10,000 km" cover a personal life, and anything beyond that is a
 * scheduling product DalyHub is not becoming.
 *
 * ── Title first, subject optional ───────────────────────────────────────────
 * The first field is the title and the LAST is what it is about, in that order
 * on purpose: an obligation about nothing is the ordinary case V2.10 exists
 * for, and a form that asks "which asset?" before it asks "what is it?" teaches
 * the opposite. The subject field states its own absence in words rather than
 * sitting empty.
 *
 * ── The meter is the SUBJECT's, so it appears only where there is one ───────
 * A meter target on an obligation about nothing is refused by the database, so
 * the fields are shown only when the surface supplies the unit vocabulary its
 * subject uses. That is not a convenience: an owner offered a control the
 * server will reject has been lied to by the form.
 *
 * Server-side validation is authoritative. It refuses an obligation with
 * neither a date nor a meter target, a meter target with no unit, an amount
 * with no currency and a repeat that could never advance — and routes each
 * refusal back to the control that caused it.
 */

import { useState } from "react";

import {
  OBLIGATION_CATEGORY_OPTIONS,
  OBLIGATION_RECURRENCE_OPTIONS,
} from "~/kernel/obligations";
import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  FormSection,
  MoneyField,
  SelectField,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { SerializedObligation } from "./obligation-view";
import { SubjectPicker, type ObligationSubjectOption } from "./SubjectPicker";

const CATEGORY_OPTIONS = OBLIGATION_CATEGORY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));
const RECURRENCE_OPTIONS = OBLIGATION_RECURRENCE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

type Values = {
  title: string;
  category: string;
  dueDate: string;
  leadDays: string;
  recurrenceKind: string;
  recurrenceInterval: string;
  meterThreshold: string;
  meterUnit: string;
  meterInterval: string;
  expectedAmount: string;
  currencyCode: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  category: "Category",
  dueDate: "Due date",
  leadDays: "Warn me this many days ahead",
  recurrenceKind: "Repeats",
  recurrenceInterval: "Every",
  meterThreshold: "Due at meter reading",
  meterUnit: "Meter unit",
  meterInterval: "Repeat every",
  expectedAmount: "Expected amount",
  currencyCode: "Currency",
  description: "Notes",
};

/** What the endpoint answers. Mirrors the DS-06 JSON form contract. */
export type ObligationFormResponse =
  | { readonly ok: true; readonly obligationId?: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export interface ObligationFormProps {
  /** Present when editing; absent when creating. */
  readonly obligation?: SerializedObligation | null;
  /**
   * Where to POST. The create page and the record's own edit path each supply
   * their endpoint; the form knows nothing about routes.
   */
  readonly action: string;
  readonly defaultCurrency: string;
  /**
   * The subject's meter vocabulary. Absent — an obligation about nothing, or
   * about a record with no meter — hides the meter fields entirely.
   */
  readonly meterUnits?: readonly { value: string; label: string }[];
  /**
   * A subject fixed by the surface (a record's own tab). When set, the picker
   * is not shown: the answer to "what is this about?" is already known and
   * offering to change it here would be a second authority for it.
   */
  readonly fixedSubject?: ObligationSubjectOption | null;
  /** Candidate-subject search. Omit to hide the picker. */
  readonly searchSubjects?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly ObligationSubjectOption[]>;
  readonly onSaved: (obligationId?: string) => void;
  readonly onCancel: () => void;
}

export function ObligationForm({
  obligation = null,
  action,
  defaultCurrency,
  meterUnits,
  fixedSubject = null,
  searchSubjects,
  onSaved,
  onCancel,
}: ObligationFormProps) {
  const editing = obligation !== null;
  const [subject, setSubject] = useState<ObligationSubjectOption | null>(
    fixedSubject ??
      (obligation?.subject
        ? {
            id: obligation.subject.id,
            type: obligation.subject.type,
            title: obligation.subject.title,
          }
        : null),
  );
  const showMeter = Boolean(meterUnits && meterUnits.length > 0);

  const form = useForm<Values>({
    initialValues: {
      title: obligation?.title ?? "",
      category: obligation?.category ?? "reminder",
      dueDate: obligation?.dueDate ?? "",
      leadDays: String(obligation?.leadDays ?? 14),
      recurrenceKind: obligation?.recurrenceKind ?? "none",
      recurrenceInterval: obligation?.recurrenceInterval
        ? String(obligation.recurrenceInterval)
        : "1",
      meterThreshold: obligation?.meterThreshold
        ? String(obligation.meterThreshold)
        : "",
      meterUnit: obligation?.meterUnit ?? meterUnits?.[0]?.value ?? "",
      meterInterval: obligation?.meterInterval
        ? String(obligation.meterInterval)
        : "",
      expectedAmount: obligation?.expectedAmountInput ?? "",
      currencyCode: obligation?.currencyCode ?? defaultCurrency,
      description: obligation?.description ?? "",
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", editing ? "update" : "create");
      for (const [key, value] of Object.entries(values)) {
        body.set(key, value);
      }
      /*
       * A defaulted meter unit with no threshold is "no meter target", never
       * half a target: the unit is a field DEFAULT, not an assertion that a
       * target was set (§20).
       */
      if (!showMeter || values.meterThreshold.trim() === "") {
        body.set("meterThreshold", "");
        body.set("meterUnit", "");
        body.set("meterInterval", "");
      }
      /*
       * The subject is sent only on CREATE. Moving an existing obligation to a
       * different subject would move its history with it and orphan the proof
       * entries already written into the old subject's logbook, so V2.10 does
       * not offer it — the honest answer is a new obligation.
       */
      if (!editing) body.set("subjectEntityId", subject?.id ?? "");

      let data: ObligationFormResponse;
      try {
        const response = await fetch(action, { method: "POST", body });
        data = (await response.json()) as ObligationFormResponse;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.ok) {
        onSaved(data.obligationId);
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
      aria-label={editing ? "Edit obligation" : "New obligation"}
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
        <TextField
          label="Title"
          required
          maxLength={200}
          {...form.field("title")}
        />
        <SelectField
          label="Category"
          required
          options={CATEGORY_OPTIONS}
          {...form.field("category")}
        />
        <DateField
          label="Due date"
          help={
            showMeter
              ? "Leave blank if this is only due at a meter reading."
              : "When this next needs doing."
          }
          {...form.field("dueDate")}
        />
        <TextField
          label="Warn me this many days ahead"
          inputMode="numeric"
          help="How early this starts reading as due soon."
          {...form.field("leadDays")}
        />
      </FormSection>

      {showMeter ? (
        <FormSection title="Meter">
          <TextField
            label="Due at meter reading"
            inputMode="numeric"
            help="For example, a service due at 60,000 km. Leave blank for a date-only obligation."
            {...form.field("meterThreshold")}
          />
          <SelectField
            label="Meter unit"
            options={[{ value: "", label: "Not set" }, ...(meterUnits ?? [])]}
            help="Readings are only compared within the same unit — nothing is converted."
            {...form.field("meterUnit")}
          />
        </FormSection>
      ) : null}

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
        {repeatsByMeter && showMeter ? (
          <TextField
            label="Repeat every"
            inputMode="numeric"
            help="How far apart, in the meter unit above. For example, 10000 for every 10,000 km."
            {...form.field("meterInterval")}
          />
        ) : null}
      </FormSection>

      <FormSection title="Cost">
        <MoneyField
          label="Expected amount"
          help="What you expect it to cost. Optional, and never a claim that anything has been paid."
          currencyCode={form.values.currencyCode}
          onCurrencyChange={(next) => form.setValue("currencyCode", next)}
          currencyError={form.fieldErrors.currencyCode ?? null}
          {...form.field("expectedAmount")}
        />
      </FormSection>

      {!editing && searchSubjects && !fixedSubject ? (
        <FormSection title="About">
          <SubjectPicker
            value={subject}
            onChange={setSubject}
            searchSubjects={searchSubjects}
          />
        </FormSection>
      ) : null}

      <details className="dh-obligation-disclosure">
        <summary>Notes</summary>
        <div className="dh-obligation-disclosure__body">
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
