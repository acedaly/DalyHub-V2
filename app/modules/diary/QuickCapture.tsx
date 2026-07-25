/**
 * DIARY-01 — the sub-ten-second quick-capture surface.
 *
 * Capture first, organise later: the common path is a type and a title, in one
 * place at the top of the Timeline — NO modal, NO navigation. Built entirely from
 * DS-06 shared controls (`useForm`, `SelectField`, `TextField`, `MarkdownField`)
 * with the owner-local `WhenField` for optional backdating. `useForm` gives
 * duplicate-submit prevention and draft retention on failure for free; the body
 * and "when" fields stay secondary behind a "More" disclosure so they never slow
 * the fast path. `Cmd/Ctrl+Enter` submits from any field. On success the entry is
 * captured through the reserved `DiaryRepository.create` (via `POST /diary/new`),
 * the parent revalidates the Timeline so the new entry appears in its correct
 * chronological position without a reload, and capture is announced to assistive
 * technology (DS-10 feedback).
 *
 * A successful capture REMOUNTS the inner form (via a bumped `key`), which is the
 * honest way to clear it: `useForm.reset()` restores the committed baseline (which
 * becomes the just-submitted values on success), so it cannot empty the draft.
 * The remount starts from empty initial values and returns focus to the title.
 */

import { useEffect, useRef, useState } from "react";

import { useFeedback } from "~/shared/feedback";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  MarkdownField,
  SelectField,
  TextField,
  required as requiredRule,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import { entryTypeOptions } from "./diary-view";
import { WhenField } from "./WhenField";
import type { CreateDiaryEntryResult } from "./routes/new";

type Values = {
  readonly entryType: string;
  readonly title: string;
  readonly body: string;
  readonly when: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  entryType: "Type",
  body: "Details",
  when: "When",
};

/** The default entry type — the neutral built-in kind, consistent with the
 * server default and DIARY-01A's backfill. */
const DEFAULT_ENTRY_TYPE = "note";

export interface QuickCaptureProps {
  /** Called after a successful capture (to revalidate the Timeline). */
  readonly onCaptured: () => void;
}

export function QuickCapture({ onCaptured }: QuickCaptureProps) {
  // Bumped after each successful capture to remount (and thus clear) the form.
  const [captureKey, setCaptureKey] = useState(0);
  return (
    <CaptureForm
      key={captureKey}
      autoFocusTitle={captureKey > 0}
      onCaptured={() => {
        onCaptured();
        setCaptureKey((key) => key + 1);
      }}
    />
  );
}

function CaptureForm({
  autoFocusTitle,
  onCaptured,
}: {
  readonly autoFocusTitle: boolean;
  readonly onCaptured: () => void;
}) {
  const feedback = useFeedback();
  const options = entryTypeOptions();
  const [showDetails, setShowDetails] = useState(false);

  const form = useForm<Values>({
    initialValues: {
      entryType: DEFAULT_ENTRY_TYPE,
      title: "",
      body: "",
      when: "",
    },
    fields: { title: { validate: requiredRule("A title is required") } },
    fieldOrder: ["title", "entryType", "when", "body"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("entryType", values.entryType);
      body.set("body", values.body);
      body.set("when", values.when);
      let data: CreateDiaryEntryResult;
      try {
        const response = await fetch("/diary/new", { method: "POST", body });
        data = (await response.json()) as CreateDiaryEntryResult;
      } catch {
        return {
          status: "error",
          formError: "That entry couldn't be captured. Please try again.",
        };
      }
      if (data.ok) {
        // Announce + revalidate + remount (mirrors the Notes forms acting inside
        // onSubmit on success); the remount clears the draft and refocuses.
        feedback.notifySuccess("Entry captured");
        onCaptured();
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

  const { focusField } = form;
  useEffect(() => {
    // Return focus to the title after a successful capture (the remount case).
    if (autoFocusTitle) focusField("title");
  }, [autoFocusTitle, focusField]);

  // Cmd+Enter on macOS, Ctrl+Enter elsewhere — a keyboard-only fast path. Bound
  // as a native listener on the wrapper (not a JSX handler on a static element)
  // so keydowns from any field bubble to it without needing a role.
  const wrapRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef(form.handleSubmit);
  submitRef.current = form.handleSubmit;
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitRef.current();
      }
    };
    element.addEventListener("keydown", handler);
    return () => element.removeEventListener("keydown", handler);
  }, []);

  const titleField = form.field("title");
  const typeField = form.field("entryType");
  const bodyField = form.field("body");
  const whenField = form.field("when");

  return (
    <div className="dh-diary-capture-wrap" ref={wrapRef}>
      <Form
        aria-label="Quick capture"
        busy={form.isSubmitting}
        onSubmit={form.handleSubmit}
        className="dh-diary-capture"
      >
        <FormErrorSummary
          formError={form.formError}
          fieldErrors={form.fieldErrors}
          order={form.fieldOrder as string[]}
          labels={FIELD_LABELS}
          onFocusField={form.focusField}
        />
        <div className="dh-diary-capture__row">
          <SelectField
            label="Type"
            options={options}
            className="dh-diary-capture__type"
            {...typeField}
          />
          <TextField
            label="Title"
            required
            maxLength={512}
            placeholder="What happened?"
            className="dh-diary-capture__title"
            {...titleField}
          />
        </div>
        <div className="dh-diary-capture__actions">
          <button
            type="button"
            className="dh-btn dh-btn--ghost dh-diary-capture__more"
            aria-expanded={showDetails}
            aria-controls="dh-diary-capture-details"
            onClick={() => setShowDetails((open) => !open)}
          >
            {showDetails ? "Fewer details" : "Add details"}
          </button>
          <FormActions>
            <FormButton
              type="submit"
              variant="primary"
              pending={form.isSubmitting}
            >
              Capture
            </FormButton>
          </FormActions>
        </div>
        <div
          id="dh-diary-capture-details"
          hidden={!showDetails}
          className="dh-diary-capture__details"
        >
          <WhenField
            binding={whenField}
            label="When"
            help="Leave blank to use now. Set a past date and time to record an earlier moment."
          />
          <MarkdownField
            label="Details"
            rows={4}
            placeholder="Optional notes, in Markdown."
            showOptionalCue={false}
            {...bodyField}
          />
        </div>
      </Form>
    </div>
  );
}
