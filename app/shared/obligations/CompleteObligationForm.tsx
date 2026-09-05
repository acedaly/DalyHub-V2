/**
 * V2.10 LIFE-02 — the ONE "complete an obligation" form.
 *
 * Completing does not merely tick something off. It records WHAT HAPPENED, and
 * where the subject keeps a history it writes the proof there, advances the
 * subject's canonical date, moves its meter, closes an open linked Task and
 * creates the next occurrence — all in one server transaction (ADR-083). So the
 * form asks for the few things that make the record true and nothing else.
 *
 * ── One form, every surface ─────────────────────────────────────────────────
 * Life Admin's collection, the Obligation record and the Asset record's
 * Obligations tab all open THIS form, posting to the obligation's own endpoint.
 * The Assets module had its own copy posting to `/asset/:id/history`; two forms
 * for one operation is two places for the rule "an amount needs a currency" to
 * be enforced differently.
 *
 * ── The subject's own fields ────────────────────────────────────────────────
 * A provider, a contact and a meter reading are facts about the SUBJECT'S
 * history, not about the obligation, so they are shown only when the surface
 * supplies what they need and they travel under `subject[...]` to the domain
 * that owns them. An obligation about nothing shows none of them, which is not a
 * degraded form — it is the whole form for that obligation.
 *
 * ── The amount ──────────────────────────────────────────────────────────────
 * Asked for only where the obligation bears money, through the shared
 * `MoneyField` so the amount and its currency cannot be filled in separately.
 * It is the amount ACTUALLY paid, and recording it is never required: an
 * obligation completed with no figure is completed, not half-completed. V2.10
 * records no payment and no settlement — this is a number about what happened,
 * not a claim that anything was reconciled.
 */

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

/** A record the owner can point at — a Person, a Note. */
export interface ObligationRecordOption {
  readonly id: string;
  readonly title: string;
}

type Values = {
  completedOn: string;
  title: string;
  completedAmount: string;
  currencyCode: string;
  nextDueDate: string;
  provider: string;
  personId: string;
  meterValue: string;
  noteId: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  completedOn: "Date completed",
  title: "What was done",
  completedAmount: "Amount paid",
  currencyCode: "Currency",
  nextDueDate: "Next due",
  provider: "Provider",
  personId: "Contact",
  meterValue: "Meter reading",
  noteId: "Linked note",
  description: "Notes",
};

/** What the endpoint answers. Mirrors the DS-06 JSON form contract. */
export type CompleteObligationResponse =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export interface CompleteObligationFormProps {
  readonly obligation: SerializedObligation;
  /** The owner-calendar day, which is the sensible default for "when". */
  readonly today: string;
  readonly defaultCurrency: string;
  /**
   * People the owner may name as the contact. Omit where the surface has no
   * bounded list to offer — the field is then simply absent, rather than an
   * empty select that looks broken.
   */
  readonly people?: readonly ObligationRecordOption[];
  readonly notes?: readonly ObligationRecordOption[];
  /**
   * True when the subject keeps a history that a provider and a contact belong
   * to. False for an obligation about nothing, or about a record with no
   * logbook.
   */
  readonly subjectKeepsHistory?: boolean;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

function optionsFor(
  records: readonly ObligationRecordOption[],
  current: string,
) {
  const options = [
    { value: "", label: "Not set" },
    ...records.map((record) => ({ value: record.id, label: record.title })),
  ];
  if (current && !records.some((record) => record.id === current)) {
    options.push({ value: current, label: "(current selection)" });
  }
  return options;
}

export function CompleteObligationForm({
  obligation,
  today,
  defaultCurrency,
  people,
  notes,
  subjectKeepsHistory = false,
  onSaved,
  onCancel,
}: CompleteObligationFormProps) {
  const repeats = obligation.recurrenceKind !== "none";
  const meterBased = obligation.meterThreshold !== null;
  /*
   * The amount is offered on EVERY completion, and required on none.
   *
   * Gating it on whether an expected amount was set reads well and is wrong:
   * completion is the one moment the real figure is known, and an owner who did
   * not guess in advance is the ordinary case, not a signal that this one is
   * free. It also feeds the subject's proof row — an Asset service completed
   * without it loses its cost from the Asset's own history, which is behaviour
   * the Assets form had before this became the one completion path.
   */

  const form = useForm<Values>({
    initialValues: {
      completedOn: today,
      title: obligation.title,
      completedAmount: "",
      currencyCode: obligation.currencyCode ?? defaultCurrency,
      // Left blank so the server's recurrence calculation is used unless the
      // owner deliberately overrides it with the real date.
      nextDueDate: "",
      provider: "",
      personId: "",
      meterValue: "",
      noteId: "",
      description: "",
    },
    fieldOrder: Object.keys(FIELD_LABELS) as (keyof Values)[],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "complete");
      body.set("completedOn", values.completedOn);
      body.set("title", values.title);
      body.set("nextDueDate", values.nextDueDate);
      body.set("description", values.description);
      body.set("completedAmount", values.completedAmount);
      body.set("currencyCode", values.currencyCode);
      /*
       * The subject's own facts, namespaced. The obligation kernel never reads
       * them; the domain that owns the subject's history validates them in its
       * own terms (ADR-083 decision 2).
       */
      body.set("subject.provider", values.provider);
      body.set("subject.personId", values.personId);
      body.set("subject.noteId", values.noteId);
      body.set("subject.meterValue", values.meterValue);
      /*
       * The meter UNIT is the obligation's, never a field. It was a defaulted
       * select on the old Assets form, which meant a defaulted unit could be
       * submitted beside an empty reading and read as half a reading (§20).
       */
      body.set(
        "subject.meterUnit",
        values.meterValue.trim() ? (obligation.meterUnit ?? "") : "",
      );

      let data: CompleteObligationResponse;
      try {
        const response = await fetch(
          `/obligations/${encodeURIComponent(obligation.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as CompleteObligationResponse;
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

      <p className="dh-obligation-complete__intro">
        This records what actually happened
        {subjectKeepsHistory ? " as a history entry" : ""}
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
        <MoneyField
          label="Amount paid"
          help="What it actually cost. Leave blank if you would rather not record it."
          currencyCode={form.values.currencyCode}
          onCurrencyChange={(next) => form.setValue("currencyCode", next)}
          currencyError={form.fieldErrors.currencyCode ?? null}
          {...form.field("completedAmount")}
        />
        {subjectKeepsHistory ? (
          <TextField
            label="Provider"
            maxLength={200}
            help="A plain name is fine — it does not create a person record."
            {...form.field("provider")}
          />
        ) : null}
        {meterBased ? (
          <TextField
            label="Meter reading"
            inputMode="numeric"
            help={`The reading when the work was done, in ${obligation.meterUnit ?? "the obligation’s unit"}. The next one is measured from here.`}
            {...form.field("meterValue")}
          />
        ) : null}
        {repeats ? (
          <DateField
            label="Next due"
            help="Leave blank to schedule it automatically, or enter the real date if you have it."
            {...form.field("nextDueDate")}
          />
        ) : null}
      </FormSection>

      {people || notes ? (
        <details className="dh-obligation-disclosure">
          <summary>More details</summary>
          <div className="dh-obligation-disclosure__body">
            <FormSection title="More details">
              {people ? (
                <SelectField
                  label="Contact"
                  options={optionsFor(people, form.values.personId)}
                  {...form.field("personId")}
                />
              ) : null}
              {notes ? (
                <SelectField
                  label="Linked note"
                  options={optionsFor(notes, form.values.noteId)}
                  help="Attach the note holding the receipt or report."
                  {...form.field("noteId")}
                />
              ) : null}
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
      ) : null}

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
