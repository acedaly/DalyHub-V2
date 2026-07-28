/**
 * MOBILE-01 — Quick Capture: Diary entry.
 *
 * Diary is the most phone-native workflow in DalyHub — a thought, on the move,
 * before it evaporates — so capture defaults to TODAY, preselects the entry type
 * used last, and focuses the content field immediately. Saving keeps you in the
 * sheet with "Add another" ready, because diary capture is usually bursty.
 *
 * It posts to `POST /diary/new` — the DIARY-01 endpoint backed by the RESERVED
 * `DiaryRepository.create`, which writes the entity row, its chronological detail
 * row and the one `diary_entry.created` Activity event atomically. Quick Capture
 * never writes a diary row any other way.
 *
 * Note the deliberate shape difference from the other panels: the diary's PRIMARY
 * field is its content, and its title is optional-feeling but structurally
 * required, so the panel captures a single line as the title and offers the longer
 * body behind disclosure — matching the module's own compact capture rather than
 * inventing a second information model.
 */

import { useCallback, useState } from "react";

import {
  Form,
  FormButton,
  FormErrorSummary,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import { SubtypeIcon } from "~/shared/entity";

import { CaptureResult } from "./CaptureResult";
import {
  DIARY_QUICK_ENTRY_TYPES,
  readRememberedDiaryType,
  rememberDiaryType,
} from "./diary-capture-model";
import { useCaptureContext } from "./use-capture-context";
import type { CapturePanelProps, CaptureSuccess } from "./types";

type Values = {
  readonly entryType: string;
  readonly title: string;
  readonly body: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Entry",
  entryType: "Type",
  body: "Details",
};

type CreateDiaryEntryResponse =
  | { readonly ok: true; readonly entryId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

export function DiaryCapturePanel({
  firstFieldRef,
  onClose,
}: CapturePanelProps) {
  const { context } = useCaptureContext();
  const [success, setSuccess] = useState<CaptureSuccess | null>(null);
  const [entryType, setEntryType] = useState<string>(() =>
    readRememberedDiaryType(),
  );

  const form = useForm<Values>({
    initialValues: { entryType, title: "", body: "" },
    fields: { title: { validate: required("Write something to capture") } },
    fieldOrder: ["title", "entryType", "body"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("entryType", entryType);
      body.set("title", values.title);
      if (values.body) body.set("body", values.body);

      let data: CreateDiaryEntryResponse;
      try {
        const response = await fetch("/diary/new", { method: "POST", body });
        data = (await response.json()) as CreateDiaryEntryResponse;
      } catch {
        return {
          status: "error",
          formError:
            "That entry couldn’t be captured. Your text is safe — try again.",
        };
      }
      if (data.ok) {
        rememberDiaryType(entryType);
        setSuccess({
          id: data.entryId,
          // The entry opens in place, on the Diary day it belongs to, through the
          // module's OWN URL-backed inspector key (`?inspector=view:<id>`) — not a
          // second record route invented by capture.
          href: `/diary?inspector=view:${data.entryId}`,
          openLabel: "Open in Diary",
          message: "Diary entry captured for today.",
        });
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

  const addAnother = useCallback(() => {
    setSuccess(null);
    form.reset();
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [form, firstFieldRef]);

  if (success) {
    return (
      <CaptureResult
        success={success}
        onAddAnother={addAnother}
        onDone={onClose}
      />
    );
  }

  return (
    <Form
      aria-label="Capture a diary entry"
      busy={form.isSubmitting}
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

      <p className="dh-capture-parent">
        {context?.todayIso
          ? `Capturing for today (${context.todayIso})`
          : "Capturing for today"}
      </p>

      {/* Entry type as labelled icon chips: every subtype carries its word, so the
          choice is never a glyph the user has to decode. */}
      <div className="dh-capture-chips" role="group" aria-label="Entry type">
        <span className="dh-capture-chips__label">Type</span>
        <div className="dh-capture-chips__row">
          {DIARY_QUICK_ENTRY_TYPES.map((option) => {
            const selected = entryType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="dh-capture-chip"
                aria-pressed={selected}
                onClick={() => setEntryType(option.value)}
                data-testid={`diary-type-${option.value}`}
              >
                {/* The shared PX-05 subtype registry, which falls back to the
                    Diary entity glyph for a type whose module glyph is not
                    loaded — the label always carries the meaning. */}
                <span className="dh-capture-chip__icon" aria-hidden="true">
                  <SubtypeIcon entityType="diary" subtype={option.value} />
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <TextField
        label="Entry"
        required
        maxLength={512}
        placeholder="What happened?"
        {...titleField}
        controlRef={(node) => {
          firstFieldRef.current = node instanceof HTMLElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      {/* Longer prose stays behind disclosure so the fast path is one line. */}
      <details className="dh-progressive-section">
        <summary>Add details</summary>
        <TextField
          label="Details"
          multiline
          rows={4}
          placeholder="Optional — the longer version."
          {...form.field("body")}
        />
      </details>

      <div className="dh-capture-actions">
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save entry
        </FormButton>
      </div>
    </Form>
  );
}
