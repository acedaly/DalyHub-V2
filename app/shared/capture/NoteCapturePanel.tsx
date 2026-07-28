/**
 * MOBILE-01 — Quick Capture: Note.
 *
 * A Note's real surface is its editor, so capture's job is narrow: give the note
 * an identity and hand the user to the canonical NOTES-05 writing surface with
 * their first words already in it. It deliberately does NOT build a second
 * simplified note store or a capture-only body field that would need reconciling
 * with the real editor's autosave.
 *
 * Flow:
 *   1. title (required — the Note's identity) and an optional opening line;
 *   2. `POST /notes/new` creates the Note the instant the identity is valid — the
 *      SAME NOTES-01B route the module's own create form posts to;
 *   3. any opening text is written through the Note's OWN canonical content
 *      mutation, so it lands in the same Markdown source and the same Activity as
 *      text typed in the editor;
 *   4. the user continues in `/notes/:id` — the canonical editor, not a copy.
 *
 * Because step 3 uses the note's real mutation, a failure there leaves a created,
 * empty Note (not a lost one) and says so, rather than silently discarding words.
 */

import { useState } from "react";
import { useNavigate } from "react-router";

import {
  Form,
  FormButton,
  FormErrorSummary,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import type { CapturePanelProps } from "./types";

type Values = {
  readonly title: string;
  readonly opening: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  opening: "Start writing",
};

type CreateNoteResponse =
  | { readonly ok: true; readonly noteId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

export function NoteCapturePanel({
  firstFieldRef,
  onClose,
}: CapturePanelProps) {
  const navigate = useNavigate();
  const [handingOff, setHandingOff] = useState(false);

  const form = useForm<Values>({
    initialValues: { title: "", opening: "" },
    fields: { title: { validate: required("A note needs a title") } },
    fieldOrder: ["title", "opening"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);

      let data: CreateNoteResponse;
      try {
        const response = await fetch("/notes/new", { method: "POST", body });
        data = (await response.json()) as CreateNoteResponse;
      } catch {
        return {
          status: "error",
          formError:
            "That note couldn’t be created. Your text is safe — try again.",
        };
      }
      if (!data.ok) {
        return {
          status: "error",
          formError: data.formError,
          fieldErrors: data.fieldErrors as
            Partial<Record<keyof Values & string, string>> | undefined,
        };
      }

      const noteId = data.noteId;
      const opening = values.opening.trim();
      if (opening.length > 0) {
        // The Note's OWN canonical content mutation — the same authority the
        // editor autosaves through, so there is no second Markdown write path.
        const contentBody = new FormData();
        contentBody.set("intent", "update_content");
        contentBody.set("content", opening);
        try {
          const response = await fetch(`/notes/${noteId}/mutate`, {
            method: "POST",
            body: contentBody,
          });
          const result = (await response.json()) as { readonly ok?: boolean };
          if (!response.ok || result.ok !== true) {
            throw new Error("Note content write failed");
          }
        } catch {
          // The Note exists; only the opening line failed. Say so honestly and
          // keep the text on screen rather than pretending it saved.
          return {
            status: "error",
            formError:
              "The note was created, but its opening line didn’t save. Open the note and paste it in.",
          };
        }
      }

      // Hand off to the canonical editor — that is where writing continues.
      setHandingOff(true);
      onClose();
      navigate(`/notes/${noteId}`);
      return { status: "success" };
    },
  });

  const titleField = form.field("title");

  return (
    <Form
      aria-label="Capture a note"
      busy={form.isSubmitting || handingOff}
      onSubmit={form.handleSubmit}
      className="dh-capture-form"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />

      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="What is this note about?"
        {...titleField}
        controlRef={(node) => {
          firstFieldRef.current = node instanceof HTMLElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      <TextField
        label="Start writing"
        multiline
        rows={5}
        help="Optional — you’ll keep writing in the note editor."
        placeholder="First thoughts…"
        {...form.field("opening")}
      />

      <div className="dh-capture-actions">
        <FormButton
          type="submit"
          variant="primary"
          pending={form.isSubmitting || handingOff}
        >
          Create and write
        </FormButton>
      </div>
    </Form>
  );
}
