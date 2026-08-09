/**
 * GOAL-02 — "How will you measure this Goal?"
 *
 * The one place a Goal's measurement strategy is chosen or changed. It is a
 * sheet rather than a set of inline fields because these five values are
 * INTERDEPENDENT: picking a strategy changes which fields exist at all, and a
 * baseline typed before a target has no meaning on its own. DalyHub's inline
 * editing rule (EDIT-02) applies to independent values — a title, a date, a
 * paragraph — and this is the case it deliberately excludes.
 *
 * ── Progressive disclosure ──────────────────────────────────────────────────
 * The strategy is chosen first, from four described options, and only then do
 * its own fields appear. Nobody is asked for a baseline before they have said
 * they are tracking one, and nobody is shown a milestone list while configuring
 * a weight goal.
 *
 * ── The owner never chooses a direction ─────────────────────────────────────
 * Whether progress means the number going up or down is INFERRED from the
 * baseline and the target (85 → 70 goes down; 5,000 → 20,000 goes up), and the
 * inference is stated back in plain words underneath the fields so it can be
 * checked without understanding it. The explicit override exists only for the
 * genuinely ambiguous case — an equal baseline and target — and is otherwise
 * kept out of the way.
 */

import { useId, useState } from "react";

import {
  GOAL_MEASUREMENT_TYPES,
  GOAL_MEASUREMENT_TYPE_DESCRIPTIONS,
  GOAL_MEASUREMENT_TYPE_LABELS,
  GOAL_MEASUREMENT_UNIT_MAX_LENGTH,
  GOAL_MEASUREMENT_UNIT_SUGGESTIONS,
  inferGoalMeasurementDirection,
  type GoalMeasurementType,
} from "~/kernel/goals";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { Sheet } from "~/shared/sheet";

import { formatMeasurementValue } from "./goal-progress-view";

export type GoalMeasurementSetupValues = {
  readonly measurementType: GoalMeasurementType;
  readonly unit: string;
  readonly baselineValue: string;
  readonly targetValue: string;
};

export type GoalMeasurementSetupOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export interface GoalMeasurementSetupSheetProps {
  readonly goalTitle: string;
  readonly initial?: Partial<GoalMeasurementSetupValues>;
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
  readonly onSubmit: (
    values: GoalMeasurementSetupValues,
  ) => Promise<GoalMeasurementSetupOutcome>;
}

const FIELD_LABELS: Record<string, string> = {
  measurementType: "Measurement",
  unit: "Measure in",
  baselineValue: "Starting value",
  targetValue: "Target value",
};

/** The wording each strategy gives its two numeric fields. */
const FIELD_COPY: Record<
  GoalMeasurementType,
  { readonly baseline: string | null; readonly target: string | null }
> = {
  target_value: { baseline: "Starting value", target: "Target value" },
  accumulation: { baseline: null, target: "Total to reach" },
  milestone: { baseline: null, target: null },
  manual: { baseline: null, target: null },
};

export function GoalMeasurementSetupSheet({
  goalTitle,
  initial,
  opener,
  onClose,
  onSubmit,
}: GoalMeasurementSetupSheetProps) {
  const formId = useId();
  const unitListId = useId();
  const [type, setType] = useState<GoalMeasurementType | null>(
    (initial?.measurementType as GoalMeasurementType | undefined) ?? null,
  );

  const form = useForm<GoalMeasurementSetupValues>({
    initialValues: {
      measurementType:
        (initial?.measurementType as GoalMeasurementType | undefined) ??
        "target_value",
      unit: initial?.unit ?? "",
      baselineValue: initial?.baselineValue ?? "",
      targetValue: initial?.targetValue ?? "",
    },
    fields: {},
    fieldOrder: ["measurementType", "unit", "baselineValue", "targetValue"],
    onSubmit: async (
      values,
    ): Promise<SubmitOutcome<GoalMeasurementSetupValues>> => {
      const outcome = await onSubmit({ ...values, measurementType: type! });
      if (outcome.ok) {
        onClose();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: outcome.formError,
        fieldErrors: outcome.fieldErrors as
          | Partial<Record<keyof GoalMeasurementSetupValues & string, string>>
          | undefined,
      };
    },
  });

  const unitField = form.field("unit");
  const baselineField = form.field("baselineValue");
  const targetField = form.field("targetValue");
  const copy = type ? FIELD_COPY[type] : null;

  // The inference, stated back in the owner's terms. Shown only when both
  // numbers are present, because "this will go up" beside two empty fields is a
  // claim about nothing.
  const baselineNumber = Number(baselineField.value);
  const targetNumber = Number(targetField.value);
  const bothPresent =
    baselineField.value.trim().length > 0 &&
    targetField.value.trim().length > 0 &&
    Number.isFinite(baselineNumber) &&
    Number.isFinite(targetNumber);
  const direction = bothPresent
    ? inferGoalMeasurementDirection(baselineNumber, targetNumber)
    : null;
  const ambiguous = bothPresent && baselineNumber === targetNumber;

  return (
    <Sheet
      title="How will you measure this Goal?"
      description={goalTitle}
      opener={opener}
      onClose={onClose}
      variant="full"
      data-testid="goal-measurement-sheet"
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
            disabled={type === null}
            data-testid="goal-measurement-save"
          >
            Save
          </FormButton>
        </FormActions>
      }
    >
      <Form
        id={formId}
        aria-label="Goal measurement"
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
        {/*
          A real radio group, not a row of buttons: arrow keys move between
          options, one Tab stop covers the set, and the chosen strategy is
          announced. The M3-Expressive treatment is entirely in CSS over these
          native semantics (`goals.css`).
        */}
        <fieldset className="dh-measure-choices">
          <legend className="dh-measure-choices__legend">
            Measurement type
          </legend>
          {GOAL_MEASUREMENT_TYPES.map((option) => (
            <label
              key={option}
              className="dh-measure-choice"
              data-selected={type === option ? "true" : undefined}
            >
              <input
                type="radio"
                name="measurementType"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                data-testid={`goal-measurement-type-${option}`}
              />
              {/* The label text is a DIRECT child of the label element: nesting
                  it one level deeper is what stops both linters and some
                  assistive tech from finding the control's name. */}
              <span className="dh-measure-choice__label">
                {GOAL_MEASUREMENT_TYPE_LABELS[option]}
              </span>
              <span className="dh-measure-choice__description">
                {GOAL_MEASUREMENT_TYPE_DESCRIPTIONS[option]}
              </span>
            </label>
          ))}
        </fieldset>

        {/* Only the chosen strategy's own fields appear. */}
        {type === "target_value" || type === "accumulation" ? (
          <>
            <TextField
              label="Measure in"
              help="kg, km, books, $ — whatever this Goal is counted in."
              placeholder="kg"
              maxLength={GOAL_MEASUREMENT_UNIT_MAX_LENGTH}
              showOptionalCue
              {...unitField}
            />
            {/*
              Suggestions, never a closed set — a custom unit is one the owner
              types, and these simply save the typing. They are real buttons
              rather than a `datalist`, because a datalist is invisible until
              focused, unreachable by touch on several mobile browsers, and
              silently ignored by some assistive tech. Each is a 44px target.
            */}
            <div
              className="dh-measure-units"
              role="group"
              aria-label="Common units"
              id={unitListId}
            >
              {GOAL_MEASUREMENT_UNIT_SUGGESTIONS.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className="dh-measure-unit"
                  data-selected={unitField.value === unit ? "true" : undefined}
                  aria-pressed={unitField.value === unit}
                  onClick={() => unitField.onChange(unit)}
                >
                  {unit}
                </button>
              ))}
            </div>
            {copy?.baseline ? (
              <TextField
                label={copy.baseline}
                inputMode="decimal"
                autoComplete="off"
                showOptionalCue
                {...baselineField}
              />
            ) : null}
            {copy?.target ? (
              <TextField
                label={copy.target}
                inputMode="decimal"
                autoComplete="off"
                {...targetField}
              />
            ) : null}
            {direction !== null && !ambiguous ? (
              <p className="dh-measure-inference" role="status">
                {direction === "decrease"
                  ? `Progress means going down, from ${formatMeasurementValue(
                      baselineNumber,
                      unitField.value || null,
                    )} to ${formatMeasurementValue(targetNumber, unitField.value || null)}.`
                  : `Progress means going up, from ${formatMeasurementValue(
                      baselineNumber,
                      unitField.value || null,
                    )} to ${formatMeasurementValue(targetNumber, unitField.value || null)}.`}
              </p>
            ) : null}
            {ambiguous ? (
              <p className="dh-measure-inference" role="status">
                The starting value and the target are the same, so there is
                nothing to measure yet. Change one of them.
              </p>
            ) : null}
          </>
        ) : null}

        {type === "milestone" ? (
          <p className="dh-measure-inference">
            Progress comes from the stages you complete. Add them on the Goal
            after saving — each counts equally unless you give it a weight.
          </p>
        ) : null}

        {type === "manual" ? (
          <p className="dh-measure-inference">
            You will set the percentage yourself. Use this when an outcome
            genuinely cannot be counted — anything you can count is worth
            counting instead.
          </p>
        ) : null}
      </Form>
    </Sheet>
  );
}
