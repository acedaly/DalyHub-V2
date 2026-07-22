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

import { useCallback, useRef, useState } from "react";

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

type Values = { readonly title: string; readonly parentId: string };

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  parentId: "Area or Goal",
};

interface NewProjectFormProps {
  /** The seed Area/Goal parent options (value = entity id; description = kind). */
  readonly parentOptions: readonly SelectOption[];
  /** Called with the new project's id after a successful create. */
  readonly onCreated: (projectId: string) => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
}

/**
 * The server-backed Area/Goal search: query the bounded parent-options endpoint,
 * aborting any in-flight request so a slower earlier response can't overwrite a
 * newer one. The seed options remain the shown set until (and unless) a search
 * returns a real options array, so an unrelated/failed response never empties the
 * control, and any previously-known option (including the current selection) is
 * retained so its label always resolves.
 */
function useParentSearch(seed: readonly SelectOption[]) {
  const [options, setOptions] = useState<readonly SelectOption[]>(seed);
  const [loading, setLoading] = useState(false);
  const known = useRef<Map<string, SelectOption>>(
    new Map(seed.map((option) => [option.value, option])),
  );
  const abort = useRef<AbortController | null>(null);

  const onSearch = useCallback((query: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    void (async () => {
      try {
        const url = new URL("/projects/parent-options", window.location.origin);
        url.searchParams.set("q", query);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          setLoading(false);
          return;
        }
        const body = (await response.json()) as {
          readonly options?: readonly SelectOption[];
        };
        if (!Array.isArray(body.options)) {
          setLoading(false);
          return;
        }
        for (const option of body.options) {
          known.current.set(option.value, option);
        }
        setOptions(body.options);
        setLoading(false);
      } catch (error) {
        // An aborted request is expected when the user keeps typing — ignore it.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoading(false);
        }
      }
    })();
  }, []);

  /** Merge a value's known option into the shown set so its label always resolves. */
  const withSelected = useCallback(
    (value: string): readonly SelectOption[] => {
      if (value.length === 0 || options.some((o) => o.value === value)) {
        return options;
      }
      const selected = known.current.get(value);
      return selected ? [selected, ...options] : options;
    },
    [options],
  );

  return { options, loading, onSearch, withSelected };
}

export function NewProjectForm({
  parentOptions,
  onCreated,
  onCancel,
}: NewProjectFormProps) {
  const parentSearch = useParentSearch(parentOptions);
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
