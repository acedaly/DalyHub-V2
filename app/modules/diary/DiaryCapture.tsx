/**
 * DIARY-01 / DIARY-01B — the compact quick-capture flow (hosted in the Inspector).
 *
 * Capture first, organise later: launched from the "New entry" button, the `c`
 * keyboard shortcut, or the mobile floating action — NOT a permanently-open panel
 * dominating the page. The chooser presents the real supported entry types with
 * icons and labels; the fast path stays under ten seconds: a sensible default type
 * is retained, you type a title, you submit. Body and backdated "when" are optional
 * behind a disclosure so they never slow the fast path. `Cmd/Ctrl+Enter` submits
 * from any field.
 *
 * Built entirely from DS-06 shared controls (`useForm`, `TextField`) over the
 * shared writing surface (`MarkdownEditorField`)
 * plus the owner-local `WhenField`. `useForm` gives duplicate-submit prevention and
 * draft retention on failure for free. On success the entry is captured through the
 * reserved `DiaryRepository.create` (via `POST /diary/new`); the parent revalidates
 * the timeline and reports where the entry landed (honestly handling a backdated
 * entry that belongs to another day).
 */

import { useEffect, useRef, useState } from "react";

import {
  CaptureContextChip,
  encodeCaptureContext,
  useUrlCaptureContext,
} from "~/shared/capture";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  required as requiredRule,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { MarkdownEditorField } from "~/shared/markdown-editor";

import { entryTypeIcon } from "./diary-icons";
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

/** The default entry type — the neutral built-in kind, consistent with the server. */
const DEFAULT_ENTRY_TYPE = "note";

export interface DiaryCaptureProps {
  readonly todayKey: string;
  /**
   * Called after a successful capture with the new entry's id and the LOCAL day it
   * belongs to, so the workspace can revalidate and — for a backdated entry landing
   * on another day — offer to view that day rather than silently misplacing it.
   *
   * MOBILE-01 adds `keepOpen`: true when the user chose "Save and add another", so
   * the workspace revalidates the day WITHOUT closing the panel. Diary capture is
   * bursty — several entries in one sitting — and closing after each one made the
   * second entry cost a whole re-open.
   */
  readonly onCaptured: (
    entryId: string,
    capturedDayKey: string,
    keepOpen: boolean,
  ) => void;
}

export function DiaryCapture({ todayKey, onCaptured }: DiaryCaptureProps) {
  const options = entryTypeOptions();
  const [showDetails, setShowDetails] = useState(false);
  /*
   * DEBT-45 / DIARY-02 — an entry captured FROM a record (a Person, a Project, a
   * Meeting) carries that record here in the URL, so "Coffee with Vaughn" started
   * from Vaughn's record becomes a real relationship to Vaughn rather than a
   * name in a title. It stays OPTIONAL in every sense the DIARY-01A principle
   * requires: no context means no field, no prompt, and no change to the fast
   * path — a type, a title and Capture.
   */
  const capture = useUrlCaptureContext("diary");
  // Which button submitted. A ref (not state) because it must be readable inside
  // the submit handler in the SAME tick the click starts, before any re-render.
  const addAnotherRef = useRef(false);
  // Late-bound handles so the submit closure can reset and refocus the form it is
  // itself part of.
  const resetFormRef = useRef<() => void>(() => {});
  const focusTitleRef = useRef<() => void>(() => {});

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
      // Read and CLEAR the mode up front, so it describes this submission only.
      // Clearing it on the success path alone would leave it set after a failed
      // "Save and add another": the user fixes the error, presses Enter or the
      // primary Capture, and that submission would wrongly keep the panel open.
      const keepOpen = addAnotherRef.current;
      addAnotherRef.current = false;

      const body = new FormData();
      body.set("title", values.title);
      body.set("entryType", values.entryType);
      body.set("body", values.body);
      body.set("when", values.when);
      if (capture.context) {
        body.set("captureContext", encodeCaptureContext(capture.context));
      }
      let data: CreateDiaryEntryResult;
      try {
        const response = await fetch("/diary/new", { method: "POST", body });
        data = (await response.json()) as CreateDiaryEntryResult;
      } catch {
        return {
          status: "error",
          formError: "That entry couldn’t be captured. Please try again.",
        };
      }
      if (data.ok) {
        // The captured local day is the "when" date part, or today when blank.
        const capturedDayKey = values.when
          ? values.when.slice(0, 10)
          : todayKey;
        onCaptured(data.entryId, capturedDayKey, keepOpen);
        // The hand-off parameter has done its job. Dropping it here is what stops
        // the NEXT entry captured on this page — including through "Save and add
        // another" — from silently inheriting a context the user has finished with.
        capture.consume();
        if (keepOpen) {
          // Clear the form and return to the title so the next entry is
          // type-and-save with no navigation at all. Reached through refs
          // because `form` does not exist yet where this closure is written.
          resetFormRef.current();
          requestAnimationFrame(() => focusTitleRef.current());
        }
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
  // `resetToInitial`, not `reset`: a successful save makes the captured entry
  // the committed baseline, so `reset` would restore it instead of clearing.
  resetFormRef.current = form.resetToInitial;
  focusTitleRef.current = () => focusField("title");
  // Land focus on the title for the fast path. The host Inspector focuses its close
  // button in a single rAF on open; a NESTED rAF runs a frame later, so the title
  // wins the initial focus (the fast path starts in the title, not the close button).
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => focusField("title"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusField]);

  // Cmd+Enter (macOS) / Ctrl+Enter — a keyboard-only fast path from any field.
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

        {capture.context ? (
          <CaptureContextChip
            captureType="diary"
            context={capture.context}
            onRemove={capture.clear}
          />
        ) : null}

        <fieldset className="dh-diary-capture__types">
          <legend className="dh-diary-capture__legend">Type</legend>
          <div className="dh-diary-capture__chips">
            {options.map((option) => {
              const Icon = entryTypeIcon(option.value);
              const checked = typeField.value === option.value;
              return (
                <label
                  key={option.value}
                  className="dh-diary-capture__chip md-state-layer"
                  data-checked={checked ? "true" : "false"}
                >
                  <input
                    type="radio"
                    name="dh-diary-capture-type"
                    className="dh-diary-capture__radio"
                    value={option.value}
                    checked={checked}
                    onChange={() => typeField.onChange(option.value)}
                  />
                  <Icon aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <TextField
          label="Title"
          required
          maxLength={512}
          placeholder="What happened?"
          {...titleField}
        />

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
            {/* MOBILE-01: diary capture is bursty. "Save and add another" keeps
                the panel open, clears the form and returns focus to the title, so
                the next entry costs a title and a tap — no re-open, no
                navigation. "Capture" keeps its existing close-on-save behaviour. */}
            <FormButton
              type="submit"
              variant="secondary"
              pending={form.isSubmitting}
              onClick={() => {
                addAnotherRef.current = true;
              }}
            >
              Save and add another
            </FormButton>
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
          {/* EDIT-02 — the same writing surface as the entry record and as a
              Note, so what you type in capture looks like what you'll read
              afterwards. Capture keeps its own submit semantics. */}
          <MarkdownEditorField
            label="Details"
            rows={4}
            placeholder="What happened? Markdown is supported."
            showOptionalCue={false}
            disabled={form.isSubmitting}
            /*
             * DOC-EDITOR-01 — capture already had ⌘/Ctrl+Enter, via the panel
             * listener below that serves the title, type and when fields too.
             * Binding it INSIDE the writing surface as well is what stops
             * CodeMirror's default `Mod-Enter` (insert blank line) from also
             * firing and leaving a stray line in the entry that was just
             * submitted. `useForm`'s synchronous duplicate-submit guard means
             * the two paths still produce exactly one submission.
             */
            onCommit={form.handleSubmit}
            {...bodyField}
          />
        </div>
      </Form>
    </div>
  );
}
