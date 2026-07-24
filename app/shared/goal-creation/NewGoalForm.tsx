/**
 * AREA-02 — the shared "New goal" form.
 *
 * Lives in `app/shared` (not the Goals module) because it is composed from a
 * DIFFERENT module's record page — the Area record's Goals tab — and the
 * cross-module-import rule forbids `~/modules/areas` importing
 * `~/modules/goals` internals directly (`docs/development/MODULES.md`). This
 * mirrors the ADR-033 precedent that re-homed the shared task record surface
 * for exactly the same reason.
 *
 * Collects only a title, matching the established DalyHub creation precedent
 * (`NewAreaForm`, `NewProjectForm`, `NewTaskForm` are all title-only) — target
 * date and definition of done are edited immediately after, on the canonical
 * Goal record, which keeps creation a single atomic spine write with no
 * cross-table creation-atomicity risk (see the AREA-02 ADR). Posts to the
 * trusted `/goals/new` action, which verifies the given Area itself
 * server-side; the client never asserts the Area is valid.
 */

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

/** The JSON shape `POST /goals/new` returns — duplicated here (not imported)
 * because importing the Goals module's route types from `app/shared` would
 * itself be a module-boundary violation; the shapes are kept in sync by the
 * Goals module's own route + component tests. */
export type CreateGoalResult =
  | { readonly ok: true; readonly goalId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

type Values = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

interface NewGoalFormProps {
  readonly areaId: string;
  readonly onCreated: (goalId: string) => void;
  readonly onCancel: () => void;
}

export function NewGoalForm({ areaId, onCreated, onCancel }: NewGoalFormProps) {
  const form = useForm<Values>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("areaId", areaId);
      let data: CreateGoalResult;
      try {
        const response = await fetch("/goals/new", { method: "POST", body });
        data = (await response.json()) as CreateGoalResult;
      } catch {
        return {
          status: "error",
          formError: "That Goal couldn't be created. Please try again.",
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
      <TextField label="Title" required maxLength={512} {...titleField} />
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
