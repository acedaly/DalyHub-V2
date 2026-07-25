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
 * Built entirely from DS-06 shared controls (`useForm`, `TextField`, `MarkdownField`)
 * plus the owner-local `WhenField`. `useForm` gives duplicate-submit prevention and
 * draft retention on failure for free. On success the entry is captured through the
 * reserved `DiaryRepository.create` (via `POST /diary/new`); the parent revalidates
 * the timeline and reports where the entry landed (honestly handling a backdated
 * entry that belongs to another day).
 */

import { useEffect, useRef, useState } from "react";

import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  MarkdownField,
  TextField,
  required as requiredRule,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

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
   */
  readonly onCaptured: (entryId: string, capturedDayKey: string) => void;
}

export function DiaryCapture({ todayKey, onCaptured }: DiaryCaptureProps) {
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
        // The captured local day is the "when" date part, or today when blank.
        const capturedDayKey = values.when
          ? values.when.slice(0, 10)
          : todayKey;
        onCaptured(data.entryId, capturedDayKey);
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

        <fieldset className="dh-diary-capture__types">
          <legend className="dh-diary-capture__legend">Type</legend>
          <div className="dh-diary-capture__chips">
            {options.map((option) => {
              const Icon = entryTypeIcon(option.value);
              const checked = typeField.value === option.value;
              return (
                <label
                  key={option.value}
                  className="dh-diary-capture__chip"
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
