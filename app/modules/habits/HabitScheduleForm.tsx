/**
 * HABITS-01 — editing a Habit's cadence, on its record.
 *
 * A separate form from the rest of the record's Settings, because it is a
 * separate KIND of change and the surface has to say so: a cadence change opens
 * a new schedule version from today and leaves every earlier day with the
 * schedule it actually had. The form states that in words, above the control,
 * so the owner is never surprised to find last month's figures unchanged — that
 * is the feature, not a bug.
 *
 * It posts the `set_schedule` intent to `/habits/:id/mutate`, which is the ONE
 * authority for a versioned cadence change.
 */

import { useMemo } from "react";

import {
  HABIT_MAX_TIMES_PER_WEEK,
  habitWeekdayName,
  habitWeekdayOrder,
  habitWeekdayShortName,
} from "~/kernel/habits";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import {
  Form,
  FormActions,
  FormButton,
  SelectField,
  ToggleGroupField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import type { SerializedHabitRecord } from "~/shared/habits";

import { HABIT_SCHEDULE_OPTIONS } from "./HabitForm";
import type { HabitMutationResult } from "./routes/mutate";

type Values = {
  readonly scheduleKind: string;
  readonly weekdays: readonly string[];
  readonly timesPerWeek: string;
};

const TIMES_OPTIONS = Array.from(
  { length: HABIT_MAX_TIMES_PER_WEEK },
  (_, index) => ({
    value: String(index + 1),
    label:
      index === 0
        ? "Once a week"
        : index === 1
          ? "Twice a week"
          : `${index + 1} times a week`,
  }),
);

export interface HabitScheduleFormProps {
  readonly habit: SerializedHabitRecord;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly onSaved: () => void;
}

export function HabitScheduleForm({
  habit,
  firstDayOfWeek,
  onSaved,
}: HabitScheduleFormProps) {
  const weekdayOptions = useMemo(
    () =>
      habitWeekdayOrder(firstDayOfWeek).map((day) => ({
        value: String(day),
        label: habitWeekdayShortName(day),
        accessibleLabel: habitWeekdayName(day),
      })),
    [firstDayOfWeek],
  );

  const initialValues = useMemo<Values>(
    () => ({
      scheduleKind: habit.scheduleKind,
      weekdays: (habit.weekdays ?? []).map(String),
      timesPerWeek: String(habit.timesPerWeek ?? 3),
    }),
    [habit.scheduleKind, habit.weekdays, habit.timesPerWeek],
  );

  const form = useForm<Values>({
    initialValues,
    fieldOrder: ["scheduleKind", "weekdays", "timesPerWeek"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      if (values.scheduleKind === "weekdays" && values.weekdays.length === 0) {
        return {
          status: "error",
          fieldErrors: { weekdays: "Choose at least one day" },
        };
      }
      const body = new FormData();
      body.set("intent", "set_schedule");
      body.set("scheduleKind", values.scheduleKind);
      if (values.scheduleKind === "weekdays") {
        body.set("weekdays", values.weekdays.join(","));
      }
      if (values.scheduleKind === "weekly_count") {
        body.set("timesPerWeek", values.timesPerWeek);
      }
      let result: HabitMutationResult;
      try {
        const response = await fetch(
          `/habits/${encodeURIComponent(habit.id)}/mutate`,
          { method: "POST", body },
        );
        result = (await response.json()) as HabitMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (result.kind === "set_schedule" && result.ok) {
        onSaved();
        return { status: "success" };
      }
      return {
        status: "error",
        formError:
          (result.kind === "set_schedule" && !result.ok
            ? result.formError
            : undefined) ?? "That couldn’t be saved. Please try again.",
        fieldErrors:
          result.kind === "set_schedule" && !result.ok
            ? (result.fieldErrors as Partial<
                Record<keyof Values & string, string>
              >)
            : undefined,
      };
    },
  });

  const kind = form.values.scheduleKind;

  return (
    <Form
      aria-label="Habit schedule"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      <p className="dh-habit-schedule__note">
        A change applies <strong>from today</strong>. Every earlier day keeps
        the schedule it actually had, so nothing you have already done is
        recalculated.
      </p>
      <SelectField
        label="How often"
        required
        options={HABIT_SCHEDULE_OPTIONS}
        sheetOnCompact
        sheetTitle="How often?"
        {...form.field("scheduleKind")}
      />
      {kind === "weekdays" ? (
        <ToggleGroupField
          label="Days"
          required
          showOptionalCue={false}
          options={weekdayOptions}
          {...form.field("weekdays")}
        />
      ) : null}
      {kind === "weekly_count" ? (
        <SelectField
          label="Times a week"
          required
          options={TIMES_OPTIONS}
          sheetOnCompact
          sheetTitle="How many times a week?"
          {...form.field("timesPerWeek")}
        />
      ) : null}
      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save schedule
        </FormButton>
      </FormActions>
    </Form>
  );
}
