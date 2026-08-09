/**
 * GOAL-02 — the Goal check-in.
 *
 * The single most frequent thing an owner does with a measurable Goal is record
 * one number. So this is a three-field sheet — value, date, optional note — and
 * nothing else. It never asks about the target, the unit or the measurement
 * strategy: those are configuration, they were set once, and putting them here
 * would turn a five-second act into a form.
 *
 * ── Phone first ─────────────────────────────────────────────────────────────
 * It is the shared MOBILE-01 `Sheet`, which rises from the bottom on a phone and
 * becomes a centred dialog above 768px — one component, one focus trap, one set
 * of Escape/scrim rules. The value field takes initial focus, so the keyboard
 * opens straight onto the number, and it carries `inputMode="decimal"` so that
 * keyboard is a decimal keypad rather than a full QWERTY. The date defaults to
 * today, which is what it is nearly always going to be. The Save action sits in
 * the sheet's sticky footer, above the phone keyboard and above the bottom
 * navigation.
 *
 * ── It is the same sheet for a correction ───────────────────────────────────
 * Editing an existing reading opens this with the values filled in and a
 * different title. A correction is the same three fields; a second component for
 * it would be a second place for the numeric input mode, the date bounds and the
 * error handling to drift.
 *
 * It lives in `app/shared` because Today opens it too, and Today may not import
 * the Goals module's internals (`docs/development/MODULES.md`).
 */

import { useId, useRef } from "react";

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  DateField,
  useForm,
  required,
  type SubmitOutcome,
} from "~/shared/forms";
import { Sheet } from "~/shared/sheet";
import { GOAL_MEASUREMENT_NOTE_MAX_LENGTH } from "~/kernel/goals";

import { formatMeasurementValue } from "./goal-progress-view";

/** What a check-in submits. The caller posts it; this sheet never fetches. */
export type GoalCheckInValues = {
  readonly value: string;
  readonly measuredOn: string;
  readonly note: string;
};

export type GoalCheckInOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export interface GoalCheckInSheetProps {
  /** The Goal's name, so the sheet says what is being measured. */
  readonly goalTitle: string;
  /** The action verb this Goal deserves ("Log weight", "Add measurement"). */
  readonly actionLabel: string;
  readonly unit: string | null;
  /** The current value, shown for context so the owner can see what they are
   * moving from. `null` when nothing has been recorded yet. */
  readonly currentValue: number | null;
  /** The owner's calendar today, resolved server-side — never `new Date()`. */
  readonly todayIso: string;
  /** Pre-filled values when correcting an existing reading. */
  readonly initial?: Partial<GoalCheckInValues>;
  /** `record` (default) or `correct` — changes only the title and the verb. */
  readonly mode?: "record" | "correct";
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
  readonly onSubmit: (values: GoalCheckInValues) => Promise<GoalCheckInOutcome>;
}

const FIELD_LABELS: Record<string, string> = {
  value: "Measurement",
  measuredOn: "Date",
  note: "Note",
};

export function GoalCheckInSheet({
  goalTitle,
  actionLabel,
  unit,
  currentValue,
  todayIso,
  initial,
  mode = "record",
  opener,
  onClose,
  onSubmit,
}: GoalCheckInSheetProps) {
  const valueRef = useRef<HTMLElement | null>(null);
  // The sheet's primary action lives in the sticky footer — outside the form's
  // subtree in the DOM, because that is what keeps Save above the phone keyboard.
  // `form="<id>"` associates them, so Enter in a field and a tap on Save do the
  // same thing.
  const formId = useId();

  const form = useForm<GoalCheckInValues>({
    initialValues: {
      value: initial?.value ?? "",
      measuredOn: initial?.measuredOn ?? todayIso,
      note: initial?.note ?? "",
    },
    fields: {
      value: { validate: required("Enter a measurement") },
      measuredOn: { validate: required("A date is required") },
    },
    fieldOrder: ["value", "measuredOn", "note"],
    onSubmit: async (values): Promise<SubmitOutcome<GoalCheckInValues>> => {
      const outcome = await onSubmit(values);
      if (outcome.ok) {
        onClose();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: outcome.formError,
        fieldErrors: outcome.fieldErrors as
          Partial<Record<keyof GoalCheckInValues & string, string>> | undefined,
      };
    },
  });

  const valueField = form.field("value");
  const dateField = form.field("measuredOn");
  const noteField = form.field("note");

  return (
    <Sheet
      title={mode === "correct" ? "Edit measurement" : actionLabel}
      description={
        mode === "correct"
          ? `Correct a recorded measurement for ${goalTitle}.`
          : currentValue === null
            ? `Record the first measurement for ${goalTitle}.`
            : `Currently ${formatMeasurementValue(currentValue, unit)}.`
      }
      opener={opener}
      onClose={onClose}
      initialFocusRef={valueRef}
      data-testid="goal-check-in-sheet"
      footer={
        <FormActions>
          <FormButton
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={form.isSubmitting}
          >
            Cancel
          </FormButton>
          <FormButton
            type="submit"
            form={formId}
            variant="primary"
            pending={form.isSubmitting}
            data-testid="goal-check-in-save"
          >
            Save
          </FormButton>
        </FormActions>
      }
    >
      <Form
        id={formId}
        aria-label={mode === "correct" ? "Edit measurement" : actionLabel}
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
          label={unit ? `Measurement (${unit})` : "Measurement"}
          required
          /*
           * `inputMode="decimal"` is the whole reason this is a text field
           * rather than `type="number"`: it summons the phone's decimal keypad
           * while keeping the value a plain string, so a partially-typed "-" or
           * "79." is not silently discarded by the browser's number parsing the
           * way `type="number"` does. Negative values are legitimate (a balance,
           * a temperature), so nothing here rejects a leading minus.
           */
          inputMode="decimal"
          autoComplete="off"
          {...valueField}
          controlRef={(node) => {
            // Both refs: the sheet's initial-focus target AND the form host's
            // first-invalid focus. Replacing the host's would silently break
            // "jump to the field that failed".
            valueRef.current = node instanceof HTMLElement ? node : null;
            valueField.controlRef?.(node);
          }}
        />
        <DateField
          label="Date"
          required
          /* A measurement cannot be taken in the future. The bound is the
           * owner's calendar today, resolved server-side. */
          max={todayIso}
          {...dateField}
        />
        <TextField
          label="Note"
          placeholder="Optional"
          maxLength={GOAL_MEASUREMENT_NOTE_MAX_LENGTH}
          showOptionalCue
          {...noteField}
        />
      </Form>
    </Sheet>
  );
}
