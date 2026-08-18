/**
 * HABITS-01 — the ONE "New Habit" form.
 *
 * Hosted by the `/habits/new` page AND by the shared Quick Capture sheet — the
 * same component, the same `/habits/create` action, the same
 * `HabitRepository.create` authority, so there is no capture-only Habit form to
 * drift (AGENTS.md §9.8). The client never supplies workspace or actor data.
 *
 * ── It asks for the least that can work ─────────────────────────────────────
 * A name and a cadence. Everything else — the Goal it supports, the Area it
 * belongs to, a note — is optional and sits below them. The cadence's own second
 * field (which days? how many times?) is revealed by the choice above it, so the
 * form never shows a weekday picker to someone who chose "every day".
 *
 * ── The cadence vocabulary is closed, and small ─────────────────────────────
 * Three choices. There is no "monthly", no "every N days", no time of day and no
 * reminder, because HABITS-01 deliberately ships the smallest vocabulary that
 * answers "am I practising this consistently?" — see ADR-102.
 */

import { useMemo } from "react";
import type { RefObject } from "react";

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
  FormErrorSummary,
  SelectField,
  TextField,
  ToggleGroupField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { useCompactViewport } from "~/shared/viewport";

import type { CreateHabitResult } from "./routes/create";

/** One selectable parent for a Habit's optional relationships. */
export interface HabitLinkOption {
  readonly id: string;
  readonly title: string;
}

type Values = {
  readonly title: string;
  readonly scheduleKind: string;
  readonly weekdays: readonly string[];
  readonly timesPerWeek: string;
  readonly areaId: string;
  readonly goalId: string;
  readonly notes: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Habit",
  scheduleKind: "How often",
  weekdays: "Days",
  timesPerWeek: "Times a week",
  areaId: "Area",
  goalId: "Supports goal",
  notes: "Notes",
};

/**
 * The three cadences, worded as the owner would say them rather than as the
 * stored keys. "Some days of the week" rather than "weekdays" because "weekdays"
 * already means Monday-to-Friday to most people, and the option covers any set.
 */
export const HABIT_SCHEDULE_OPTIONS = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Certain days of the week" },
  { value: "weekly_count", label: "A number of times a week" },
];

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

export interface HabitFormProps {
  readonly onCreated: (habitId: string) => void;
  readonly onCancel?: () => void;
  /** The owner's week start, so the day toggles read in their own order. */
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly areas: readonly HabitLinkOption[];
  readonly goals: readonly HabitLinkOption[];
  /** `page` is `/habits/new`; `sheet` is the shared Quick Capture surface. */
  readonly surface?: "page" | "sheet";
  readonly firstFieldRef?: RefObject<HTMLElement | null>;
}

export function HabitForm({
  onCreated,
  onCancel,
  firstDayOfWeek,
  areas,
  goals,
  surface = "page",
  firstFieldRef,
}: HabitFormProps) {
  const compact = useCompactViewport();

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
      title: "",
      scheduleKind: "daily",
      weekdays: [],
      timesPerWeek: "3",
      areaId: "",
      goalId: "",
      notes: "",
    }),
    [],
  );

  const form = useForm<Values>({
    initialValues,
    fields: {
      title: { validate: required("A name is required") },
      scheduleKind: { validate: required("Choose how often") },
    },
    fieldOrder: [
      "title",
      "scheduleKind",
      "weekdays",
      "timesPerWeek",
      "areaId",
      "goalId",
      "notes",
    ],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      /*
       * The one CONDITIONAL rule, checked here rather than as a field validator.
       *
       * A DS-06 validator sees only its own value, and "at least one day" is only
       * a rule when the cadence above it says weekdays. Checking it at submit
       * keeps the rule in one place on the client and leaves the SERVER as the
       * authority either way — the kernel refuses an empty weekday list, so a
       * form that skipped this would be rejected rather than accepted.
       */
      if (values.scheduleKind === "weekdays" && values.weekdays.length === 0) {
        return {
          status: "error",
          fieldErrors: { weekdays: "Choose at least one day" },
        };
      }
      const body = new FormData();
      body.set("title", values.title);
      body.set("scheduleKind", values.scheduleKind);
      if (values.scheduleKind === "weekdays") {
        body.set("weekdays", values.weekdays.join(","));
      }
      if (values.scheduleKind === "weekly_count") {
        body.set("timesPerWeek", values.timesPerWeek);
      }
      if (values.areaId !== "") body.set("areaId", values.areaId);
      if (values.goalId !== "") body.set("goalId", values.goalId);
      if (values.notes.trim() !== "") body.set("notes", values.notes);

      let data: CreateHabitResult;
      try {
        const response = await fetch("/habits/create", {
          method: "POST",
          body,
        });
        data = (await response.json()) as CreateHabitResult;
      } catch {
        return {
          status: "error",
          formError: "That habit couldn’t be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.habitId);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.formError,
        fieldErrors: mapFieldErrors(data.fieldErrors),
      };
    },
  });

  const titleField = form.field("title");
  const kind = form.values.scheduleKind;

  return (
    <Form
      aria-label="New habit"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
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
        label="Habit"
        required
        maxLength={512}
        placeholder="What do you want to practise?"
        {...titleField}
        controlRef={(node) => {
          if (firstFieldRef) {
            firstFieldRef.current = node instanceof HTMLElement ? node : null;
          }
          titleField.controlRef?.(node);
        }}
      />

      <SelectField
        label="How often"
        required
        options={HABIT_SCHEDULE_OPTIONS}
        sheetOnCompact
        sheetTitle="How often?"
        {...form.field("scheduleKind")}
      />

      {/*
        Progressive disclosure, and the reason for it: a weekday picker shown to
        someone who chose "every day" is a control that cannot mean anything, and
        a "times a week" box shown beside chosen weekdays is two answers to one
        question. Only the field the chosen cadence actually needs is rendered.
      */}
      {kind === "weekdays" ? (
        <ToggleGroupField
          label="Days"
          required
          showOptionalCue={false}
          options={weekdayOptions}
          help="Pick the days you want to practise on."
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
          help="Any days you like — the week is what counts."
          {...form.field("timesPerWeek")}
        />
      ) : null}

      <SelectField
        label="Area"
        placeholder="No area"
        options={[{ value: "", label: "No area" }, ...toOptions(areas)]}
        sheetOnCompact
        sheetTitle="Which part of life?"
        emptyMessage="No areas yet."
        {...form.field("areaId")}
      />

      <SelectField
        label="Supports goal"
        placeholder="No goal"
        options={[{ value: "", label: "No goal" }, ...toOptions(goals)]}
        sheetOnCompact
        sheetTitle="Which goal does this support?"
        emptyMessage="No goals yet."
        help="A habit is evidence of the behaviour behind a goal. It never changes the goal’s own progress."
        {...form.field("goalId")}
      />

      <TextField
        label="Notes"
        maxLength={2000}
        placeholder="What does doing this well look like?"
        {...form.field("notes")}
      />

      {surface === "sheet" ? (
        <div className="dh-capture-actions">
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Create habit
          </FormButton>
        </div>
      ) : (
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
            Create habit
          </FormButton>
        </FormActions>
      )}
    </Form>
  );
}

function toOptions(
  items: readonly HabitLinkOption[],
): readonly { readonly value: string; readonly label: string }[] {
  return items.map((item) => ({ value: item.id, label: item.title }));
}

/**
 * Route a kernel field name onto the form's own field name.
 *
 * The kernel validates `weekdays`/`timesPerWeek`/`schedule`; the form's cadence
 * lives across three controls. Mapping here keeps the server's vocabulary from
 * leaking into the form and keeps the error next to the control that produced it.
 */
function mapFieldErrors(
  errors: Readonly<Record<string, string>> | undefined,
): Partial<Record<keyof Values & string, string>> | undefined {
  if (errors === undefined) return undefined;
  const mapped: Record<string, string> = {};
  for (const [field, message] of Object.entries(errors)) {
    if (field === "schedule") mapped.scheduleKind = message;
    else if (field === "areaId") mapped.areaId = message;
    else if (field === "goalId") mapped.goalId = message;
    else mapped[field] = message;
  }
  return mapped as Partial<Record<keyof Values & string, string>>;
}
