/**
 * AREA-02 — the "Goal details" form: target date + definition of done.
 *
 * Both fields are Goal-owned (never spine) and edited together via one
 * explicit-save DS-06 form, hosted in the shared Drawer (mirrors
 * `~/modules/areas/RenameAreaForm.tsx`'s posting pattern). Posts to the Goal
 * mutation resource with intent `update_details`; the server validates and
 * normalises authoritatively (client-side validation here is a fast, friendly
 * echo of the same rules, never the source of truth).
 */

import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  maxLength,
  useForm,
  validateDateOnly,
  type SubmitOutcome,
} from "~/shared/forms";
import { GOAL_DEFINITION_OF_DONE_MAX_LENGTH } from "~/kernel/goals";

import type { GoalMutationResult } from "./routes/mutate";

type Values = {
  readonly targetDate: string;
  readonly definitionOfDone: string;
};

const FIELD_LABELS: Record<string, string> = {
  targetDate: "Target date",
  definitionOfDone: "Definition of done",
};

interface GoalDetailsFormProps {
  readonly goalId: string;
  readonly currentTargetDate: string | null;
  readonly currentDefinitionOfDone: string | null;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function GoalDetailsForm({
  goalId,
  currentTargetDate,
  currentDefinitionOfDone,
  onDone,
  onCancel,
}: GoalDetailsFormProps) {
  const form = useForm<Values>({
    initialValues: {
      targetDate: currentTargetDate ?? "",
      definitionOfDone: currentDefinitionOfDone ?? "",
    },
    fields: {
      targetDate: { validate: (value) => validateDateOnly(value) },
      definitionOfDone: {
        validate: maxLength(
          GOAL_DEFINITION_OF_DONE_MAX_LENGTH,
          `Keep it under ${GOAL_DEFINITION_OF_DONE_MAX_LENGTH} characters.`,
        ),
      },
    },
    fieldOrder: ["targetDate", "definitionOfDone"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "update_details");
      body.set("targetDate", values.targetDate);
      body.set("definitionOfDone", values.definitionOfDone);
      let data: GoalMutationResult;
      try {
        const response = await fetch(
          `/goals/${encodeURIComponent(goalId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as GoalMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn't be saved. Please try again.",
        };
      }
      if (data.kind === "update_details" && data.ok) {
        onDone();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "update_details" ? data.formError : undefined,
        fieldErrors:
          data.kind === "update_details"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Goal details"
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
      <DateField
        label="Target date"
        help="When you're aiming to reach this Goal. Optional — never used to mark it done automatically."
        {...form.field("targetDate")}
      />
      <TextField
        label="Definition of done"
        multiline
        rows={5}
        maxLength={GOAL_DEFINITION_OF_DONE_MAX_LENGTH}
        showLength
        help="What does 'done' look like for this Goal? Plain text — line breaks are preserved."
        {...form.field("definitionOfDone")}
      />
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
          Save
        </FormButton>
      </FormActions>
    </Form>
  );
}
