/**
 * NOTES-05 — the shared writing-first Markdown editor.
 *
 * ONE primary editor across desktop and mobile: the document is styled as it is
 * typed (headings grow, emphasis/strikethrough/code style, task items become
 * checkboxes, thematic breaks and tables render) via CodeMirror decorations
 * over the SOURCE — never a rich-text/WYSIWYG document model. The editor's
 * document IS the Markdown source, byte-for-byte; `onChange` always emits that
 * exact source string, so the caller (autosave, storage, export) keeps treating
 * Markdown as the single source of truth.
 *
 * Progressive enhancement & SSR: the server (and any no-JavaScript client)
 * renders a real, controlled `<textarea>` — fully accessible and editable — and
 * the CodeMirror surface replaces it once mounted on the client. The toolbar and
 * keyboard shortcuts drive whichever surface is live, so formatting works before
 * and after enhancement.
 *
 * Reading mode: an unobtrusive **Read** toggle swaps the editor for the note
 * rendered through the ONE FND-08 pipeline (`renderMarkdownSource` →
 * `<MarkdownContent>`) — the sole renderer/sanitiser and the single sanctioned
 * HTML sink. The live editor itself adds no HTML sink.
 *
 * There is deliberately NO persistent Source/Split/Preview (retired from
 * NOTES-01C): the live editor is the writing surface, Read is the reading
 * surface, nothing else.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import type { EditorView } from "@codemirror/view";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { MarkdownContent } from "~/shared/markdown";

import { EditorToolbar, type EditorToolbarCommand } from "./EditorToolbar";
import { RecordLinkPicker, type RecordLinkOption } from "./RecordLinkPicker";
import { applyMarkdownTransform } from "./editor-commands";
import {
  editorViewModeLabel,
  otherEditorViewMode,
  type EditorViewMode,
} from "./editor-view-mode";
import type { MarkdownFormattingAction } from "./formatting-actions";
import {
  recordLinkTransform,
  type MarkdownTransform,
} from "./markdown-transforms";
import { deriveFieldIds, composeDescribedBy } from "~/shared/forms/field-ids";

export interface LiveMarkdownEditorProps {
  /** The Markdown source (the single source of truth). */
  readonly value: string;
  /** Emits the exact new Markdown source on every edit. */
  readonly onChange: (value: string) => void;
  /** Fired when the writing surface loses focus (drives autosave-on-blur). */
  readonly onBlur?: () => void;
  /** Accessible name for the writing surface and its region. */
  readonly label: string;
  /** Optional help text under the editor. */
  readonly help?: string;
  /** Optional validation error (e.g. oversized content), shown inline + polite. */
  readonly error?: string | null;
  /** Placeholder shown while empty. */
  readonly placeholder?: string;
  /** Accessible-name context for the formatting toolbar. */
  readonly toolbarLabel?: string;
  /** A slot on the right of the editor's top bar — the caller's save-status
   * indicator lives here (autosave state is the caller's concern). */
  readonly statusSlot?: ReactNode;
  /** Number of rows for the no-JS/SSR fallback textarea. */
  readonly rows?: number;
  /**
   * NOTES-05 §5 — enable the record-link picker.
   *
   * Optional, so the editor keeps working with no linking capability at all (the
   * Diary body, its intended second consumer, may not want one). When supplied,
   * a "Link" command joins the toolbar; choosing a record splices
   * `[Label](dalyhub://type/id)` into the source as ONE undoable edit.
   *
   * The search is the caller's, because only the caller has a workspace-scoped
   * server to ask — this component never fetches and never mints a destination.
   */
  readonly recordLink?: {
    readonly search: (
      query: string,
      signal: AbortSignal,
    ) => Promise<readonly RecordLinkOption[]>;
    /** Render an identity glyph for a record type (optional). */
    readonly renderIcon?: (type: string) => ReactNode;
    /** Human label for a record type, e.g. `project` → "Project". */
    readonly typeLabel?: (type: string) => string;
  };
}

export function LiveMarkdownEditor({
  value,
  onChange,
  onBlur,
  label,
  help,
  error,
  placeholder,
  toolbarLabel = "Formatting",
  statusSlot,
  rows = 18,
  recordLink,
}: LiveMarkdownEditorProps) {
  const [mode, setMode] = useState<EditorViewMode>("write");
  const [editorReady, setEditorReady] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the latest callbacks/value in refs so the (once-created) editor never
  // reads a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const valueRef = useRef(value);
  valueRef.current = value;

  const baseId = `dh-md-editor-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const invalid = Boolean(error);
  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  // Holds the teardown for an in-flight async view creation (see below).
  const cleanupRef = useRef<(() => void) | null>(null);

  // Create/destroy the CodeMirror view via a callback ref, so it is created when
  // the container attaches (client, Write mode) and torn down when it detaches
  // (unmount, or switching to Read mode). This also keeps it out of SSR: React
  // never calls ref callbacks on the server, so the server renders the fallback.
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        if (viewRef.current) return;
        let cancelled = false;
        void Promise.all([
          import("@codemirror/state"),
          import("@codemirror/view"),
          import("./editor-setup"),
        ])
          .then(
            ([{ EditorState }, { EditorView }, { createEditorExtensions }]) => {
              if (cancelled || !node.isConnected) return;
              const view = new EditorView({
                parent: node,
                state: EditorState.create({
                  doc: valueRef.current,
                  extensions: createEditorExtensions({
                    ariaLabel: label,
                    placeholder,
                    onChange: (next) => onChangeRef.current(next),
                    onBlur: () => onBlurRef.current?.(),
                  }),
                }),
              });
              viewRef.current = view;
              setEditorReady(true);
            },
          )
          .catch(() => {
            // If CodeMirror can't load or mount (an old browser, a chunk
            // failure, a non-layout test environment), the accessible,
            // controlled `<textarea>` fallback stays in place and fully usable —
            // the note is never un-editable.
          });
        // The cleanup for this branch runs when React calls the ref with null.
        cleanupRef.current = () => {
          cancelled = true;
        };
      } else {
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (viewRef.current) {
          viewRef.current.destroy();
          viewRef.current = null;
        }
        setEditorReady(false);
      }
    },
    [label, placeholder],
  );

  // When the live surface becomes ready, the container's `hidden` attribute is
  // removed in the same render. CodeMirror measured its geometry while the
  // container was still hidden (zero-sized), so nudge it to re-measure now that
  // it is laid out — otherwise the surface can briefly report a zero height.
  useEffect(() => {
    if (editorReady) {
      viewRef.current?.requestMeasure();
    }
  }, [editorReady]);

  // Sync an EXTERNAL value change (e.g. a programmatic reset) into the editor.
  // The common case — our own onChange echoing back — is a no-op because the
  // incoming value already equals the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // Apply a pure Markdown-source transform to whichever surface is live. Both
  // paths commit ONE change and restore the selection, so a toolbar action, a
  // keyboard shortcut and a record-link insertion are all a single undo step.
  const applyTransform = useCallback((transform: MarkdownTransform) => {
    const view = viewRef.current;
    if (view) {
      applyMarkdownTransform(view, transform);
      return;
    }
    const textarea = fallbackRef.current;
    if (!textarea) return;
    const currentValue = textarea.value;
    const result = transform({
      value: currentValue,
      selectionStart: textarea.selectionStart ?? currentValue.length,
      selectionEnd: textarea.selectionEnd ?? currentValue.length,
    });
    if (result.value !== currentValue) {
      flushSync(() => onChangeRef.current(result.value));
    }
    textarea.focus();
    try {
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    } catch {
      // Detached-node environments can throw; focus alone is acceptable.
    }
  }, []);

  const applyAction = useCallback(
    (action: MarkdownFormattingAction) => applyTransform(action.transform),
    [applyTransform],
  );

  /* -- Record-link picker (NOTES-05 §5) ----------------------------------- */

  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  /** Return focus to the live writing surface, whichever one it is. */
  const focusEditor = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      view.focus();
      return;
    }
    fallbackRef.current?.focus();
  }, []);

  const closeLinkPicker = useCallback(() => {
    setLinkPickerOpen(false);
    // Focus must come back to the document, not be dropped on the page — the
    // author was mid-sentence (DS-11: a transient surface always restores focus).
    focusEditor();
  }, [focusEditor]);

  const chooseRecord = useCallback(
    (option: RecordLinkOption) => {
      setLinkPickerOpen(false);
      // Insert first, then restore focus: `applyTransform` sets the selection,
      // and focusing afterwards keeps the caret exactly where it put it.
      applyTransform(
        recordLinkTransform({ url: option.url, title: option.title }),
      );
      focusEditor();
    },
    [applyTransform, focusEditor],
  );

  const toolbarCommands = useMemo<readonly EditorToolbarCommand[]>(
    () =>
      recordLink
        ? [
            {
              id: "record-link",
              // NOT "Link": the formatting catalogue already has a "Link"
              // action (an ordinary Markdown link). Two toolbar buttons sharing
              // one accessible name is indistinguishable to a screen-reader
              // user, and the visible word IS the accessible name here.
              label: "Record link",
              hint: "Link a DalyHub record (project, person, meeting, asset…)",
              expanded: linkPickerOpen,
              onSelect: () => setLinkPickerOpen((wasOpen) => !wasOpen),
            },
          ]
        : [],
    [recordLink, linkPickerOpen],
  );

  // Reading mode: render the note through the ONE FND-08 pipeline.
  const [readHtml, setReadHtml] = useState<
    | { readonly kind: "idle" }
    | { readonly kind: "ready"; readonly html: SanitizedMarkdownHtml }
    | { readonly kind: "error" }
  >({ kind: "idle" });
  useEffect(() => {
    if (mode !== "read") return;
    let cancelled = false;
    void import("~/platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (cancelled) return;
        try {
          setReadHtml({
            kind: "ready",
            html: renderMarkdownSource(value).html,
          });
        } catch {
          setReadHtml({ kind: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setReadHtml({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, value]);

  const toggleMode = () => setMode((m) => otherEditorViewMode(m));
  const hasContent = value.trim().length > 0;

  return (
    <div
      className="dh-md-editor"
      data-mode={mode}
      // A stable, surface-agnostic readiness contract: `true` once the live
      // CodeMirror writing surface has mounted and replaced the SSR/no-JS
      // `<textarea>` fallback, `false` while the fallback is still the editing
      // surface. Callers (and E2E) can gate on this instead of reaching for
      // CodeMirror's internal `.cm-editor` class, which is an implementation
      // detail of the library, not of this editor's public contract.
      data-editor-ready={editorReady ? "true" : "false"}
      role="group"
      aria-label={label}
    >
      <div className="dh-md-editor__bar">
        {mode === "write" ? (
          <EditorToolbar
            onAction={applyAction}
            label={toolbarLabel}
            commands={toolbarCommands}
          />
        ) : (
          <span className="dh-md-editor__reading-note">Reading</span>
        )}
        <div className="dh-md-editor__bar-end">
          {statusSlot}
          <button
            type="button"
            className="dh-md-editor__mode-toggle"
            aria-pressed={mode === "read"}
            onClick={toggleMode}
          >
            {editorViewModeLabel(otherEditorViewMode(mode))}
          </button>
        </div>
      </div>

      {/* The picker sits between the toolbar and the writing surface so the
          reading order matches the visual order and the results never cover the
          line being written — on a phone especially, where the software keyboard
          already owns the bottom of the screen. */}
      {mode === "write" && recordLink && linkPickerOpen ? (
        <RecordLinkPicker
          search={recordLink.search}
          onChoose={chooseRecord}
          onCancel={closeLinkPicker}
          renderIcon={recordLink.renderIcon}
          typeLabel={recordLink.typeLabel}
        />
      ) : null}

      {mode === "write" ? (
        <div className="dh-md-editor__surface">
          {!editorReady ? (
            <textarea
              ref={fallbackRef}
              className="dh-md-editor__fallback"
              value={value}
              rows={rows}
              placeholder={placeholder}
              aria-label={label}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              spellCheck
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => onBlur?.()}
            />
          ) : null}
          <div
            ref={containerRef}
            className="dh-md-editor__cm"
            hidden={!editorReady}
            aria-describedby={describedBy}
          />
        </div>
      ) : (
        <div
          className="dh-md-editor__reading"
          aria-label={`${label} — reading`}
        >
          {readHtml.kind === "ready" && hasContent ? (
            <MarkdownContent html={readHtml.html} />
          ) : readHtml.kind === "error" ? (
            <p className="dh-md-editor__reading-error">
              This note can’t be rendered right now.
            </p>
          ) : hasContent ? (
            <p className="dh-md-editor__reading-loading">Rendering…</p>
          ) : (
            <p className="dh-md-editor__reading-empty">Nothing to read yet.</p>
          )}
        </div>
      )}

      <div className="dh-md-editor__messages">
        {help ? (
          <p id={helpId} className="dh-md-editor__help">
            {help}
          </p>
        ) : null}
        <div className="dh-md-editor__error-slot" aria-live="polite">
          {invalid ? (
            <p id={errorId} className="dh-md-editor__error">
              <span className="dh-md-editor__error-icon" aria-hidden="true">
                !
              </span>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
