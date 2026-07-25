/**
 * DIARY-01 — the route-backed entry editor (hosted in the shared DS-03 Drawer).
 *
 * Editing happens WITHOUT leaving the Timeline: the Drawer is opened from an
 * entry via the URL (`?drawer=edit:<id>`), so it is deep-linkable, Back/Forward
 * correct, and restores focus to the entry that opened it (the Drawer owns focus
 * trapping and restoration). The form loads the entry from the `GET /diary/:id`
 * resource route — so a deep link to an entry that isn't on the loaded Timeline
 * page still works — and fails closed to a calm "not found" for a missing,
 * deleted, wrong-type or cross-workspace id.
 *
 * Title and the detail slice are edited together but saved through their
 * respective repositories (`EntityRepository.update` + `DiaryRepository.update`);
 * the endpoint reports partial success honestly. Markdown source is preserved
 * exactly and previewed only through the one FND-08 sink (inside `MarkdownField`).
 * Unsaved/saving/saved/error states use the shared `SaveStatusIndicator`.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useFeedback } from "~/shared/feedback";
import type { AutosaveStatus } from "~/shared/forms";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  MarkdownField,
  SaveStatusIndicator,
  SelectField,
  TextField,
  required as requiredRule,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import { entryTypeOptions } from "./diary-view";
import { WhenField } from "./WhenField";
import type {
  DiaryEntryEditData,
  DiaryEntryEditResponse,
} from "./routes/entry";
import type { DiaryMutationResult } from "./routes/mutate";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  entryType: "Type",
  body: "Details",
  when: "When",
};

type Values = {
  readonly title: string;
  readonly entryType: string;
  readonly body: string;
  readonly when: string;
};

export interface DiaryEntryEditorProps {
  readonly entryId: string;
  /** Called after a successful save (to revalidate the Timeline + close). */
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

/**
 * Drawer host: loads the entry, then renders the edit form. Kept separate so the
 * form mounts with real initial values (so `useForm`'s dirty baseline is correct
 * from the first render).
 */
export function DiaryEntryEditor({
  entryId,
  onSaved,
  onCancel,
}: DiaryEntryEditorProps) {
  const fetcher = useFetcher<DiaryEntryEditResponse>();
  const requested = useRef(false);

  useEffect(() => {
    if (!requested.current) {
      requested.current = true;
      fetcher.load(`/diary/${encodeURIComponent(entryId)}`);
    }
  }, [entryId, fetcher]);

  if (fetcher.data) {
    return (
      <DiaryEditForm
        entry={fetcher.data.entry}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }

  const failed = fetcher.state === "idle" && requested.current && !fetcher.data;

  return (
    <div className="dh-diary-editor__loading" aria-live="polite">
      {failed ? (
        <p className="dh-diary-editor__error">
          That entry is no longer available.
        </p>
      ) : (
        <p className="dh-diary-editor__pending">Loading entry…</p>
      )}
    </div>
  );
}

function saveStatus(
  isSubmitting: boolean,
  submitStatus: string,
  isDirty: boolean,
): AutosaveStatus {
  if (isSubmitting) return "saving";
  if (submitStatus === "error") return "error";
  if (isDirty) return "unsaved";
  return "idle";
}

function DiaryEditForm({
  entry,
  onSaved,
  onCancel,
}: {
  readonly entry: DiaryEntryEditData;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}) {
  const feedback = useFeedback();
  const options = entryTypeOptions();
  const [partialNotice, setPartialNotice] = useState<string | null>(null);

  const form = useForm<Values>({
    initialValues: {
      title: entry.title,
      entryType: entry.entryType,
      body: entry.bodySource,
      when: entry.occurredLocal,
    },
    fields: { title: { validate: requiredRule("A title is required") } },
    fieldOrder: ["title", "entryType", "when", "body"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      setPartialNotice(null);
      const body = new FormData();
      body.set("title", values.title);
      body.set("entryType", values.entryType);
      body.set("body", values.body);
      body.set("when", values.when);
      let data: DiaryMutationResult;
      try {
        const response = await fetch(
          `/diary/${encodeURIComponent(entry.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as DiaryMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That entry couldn't be saved. Please try again.",
        };
      }
      if (data.ok) {
        feedback.notifySuccess("Entry updated");
        onSaved();
        return { status: "success" };
      }
      if (data.savedParts && data.savedParts.length > 0) {
        setPartialNotice(
          "Some changes were saved before an error. Reopen the entry to see the current state.",
        );
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
  const typeField = form.field("entryType");
  const bodyField = form.field("body");
  const whenField = form.field("when");

  return (
    <Form
      aria-label="Edit entry"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
      className="dh-diary-editor"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />
      <TextField label="Title" required maxLength={512} {...titleField} />
      <SelectField label="Type" options={options} {...typeField} />
      <WhenField binding={whenField} label="When" required />
      <MarkdownField
        label="Details"
        rows={8}
        placeholder="Optional notes, in Markdown."
        showOptionalCue={false}
        {...bodyField}
      />
      {partialNotice ? (
        <p className="dh-diary-editor__partial" role="status">
          {partialNotice}
        </p>
      ) : null}
      <div className="dh-diary-editor__footer">
        <SaveStatusIndicator
          status={saveStatus(
            form.isSubmitting,
            form.submit.status,
            form.isDirty,
          )}
          error={form.formError}
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
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
            disabled={!form.isDirty}
          >
            Save changes
          </FormButton>
        </FormActions>
      </div>
    </Form>
  );
}
