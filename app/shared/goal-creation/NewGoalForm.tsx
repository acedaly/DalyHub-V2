/**
 * AREA-02 / GOAL-02 — the shared "New goal" form.
 *
 * Lives in `app/shared` (not the Goals module) because it is composed from a
 * DIFFERENT module's record page — the Area record's Goals tab — and the
 * cross-module-import rule forbids `~/modules/areas` importing
 * `~/modules/goals` internals directly (`docs/development/MODULES.md`). This
 * mirrors the ADR-033 precedent that re-homed the shared task record surface
 * for exactly the same reason.
 *
 * ── GOAL-02: creation now asks how the Goal will be measured ────────────────
 * It used to collect a title alone, on the reasoning that every other DalyHub
 * creation surface does and that the rest is a post-creation edit. That was
 * right when a Goal had nothing to measure. It is wrong now: the central product
 * claim is that **Goals describe measurable outcomes**, and a creation flow that
 * never mentions measurement teaches the opposite.
 *
 * So the form is a two-step progressive disclosure, not a long form:
 *
 *   Step 1  the basics — name, target date. Both familiar, neither about
 *           measurement. "Create Goal" is available from here, so a Goal that
 *           genuinely cannot be measured is still one field and a button away.
 *   Step 2  "How will you measure this Goal?" — four described choices, and only
 *           the chosen one's own fields.
 *
 * ── Atomicity, stated honestly ──────────────────────────────────────────────
 * Creation is still ONE spine write (`SpineRepository.createGoal`); the target
 * date and the measurement are applied by a second, separate call to the
 * Goal-owned details repository. There is no cross-table transaction, and this
 * PR does not invent one. The consequence is bounded and recoverable: if the
 * second call fails the GOAL EXISTS and is unconfigured, the action says so, and
 * the owner lands on a record where every one of those fields is editable. That
 * is strictly better than refusing to create the Goal, and it is why the action
 * reports the configuration outcome separately rather than pretending.
 */

import { useState } from "react";

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
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import type { SelectOption } from "~/shared/forms/types";

/** The JSON shape `POST /goals/new` returns — duplicated here (not imported)
 * because importing the Goals module's route types from `app/shared` would
 * itself be a module-boundary violation; the shapes are kept in sync by the
 * Goals module's own route + component tests. */
export type CreateGoalResult =
  | {
      readonly ok: true;
      readonly goalId: string;
      /**
       * False when the Goal was created but its target date / measurement could
       * not be applied. The Goal is real either way — see the module comment.
       */
      readonly configured: boolean;
    }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

type Values = {
  readonly title: string;
  readonly targetDate: string;
  readonly unit: string;
  readonly baselineValue: string;
  readonly targetValue: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  targetDate: "Target date",
  unit: "Measure in",
  baselineValue: "Starting value",
  targetValue: "Target value",
};

/** The wording each strategy gives its numeric fields, and `null` for "this
 * strategy does not have one". */
const FIELD_COPY: Record<
  GoalMeasurementType,
  { readonly baseline: string | null; readonly target: string | null }
> = {
  target_value: { baseline: "Starting value", target: "Target value" },
  accumulation: { baseline: null, target: "Total to reach" },
  milestone: { baseline: null, target: null },
  manual: { baseline: null, target: null },
};

interface NewGoalFormProps {
  /**
   * The Area this Goal will live in, when the caller already knows it — the
   * Area record's own "New Goal", which is created IN an Area.
   */
  readonly areaId?: string;
  /**
   * REDESIGN-04 §5.1 — the Areas to choose from, for a caller that does NOT
   * already know one: the Goals workspace's `+ Add goal`.
   *
   * The mockup wins on the entry point, the architecture wins on the shape. A
   * Goal has no existence outside an Area (AREA-02 / ADR-040 lineage), so the
   * goals-side door does not create an orphan and then ask where it belongs —
   * it makes the Area a required field of the same form, posting the same body
   * to the same trusted `/goals/new` endpoint, which re-verifies the Area's
   * existence, kind and workspace itself. One more door into the same room.
   *
   * When this is supplied the picker is rendered and `areaId` seeds it; when it
   * is not, the form behaves exactly as it always has.
   */
  readonly areaOptions?: readonly SelectOption[];
  readonly onCreated: (goalId: string) => void;
  readonly onCancel: () => void;
}

export function NewGoalForm({
  areaId,
  areaOptions,
  onCreated,
  onCancel,
}: NewGoalFormProps) {
  const choosingArea = areaOptions !== undefined;
  const [chosenArea, setChosenArea] = useState(areaId ?? "");
  const [areaError, setAreaError] = useState<string | null>(null);
  /** `null` until the owner chooses — the Goal is created unmeasured. */
  const [measurementType, setMeasurementType] =
    useState<GoalMeasurementType | null>(null);

  const form = useForm<Values>({
    initialValues: {
      title: "",
      targetDate: "",
      unit: "",
      baselineValue: "",
      targetValue: "",
    },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title", "targetDate", "unit", "baselineValue", "targetValue"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      if (choosingArea && chosenArea.length === 0) {
        setAreaError("Choose the Area this Goal belongs to");
        return {
          status: "error",
          formError: "Choose the Area this Goal belongs to.",
        };
      }
      const body = new FormData();
      body.set("title", values.title);
      body.set("areaId", choosingArea ? chosenArea : (areaId ?? ""));
      body.set("targetDate", values.targetDate);
      if (measurementType !== null) {
        body.set("measurementType", measurementType);
        body.set("unit", values.unit);
        body.set("baselineValue", values.baselineValue);
        body.set("targetValue", values.targetValue);
      }
      let data: CreateGoalResult;
      try {
        const response = await fetch("/goals/new", { method: "POST", body });
        data = (await response.json()) as CreateGoalResult;
      } catch {
        return {
          status: "error",
          formError: "That Goal couldn’t be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.goalId);
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

  const titleField = form.field("title");
  const targetDateField = form.field("targetDate");
  const unitField = form.field("unit");
  const baselineField = form.field("baselineValue");
  const targetField = form.field("targetValue");
  const copy = measurementType ? FIELD_COPY[measurementType] : null;

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

  return (
    <Form
      aria-label="New goal"
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
        §5.1 — the Area leads, because it is the fact a Goal cannot exist
        without. It is validated on the client so an unanswered required field
        is caught before a round trip, and again on the server, which is the
        authority: `/goals/new` re-verifies that the id names an active Area in
        this workspace and fails closed with a field error if it does not.
      */}
      {choosingArea ? (
        <SelectField
          label="Area"
          required
          help="Every Goal lives in one Area of your life."
          value={chosenArea}
          error={areaError ?? undefined}
          options={areaOptions ?? []}
          placeholder="Choose an Area…"
          onChange={(value) => {
            setChosenArea(value);
            if (value.length > 0) setAreaError(null);
          }}
        />
      ) : null}
      <TextField label="Title" required maxLength={512} {...titleField} />
      <DateField
        label="Target date"
        help="When do you want to reach this?"
        showOptionalCue
        {...targetDateField}
      />

      {/*
        Step two. The heading is a question rather than a field label, because
        the answer changes what the form is — and because it is the sentence
        that teaches what a DalyHub Goal is for.
      */}
      <fieldset className="dh-measure-choices">
        <legend className="dh-measure-choices__legend">
          How will you measure this Goal?
        </legend>
        {GOAL_MEASUREMENT_TYPES.map((option) => (
          <label
            key={option}
            className="dh-measure-choice"
            data-selected={measurementType === option ? "true" : undefined}
          >
            <input
              type="radio"
              name="measurementType"
              value={option}
              checked={measurementType === option}
              onChange={() => setMeasurementType(option)}
              data-testid={`new-goal-measurement-${option}`}
            />
            <span className="dh-measure-choice__label">
              {GOAL_MEASUREMENT_TYPE_LABELS[option]}
            </span>
            <span className="dh-measure-choice__description">
              {GOAL_MEASUREMENT_TYPE_DESCRIPTIONS[option]}
            </span>
          </label>
        ))}
      </fieldset>

      {measurementType === "target_value" ||
      measurementType === "accumulation" ? (
        <>
          <TextField
            label="Measure in"
            help="kg, km, books, $ — whatever this Goal is counted in."
            placeholder="kg"
            maxLength={GOAL_MEASUREMENT_UNIT_MAX_LENGTH}
            showOptionalCue
            {...unitField}
          />
          <div
            className="dh-measure-units"
            role="group"
            aria-label="Common units"
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
          {/* The inference, stated back — the owner never picks a direction. */}
          {direction !== null && baselineNumber !== targetNumber ? (
            <p className="dh-measure-inference" role="status">
              {direction === "decrease"
                ? "Progress means this number going down."
                : "Progress means this number going up."}
            </p>
          ) : null}
        </>
      ) : null}

      {measurementType === "milestone" ? (
        <p className="dh-measure-inference">
          Add the stages on the Goal after creating it — progress comes from the
          ones you complete.
        </p>
      ) : null}

      {measurementType === "manual" ? (
        <p className="dh-measure-inference">
          You will set the percentage yourself. Anything that can be counted is
          worth counting instead.
        </p>
      ) : null}

      <FormActions>
        <FormButton
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={form.isSubmitting}
        >
          Cancel
        </FormButton>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Create Goal
        </FormButton>
      </FormActions>
    </Form>
  );
}
