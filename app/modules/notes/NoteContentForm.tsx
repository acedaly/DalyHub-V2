/**
 * NOTES-01C — the Note record's "Note" tab: the Markdown source editor, now
 * with dependable AUTOSAVE (replacing NOTES-01B's explicit-Save-only model)
 * and a desktop side-by-side source/preview layout.
 *
 * Autosave correctness is entirely the ONE shared, pure DS-06 coordinator
 * (`~/shared/forms/autosave.ts`, exercised through `useAutosaveField`) — one
 * save ever in flight, rapid edits coalesce to the LATEST value, a stale/late
 * response can never overwrite newer local state, a failed save preserves the
 * user's draft and offers explicit Retry, and no save is even attempted while
 * the value is invalid (oversized). NOTES-01B's own explicit-Save deferral
 * comment called out that adapting this hook to a FULL-DOCUMENT payload needed
 * its own design pass — this file is that pass: the debounce is tuned longer
 * than DS-06's 800ms short-field default (`NOTE_AUTOSAVE_DEBOUNCE_MS`) so
 * continuous typing coalesces into one save instead of one per pause, and a
 * lightweight client-side size check (`validateNoteContentSize`) gives
 * immediate feedback for an oversized document instead of always waiting on a
 * round trip to learn the same thing from the server's authoritative
 * `parseMarkdownSource` boundary — that boundary remains the real limit.
 *
 * The editor still uses the ONE DS-06 Markdown control (`MarkdownField`, with
 * its OWN built-in preview toggle suppressed via `hidePreviewToggle`) for the
 * textarea, so exact source preservation (including whitespace-only content)
 * is unchanged. The preview pane (Split/Preview view modes) renders through
 * the exact same shared FND-08 pipeline (`renderMarkdownSource` →
 * `<MarkdownContent>`) — no second parser, no second unsafe-HTML sink.
 *
 * `SaveStatusIndicator` presents unsaved/saving/saved/error; `error` also
 * distinguishes a detected OFFLINE failure from a generic one
 * (`useOnlineStatus`), and a save automatically retries the moment
 * connectivity returns — the user should not have to notice and click Retry
 * for something the browser already told us. `UnsavedChangesGuard` now arms
 * while the latest edit is not yet safely persisted (`unsaved`/`saving`/
 * `error`) rather than on `useForm`'s old `isDirty` flag, and disarms the
 * instant a save actually lands (`saved`/`idle`) — it never blocks navigation
 * once the latest content is safely stored, and never traps the user
 * indefinitely (Leave is always available).
 */

import { useEffect, useRef, useState, type RefObject } from "react";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import {
  MarkdownField,
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useAutosaveField,
} from "~/shared/forms";
import { MarkdownContent } from "~/shared/markdown";

import { NoteFormattingToolbar } from "./NoteFormattingToolbar";
import { validateNoteContentSize } from "./note-content-validation";
import {
  availableNoteEditorViewModes,
  resolveNoteEditorViewMode,
  NOTE_EDITOR_WIDE_QUERY,
  type NoteEditorViewMode,
} from "./note-editor-view-mode";
import { useIsWideViewport } from "./use-wide-viewport";
import { useOnlineStatus } from "./use-online-status";
import type { NoteMutationResult } from "./routes/mutate";

const CONTENT_HELP = `Markdown source — supports headings, lists, links, tables and more. Up to ${MARKDOWN_SOURCE_MAX_BYTES.toLocaleString()} bytes.`;

/**
 * A full document is a much larger, less frequently-committed payload than
 * the short fields `useAutosaveField` is otherwise proven against — a longer
 * debounce than DS-06's 800ms default keeps rapid, continuous typing from
 * generating a save per pause, while still saving well within what a user
 * reads as "automatic" once they stop.
 */
const NOTE_AUTOSAVE_DEBOUNCE_MS = 1500;

/** How long to wait after the last edit before rendering the preview pane —
 * cheap, purely local work, but debounced so a long paste or fast typing
 * burst doesn't re-parse Markdown on every keystroke. */
const PREVIEW_DEBOUNCE_MS = 200;

const OFFLINE_MESSAGE =
  "You're offline. Your changes are safe here and will save automatically once you're back online.";

const MODE_LABELS: Record<NoteEditorViewMode, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

export interface NoteContentFormProps {
  readonly noteId: string;
  readonly initialContent: string;
  /** Called after a successful content save, so the record can revalidate
   * (the Activity tab's `reloadKey` depends on the fresh `contentUpdatedAt`). */
  readonly onSaved: () => void;
  /**
   * Force the navigation guard off regardless of autosave state — set (via a
   * synchronous `flushSync`) the instant the record's own Delete action
   * succeeds, so a note the user just deliberately deleted never asks "leave
   * with unsaved changes?" on the way to `/notes` (`~/modules/notes/use-delete-note.ts`).
   */
  readonly suppressGuard?: boolean;
  /**
   * Set (during render, like `onSavedRef` below) with the field's current
   * `flush` function, so `use-delete-note.ts` can force the latest edit to be
   * safely persisted BEFORE it deletes and navigates away — deleting while an
   * edit is unsaved/saving/failed would otherwise unmount this field and
   * discard that draft (the in-flight fetch is aborted, and an unsaved/failed
   * value lives only in this hook's React state). See `flush`'s own doc
   * comment in `~/shared/forms/use-autosave-field.ts`.
   */
  readonly flushRef?: RefObject<(() => Promise<boolean>) | null>;
}

type PreviewState =
  | { readonly kind: "idle" }
  | { readonly kind: "ready"; readonly html: SanitizedMarkdownHtml }
  | { readonly kind: "error"; readonly message: string };

export function NoteContentForm({
  noteId,
  initialContent,
  onSaved,
  suppressGuard = false,
  flushRef,
}: NoteContentFormProps) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // The live source `<textarea>` node, captured from the DS-06 `MarkdownField`
  // control so the NOTES-04 formatting toolbar can read the current selection
  // and splice Markdown syntax into the SAME value the field already owns.
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // The hook always surfaces its ONE calm, fixed `errorMessage` on failure
  // (never a raw exception) — this ref captures the more specific server
  // message (when one exists) purely for DISPLAY, layered on top in render.
  const lastServerMessageRef = useRef<string | null>(null);

  const field = useAutosaveField<string>({
    initialValue: initialContent,
    debounceMs: NOTE_AUTOSAVE_DEBOUNCE_MS,
    validate: validateNoteContentSize,
    onSave: async (value, signal) => {
      const body = new FormData();
      body.set("intent", "update_content");
      body.set("content", value);
      let data: NoteMutationResult;
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body, signal },
        );
        data = (await response.json()) as NoteMutationResult;
      } catch (cause) {
        lastServerMessageRef.current = null;
        throw cause instanceof Error ? cause : new Error("network");
      }
      if (data.kind === "update_content" && data.ok) {
        lastServerMessageRef.current = null;
        onSavedRef.current();
        return;
      }
      lastServerMessageRef.current =
        (data.kind === "update_content" &&
          (data.fieldErrors?.content ?? data.formError)) ||
        null;
      throw new Error("save rejected");
    },
  });

  if (flushRef) {
    flushRef.current = field.flush;
  }

  // Offline detection: attribute a failure honestly, and retry automatically
  // the moment connectivity returns instead of waiting for the user to notice
  // and click Retry for something the browser already told us.
  const online = useOnlineStatus();
  const statusRef = useRef(field.status);
  statusRef.current = field.status;
  const retryRef = useRef(field.retry);
  retryRef.current = field.retry;
  useEffect(() => {
    if (online && statusRef.current === "error") {
      retryRef.current();
    }
  }, [online]);

  const isOffline = !online;
  const displayError =
    field.status === "error"
      ? isOffline
        ? OFFLINE_MESSAGE
        : (lastServerMessageRef.current ?? field.error)
      : null;

  // Guard while the latest edit is not yet safely persisted. `saving` is
  // included: a save in flight might still fail, or might be superseded by an
  // even newer edit the coordinator will save next — the content is not yet
  // durably safe until `saved`/`idle`. Never traps the user: Leave is always
  // offered by `UnsavedChangesGuard` itself.
  const hasUnsettledChanges =
    !suppressGuard &&
    (field.status === "unsaved" ||
      field.status === "saving" ||
      field.status === "error");

  const isWide = useIsWideViewport(NOTE_EDITOR_WIDE_QUERY);
  const [desiredViewMode, setDesiredViewMode] =
    useState<NoteEditorViewMode>("source");
  const viewMode = resolveNoteEditorViewMode(desiredViewMode, isWide);
  const viewModes = availableNoteEditorViewModes(isWide);

  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  useEffect(() => {
    if (viewMode === "source") {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      import("../../platform/markdown")
        .then(({ renderMarkdownSource }) => {
          if (cancelled) return;
          try {
            const { html } = renderMarkdownSource(field.value);
            setPreview({ kind: "ready", html });
          } catch {
            setPreview({
              kind: "error",
              message:
                "This content can't be previewed. Check for unusually long text or unusual characters.",
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreview({
              kind: "error",
              message: "Preview is unavailable right now.",
            });
          }
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewMode, field.value]);

  return (
    <>
      <UnsavedChangesGuard when={hasUnsettledChanges} />
      <div className="dh-note-editor">
        <div className="dh-note-editor__toolbar">
          <div
            className="dh-note-editor__modes"
            role="group"
            aria-label="Editor view"
          >
            {viewModes.map((mode) => {
              const selected = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className="dh-note-editor__mode"
                  aria-pressed={selected}
                  onClick={() => setDesiredViewMode(mode)}
                >
                  <span
                    className="dh-note-editor__mode-check"
                    aria-hidden="true"
                  >
                    {selected ? "✓" : ""}
                  </span>
                  {MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
          <SaveStatusIndicator
            status={field.status}
            error={displayError}
            onRetry={field.retry}
          />
        </div>

        <div className="dh-note-editor__panes" data-view={viewMode}>
          {viewMode !== "preview" ? (
            <div className="dh-note-editor__source">
              <NoteFormattingToolbar
                textareaRef={sourceTextareaRef}
                onChange={field.onChange}
                label="Formatting"
              />
              <MarkdownField
                label="Note"
                rows={20}
                help={CONTENT_HELP}
                showOptionalCue={false}
                hidePreviewToggle
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={field.validationError}
                controlRef={(node) => {
                  sourceTextareaRef.current =
                    node as HTMLTextAreaElement | null;
                }}
              />
            </div>
          ) : null}
          {viewMode !== "source" ? (
            <div
              className="dh-note-editor__preview"
              aria-label="Markdown preview"
            >
              {preview.kind === "ready" ? (
                field.value.trim().length > 0 ? (
                  <MarkdownContent html={preview.html} />
                ) : (
                  <p className="dh-note-editor__preview-empty">
                    Nothing to preview yet.
                  </p>
                )
              ) : preview.kind === "error" ? (
                <p className="dh-note-editor__preview-error">
                  {preview.message}
                </p>
              ) : (
                <p className="dh-note-editor__preview-loading">
                  Rendering preview…
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
