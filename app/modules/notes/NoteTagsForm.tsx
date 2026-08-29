/**
 * NOTES-03 — the "Edit tags" form, hosted in the shared DS-03 Drawer.
 *
 * Composed from the shared DS-06 primitives only: the `TagsField` Assets and
 * People already use (type-and-Enter chips, keyboard-reachable removes, polite
 * announcements) and the standard `useForm` submit contract. There is no
 * Notes-only tag widget and no second normalisation rule — the whole
 * trim/case-fold/de-duplicate/sort/bound policy lives once in the kernel
 * (`parseNoteTagInput`), server-side, and the server stays the authority.
 *
 * A single-purpose DS-06 Drawer form: tags are a multi-value control with its
 * own parsing and normalisation rules, which is why they stay a form while the
 * title moved onto the heading (EDIT-02 §9 — inline editing is for values a
 * single control can express).
 */

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TagsField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { MAX_NOTE_TAGS, MAX_NOTE_TAG_LENGTH } from "~/kernel/notes";
import { useTagVocabulary } from "~/shared/tags";

import type { NoteMutationResult } from "./routes/mutate";

type Values = { readonly tags: readonly string[] };

const FIELD_LABELS: Record<string, string> = { tags: "Tags" };

export interface NoteTagsFormProps {
  readonly noteId: string;
  readonly currentTags: readonly string[];
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function NoteTagsForm({
  noteId,
  currentTags,
  onDone,
  onCancel,
}: NoteTagsFormProps) {
  // The ONE workspace tag vocabulary, so tagging a Note is the same
  // interaction as tagging a Person, an Asset or a Task.
  const vocabulary = useTagVocabulary();

  const form = useForm<Values>({
    initialValues: { tags: currentTags },
    fields: { tags: {} },
    fieldOrder: ["tags"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "set_tags");
      body.set("tags", JSON.stringify(values.tags));
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
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.kind === "set_tags" && data.ok) {
        onDone();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "set_tags" ? data.formError : undefined,
        fieldErrors:
          data.kind === "set_tags"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Edit note tags"
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
      <TagsField
        label="Tags"
        // V2.6 FIND-02 — a tag is one workspace-wide word, so the help text no
        // longer promises that Notes lower-case it. `Reading` and `reading` are
        // one tag everywhere in the product, and the spelling the owner typed
        // first is the one they see.
        help="A tag means the same thing everywhere in DalyHub."
        vocabulary={vocabulary}
        constraints={{
          maxTags: MAX_NOTE_TAGS,
          maxTagLength: MAX_NOTE_TAG_LENGTH,
        }}
        {...form.field("tags")}
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
          Save tags
        </FormButton>
      </FormActions>
    </Form>
  );
}
