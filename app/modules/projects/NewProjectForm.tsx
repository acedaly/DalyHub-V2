/**
 * PROJ-01 — the "New Project" form (hosted in the shared DS-03 Drawer).
 *
 * Built entirely from DS-06 shared controls (`useForm`, `TextField`, `SelectField`)
 * with explicit Save/Cancel, required-field validation, duplicate-submit prevention
 * (via `useForm`) and server-authoritative errors. It posts to the trusted
 * `/projects/new` action; the server resolves the parent's KIND from its id, so the
 * client only chooses an Area/Goal — it can't assert a project's kind or ownership.
 * On success the parent closes the Drawer and navigates to the new project.
 *
 * The eligible parents (every active Area and Goal) can exceed any static list, so
 * the "Area or Goal" picker is SERVER-BACKED and searchable: `SelectField.onSearch`
 * queries the bounded `/projects/parent-options?q=` endpoint (workspace-scoped,
 * parameterised, kinds resolved server-side), so a workspace with more Areas/Goals
 * than a first page can still reach and select any of them. The loader's first page
 * seeds the control so it is populated before the user types, and in-flight searches
 * are aborted so a slow response can't clobber a newer one.
 */

import { useState } from "react";

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

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import { EntityIdentityPicker } from "~/shared/entity";

import { templateContentsLabel } from "~/kernel/project-templates";

import type { TemplateOption } from "./template-view";
import type { CreateProjectResult } from "./routes/new";
import { useParentOptionsSearch } from "./use-parent-options-search";

type Values = {
  readonly title: string;
  readonly parentId: string;
  /**
   * PROJECT-02 — the template to start from, or `""` for a blank project.
   *
   * Part of `useForm` rather than local state so the whole form has ONE source
   * of truth and the submit path reads a value it can see, not a closure it has
   * to keep in step.
   */
  readonly templateId: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Area or Goal",
  iconKey: "Icon",
  templateId: "Start from",
};

/** The always-present first option: a blank project, exactly as before. */
const BLANK_TEMPLATE_OPTION: SelectOption = {
  value: "",
  label: "Blank project",
  description: "Start with nothing",
};

interface NewProjectFormProps {
  /** The seed Area/Goal parent options (value = entity id; description = kind). */
  readonly parentOptions: readonly SelectOption[];
  /**
   * True when the workspace's Area/Goal options could not be loaded (a
   * storage/query failure) — distinct from a genuinely empty workspace. An
   * empty `parentOptions` array alone is never enough to claim "no Areas or
   * Goals exist"; that claim requires the load to have actually succeeded.
   */
  readonly parentOptionsFailed?: boolean;
  /** Called with the new project's id after a successful create. */
  readonly onCreated: (projectId: string) => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
  /** Retry loading the Area/Goal options after a failure. */
  readonly onRetryParentOptions?: () => void;
  /**
   * PROJECT-02 — the workspace's templates, or an empty list.
   *
   * When it is empty NOTHING is rendered for it: no field, no help text, no
   * hint that templates exist. Blank creation stays the two-field form it has
   * always been, which is the promise this feature makes about not making
   * project creation harder.
   */
  readonly templates?: readonly TemplateOption[];
}

/**
 * Project creation discoverability (PROJ-05 §8): a Project must belong to an
 * Area or advance a Goal (AGENTS.md §4 — parentage stays required; making it
 * optional would need its own ADR). When the AUTHENTICATED parent query has
 * actually succeeded and found neither, showing an empty, silently-unusable
 * picker is a dead end (AGENTS.md §6). AREA-01 provides real Area creation, so
 * this state points to that route; it never auto-creates an Area and never makes
 * the field optional.
 */
function NoEligibleParents({ onCancel }: { readonly onCancel: () => void }) {
  return (
    <div className="dh-project-empty-parents" role="status">
      <p>
        A project belongs to an Area, or advances a Goal — and this workspace
        doesn’t have either yet, so there’s nowhere for a new project to go.
      </p>
      <FormActions>
        <FormButton type="button" variant="secondary" onClick={onCancel}>
          Close
        </FormButton>
        <a className="dh-btn dh-btn--primary" href="/areas?drawer=new-area">
          Create an Area
        </a>
      </FormActions>
    </div>
  );
}

/**
 * The Area/Goal options failed to load (a storage/query failure, not a
 * confirmed-empty workspace). Calm, retryable, and never disclosing the
 * underlying cause.
 */
function ParentOptionsUnavailable({
  onCancel,
  onRetry,
}: {
  readonly onCancel: () => void;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="dh-project-empty-parents" role="status">
      <p>Couldn’t load Areas and Goals.</p>
      <p>Please try again.</p>
      <FormActions>
        <FormButton type="button" variant="secondary" onClick={onCancel}>
          Close
        </FormButton>
        {onRetry ? (
          <FormButton type="button" variant="primary" onClick={onRetry}>
            Try again
          </FormButton>
        ) : null}
      </FormActions>
    </div>
  );
}

export function NewProjectForm({
  parentOptions,
  parentOptionsFailed = false,
  onCreated,
  onCancel,
  onRetryParentOptions,
  templates = [],
}: NewProjectFormProps) {
  const parentSearch = useParentOptionsSearch(parentOptions);
  // Held outside `useForm` for the same reason as the Area form: the picker's
  // value is a key chosen through a modal, not a typed field.
  const [iconKey, setIconKey] = useState<EntityIconKey | null>(null);
  const [colourSlot, setColourSlot] = useState<IdentityColourSlot | null>(null);

  const form = useForm<Values>({
    initialValues: { title: "", parentId: "", templateId: "" },
    fields: {
      title: { validate: required("A title is required") },
      parentId: { validate: required("Choose an Area or a Goal") },
    },
    fieldOrder: ["templateId", "title", "parentId"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("parentId", values.parentId);
      /*
       * PROJECT-02 — always sent, empty for a blank project. The SERVER decides
       * what a non-empty value means: it resolves the template in the
       * authenticated workspace and instantiates it atomically, so the client
       * cannot name a template it may not see and cannot assemble a project out
       * of parts.
       */
      body.set("templateId", values.templateId);
      // Always sent, empty when unchosen — see the Area form.
      body.set("iconKey", iconKey ?? "");
      // The COLOUR travels the same way and for the same reason. Omitting it
      // was a silent data loss: the picker staged the choice, the form reported
      // success, and the record was created on its derived colour.
      body.set("colourSlot", colourSlot ?? "");
      let data: CreateProjectResult;
      try {
        const response = await fetch("/projects/new", {
          method: "POST",
          body,
        });
        data = (await response.json()) as CreateProjectResult;
      } catch {
        return {
          status: "error",
          formError: "That project couldn’t be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.projectId);
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
  const parentField = form.field("parentId");
  const templateField = form.field("templateId");
  const chosenTemplate =
    templates.find((template) => template.id === templateField.value) ?? null;

  // A load failure is NOT proof the workspace has no Areas or Goals — model it
  // separately from a confirmed-empty result so a storage/query failure never
  // shows the false "this workspace doesn't have either yet" domain message.
  if (parentOptionsFailed) {
    return (
      <ParentOptionsUnavailable
        onCancel={onCancel}
        onRetry={onRetryParentOptions}
      />
    );
  }

  // No eligible Area/Goal exists at all (the seed page is the true, unfiltered
  // count up to its bound, and the query genuinely succeeded) — show the honest
  // explanation instead of a silently empty, unusable picker. `parentOptions` is
  // never re-checked after a search: it always reflects "does at least one
  // eligible parent exist", independent of whatever the user has typed.
  if (parentOptions.length === 0) {
    return <NoEligibleParents onCancel={onCancel} />;
  }

  return (
    <Form
      aria-label="New Project"
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
       * PROJECT-02 — "Start from", above the title because it changes what the
       * other fields mean, and rendered ONLY when the workspace has templates.
       * Choosing one prefills the title and the Area/Goal from the template's
       * own defaults; both stay fully editable, because naming this instance is
       * the reason the field is here at all.
       */}
      {templates.length > 0 ? (
        <SelectField
          label="Start from"
          options={[
            BLANK_TEMPLATE_OPTION,
            ...templates.map((template) => ({
              value: template.id,
              label: template.name,
              description: templateContentsLabel(
                template.taskCount,
                template.checklistCount,
              ),
            })),
          ]}
          {...templateField}
          onChange={(next) => {
            templateField.onChange(next);
            const template = templates.find((entry) => entry.id === next);
            if (!template) return;
            // Only ever FILLS a field the owner has not written in. Overwriting
            // a title they already typed would be the form taking a decision
            // back off them.
            if (titleField.value.trim().length === 0) {
              form.setValue("title", template.name);
            }
            if (parentField.value.length === 0 && template.parentId !== null) {
              form.setValue("parentId", template.parentId);
            }
          }}
        />
      ) : null}
      <TextField label="Title" required maxLength={512} {...titleField} />
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
      {chosenTemplate ? (
        <p className="dh-template-preview" role="status">
          <span>
            {templateContentsLabel(
              chosenTemplate.taskCount,
              chosenTemplate.checklistCount,
            )}
            {
              " will be created. Nothing is scheduled — every task starts open and undated."
            }
          </span>
        </p>
      ) : null}
      {/* With the identity fields, not after them. */}
      <EntityIdentityPicker
        entityType="project"
        value={{ iconKey, colourSlot }}
        onChange={(next) => {
          setIconKey(next.iconKey);
          setColourSlot(next.colourSlot);
        }}
        help="Optional. A new Project takes the next colour in the ramp unless you choose one."
        error={form.fieldErrors.iconKey ?? null}
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
