/**
 * PROJ-01 — the "New project" form (hosted in the shared DS-03 Drawer).
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

import type { CreateProjectResult } from "./routes/new";
import { useParentOptionsSearch } from "./use-parent-options-search";

type Values = { readonly title: string; readonly parentId: string };

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Area or Goal",
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
        doesn&rsquo;t have either yet, so there&rsquo;s nowhere for a new
        project to go.
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
      <p>Couldn&rsquo;t load Areas and Goals.</p>
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
}: NewProjectFormProps) {
  const parentSearch = useParentOptionsSearch(parentOptions);
  const form = useForm<Values>({
    initialValues: { title: "", parentId: "" },
    fields: {
      title: { validate: required("A title is required") },
      parentId: { validate: required("Choose an Area or a Goal") },
    },
    fieldOrder: ["title", "parentId"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("parentId", values.parentId);
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
          formError: "That project couldn't be created. Please try again.",
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
      aria-label="New project"
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
