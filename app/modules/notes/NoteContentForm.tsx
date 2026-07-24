/**
 * NOTES-01B — the Note record's "Note" tab: the Markdown source editor.
 *
 * A dependable EXPLICIT-save source editor, not a premature block editor
 * (mirrors `~/modules/goals/GoalDetailsForm.tsx`'s explicit-save shape, but
 * lives inline in the record's tab content rather than a Drawer — long-form
 * Note editing is DESIGN_SYSTEM.md's flagged exception that warrants a
 * full-page record surface, so the content form is NOT hosted in a Drawer).
 * Uses the ONE DS-06 Markdown control (`MarkdownField`) — a plain textarea
 * that preserves the exact source, plus its own lazy-loaded safe-preview
 * disclosure through the shared FND-08 pipeline. No second parser, no second
 * unsafe-HTML sink (the one sanctioned raw-HTML render stays inside
 * `MarkdownContent`), no autosave engine: Save is explicit, and the Save
 * button is disabled whenever the content is unchanged so no-op saves are
 * never emitted from the UI (the server-side `NoteDetailsRepository.update`
 * is independently idempotent either way).
 *
 * `SaveStatusIndicator` presents six required signals with five states:
 * "idle" IS "unchanged" (its own documented semantics — nothing shown, matching
 * the saved baseline); "unsaved"/"saving"/"saved"/"error" cover the rest.
 * "saved" is a transient local flag cleared the moment the user edits again.
 * Validation failures surface as the MarkdownField's own field error;
 * unexpected/storage failures surface as the form-level error next to the
 * indicator's Retry — both are shown even though both map to `status="error"`.
 * The form never claims "saved" until the mutate route's response confirms
 * it, and a failed submission leaves the user's typed draft intact
 * (`useForm`'s documented guarantee).
 */

import { useEffect, useState } from "react";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  MarkdownField,
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useForm,
  type AutosaveStatus,
  type SubmitOutcome,
} from "~/shared/forms";

import type { NoteMutationResult } from "./routes/mutate";

type Values = { readonly content: string };

const FIELD_LABELS: Record<string, string> = { content: "Note" };

const CONTENT_HELP = `Markdown source — supports headings, lists, links, tables and more. Up to ${MARKDOWN_SOURCE_MAX_BYTES.toLocaleString()} bytes.`;

export interface NoteContentFormProps {
  readonly noteId: string;
  readonly initialContent: string;
  /** Called after a successful content save, so the record can revalidate
   * (the Activity tab's `reloadKey` depends on the fresh `contentUpdatedAt`). */
  readonly onSaved: () => void;
}

export function NoteContentForm({
  noteId,
  initialContent,
  onSaved,
}: NoteContentFormProps) {
  const [justSaved, setJustSaved] = useState(false);

  const form = useForm<Values>({
    initialValues: { content: initialContent },
    fieldOrder: ["content"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "update_content");
      body.set("content", values.content);
      let data: NoteMutationResult;
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as NoteMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn't be saved. Please try again.",
        };
      }
      if (data.kind === "update_content" && data.ok) {
        setJustSaved(true);
        onSaved();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "update_content" ? data.formError : undefined,
        fieldErrors:
          data.kind === "update_content"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  const contentField = form.field("content");

  // Any further edit past the last successful save clears the transient
  // "saved" indicator — it must never linger and imply an UNSAVED edit is
  // safe.
  useEffect(() => {
    setJustSaved(false);
  }, [form.values.content]);

  const status: AutosaveStatus = form.isSubmitting
    ? "saving"
    : form.submit.status === "error"
      ? "error"
      : form.isDirty
        ? "unsaved"
        : justSaved
          ? "saved"
          : "idle";

  return (
    <>
      <UnsavedChangesGuard when={form.isDirty && !form.isSubmitting} />
      <Form
        aria-label="Note content"
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
        <MarkdownField
          label="Note"
          rows={16}
          help={CONTENT_HELP}
          showOptionalCue={false}
          {...contentField}
        />
        <FormActions>
          <SaveStatusIndicator
            status={status}
            error={form.submit.status === "error" ? form.formError : null}
            onRetry={() => form.handleSubmit()}
          />
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
            disabled={!form.isDirty}
          >
            Save
          </FormButton>
        </FormActions>
      </Form>
    </>
  );
}
