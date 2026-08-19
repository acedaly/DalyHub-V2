/**
 * PROJECT-02 — "Create from template".
 *
 * The whole flow, and deliberately no more than this:
 *
 *     Create from template
 *     ────────────────────
 *     Monthly reporting
 *     12 tasks · 3 checklist items
 *     Project name  [ August reporting ]
 *     Area or Goal  [ Work            ]
 *     [ Create project ]
 *
 * Two fields, because two things genuinely differ between one use of a template
 * and the next: what this instance is called, and where it lives. Everything
 * else the template already decided, and asking the owner to re-approve twelve
 * copied task titles would make starting from a template slower than starting
 * from a blank page — which would defeat the feature.
 *
 * The counts are stated BEFORE the button, so the owner knows what is about to
 * be created rather than discovering it afterwards.
 *
 * Built from the DS-06 shared controls (`useForm`, `TextField`, `SelectField`)
 * with explicit Create/Cancel, duplicate-submit prevention and
 * server-authoritative errors — the same form grammar `NewProjectForm` uses.
 */

import {
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
import { templateContentsLabel } from "~/kernel/project-templates";

import type { TemplateMutationResult } from "./routes/template-mutate";
import type { SerializedTemplateSummary } from "./template-view";
import { useParentOptionsSearch } from "./use-parent-options-search";

type Values = { readonly title: string; readonly parentId: string };

const FIELD_LABELS: Record<string, string> = {
  title: "Project name",
  parentId: "Area or Goal",
};

export interface CreateFromTemplateFormProps {
  readonly template: SerializedTemplateSummary;
  /** The seed Area/Goal parent options (value = entity id; description = kind). */
  readonly parentOptions: readonly SelectOption[];
  readonly onCreated: (projectId: string) => void;
  readonly onCancel: () => void;
}

export function CreateFromTemplateForm({
  template,
  parentOptions,
  onCreated,
  onCancel,
}: CreateFromTemplateFormProps) {
  const parentSearch = useParentOptionsSearch(parentOptions);

  const form = useForm<Values>({
    initialValues: {
      // The template's name is the honest default: "Monthly reporting" is a
      // perfectly good Project name, and pre-filling it means the common case
      // is one tab and one Enter rather than a blank required field.
      title: template.name,
      // The template's default Area/Goal, when it still resolves. The
      // repository returns `null` for a default that no longer names an active
      // record, so this is never a stale id the owner has to notice and clear.
      parentId: template.parentId ?? "",
    },
    fields: {
      title: { validate: required("A project name is required") },
      parentId: { validate: required("Choose an Area or a Goal") },
    },
    fieldOrder: ["title", "parentId"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "instantiate");
      body.set("title", values.title);
      body.set("parentId", values.parentId);
      let data: TemplateMutationResult;
      try {
        const response = await fetch(
          `/projects/templates/${encodeURIComponent(template.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as TemplateMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That project couldn’t be created. Please try again.",
        };
      }
      if (data.ok && data.projectId) {
        onCreated(data.projectId);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.ok
          ? "That project couldn’t be created. Please try again."
          : data.formError,
        fieldErrors: (data.ok ? undefined : data.fieldErrors) as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  const titleField = form.field("title");
  const parentField = form.field("parentId");

  return (
    <Form
      aria-label="Create from template"
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
       * What will be created, in words, before the button that creates it.
       *
       * It lives HERE rather than in the drawer's subtitle because the subtitle
       * is not drawn on a phone — and the counts are exactly the fact an owner
       * needs before pressing a button that writes a dozen rows. One line, two
       * facts: how much, and in what state.
       *
       * `role="status"` rather than a heading: it is a statement of fact about
       * the pending action, and a screen-reader user reaching the button should
       * already have heard it.
       */}
      <p className="dh-template-preview" role="status">
        <span>
          {templateContentsLabel(template.taskCount, template.checklistCount)}
          {" will be created — all open, undated and unticked."}
        </span>
      </p>
      <TextField
        label="Project name"
        required
        maxLength={512}
        {...titleField}
      />
      <SelectField
        label="Area or Goal"
        help="A project belongs to an Area, or advances a Goal."
        placeholder="Search Areas and Goals"
        required
        options={parentSearch.withSelected(parentField.value)}
        onSearch={parentSearch.onSearch}
        loading={parentSearch.loading}
        emptyMessage="No matching Areas or Goals"
        {...parentField}
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
          Create project
        </FormButton>
      </FormActions>
    </Form>
  );
}
