/**
 * NOTES-05 / EDIT-01 — the shared writing-first Markdown editor.
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
 * There is deliberately NO persistent Source/Split/Preview: the live editor is
 * the writing surface, Read is the reading surface, nothing else.
 *
 * ── EDIT-01 ──────────────────────────────────────────────────────────────────
 * Three additions, all in service of "this should feel like Docs, not like a
 * form panel":
 *
 *   1. the toolbar reports ACTIVE formatting (`aria-pressed`), derived from the
 *      Markdown source at the selection by the pure `formatting-state.ts` — for
 *      BOTH surfaces, not only the enhanced one;
 *   2. undo/redo are real toolbar controls with real enabled state, read from
 *      CodeMirror's history depth (and absent on the fallback surface, where the
 *      browser owns an unqueryable undo stack — see `EditorToolbar`);
 *   3. `density="compact"` trims the chrome for an editor embedded in a record
 *      body, where the surrounding page already provides the frame.
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
import { LinkIcon } from "~/shared/icons";

import {
  EditorToolbar,
  type EditorHistoryCommands,
  type EditorToolbarCommand,
} from "./EditorToolbar";
import { RecordLinkPicker, type RecordLinkOption } from "./RecordLinkPicker";
import { applyMarkdownTransform } from "./editor-commands";
import type { EditorSurfaceState } from "./editor-setup";
import {
  editorViewModeLabel,
  otherEditorViewMode,
  type EditorViewMode,
} from "./editor-view-mode";
import type { MarkdownFormattingAction } from "./formatting-actions";
import { activeFormattingIds } from "./formatting-state";
import {
  recordLinkTransform,
  type MarkdownTransform,
} from "./markdown-transforms";
import { deriveFieldIds, composeDescribedBy } from "~/shared/forms/field-ids";
import { resolveEnhancementHandoff } from "./enhancement-handoff";

export interface LiveMarkdownEditorProps {
  /** The Markdown source (the single source of truth). */
  readonly value: string;
  /** Emits the exact new Markdown source on every edit. */
  readonly onChange: (value: string) => void;
  /** Fired when the writing surface loses focus (drives autosave-on-blur). */
  readonly onBlur?: () => void;
  /**
   * DOC-EDITOR-01 — ⌘/Ctrl+Enter from inside the writing surface.
   *
   * A long-form surface with an EXPLICIT save needs a keyboard path to it, and
   * that path can never be plain Enter — Enter is a paragraph, and a multiline
   * editor that saves on Enter loses the paragraph the owner was writing. This
   * fires on the SAME chord DalyHub already uses for the same purpose, on BOTH
   * surfaces (the live editor and the SSR/no-JS textarea), so keyboard save does
   * not depend on enhancement having happened.
   *
   * Omit it on an autosaving surface: there is nothing to commit, and a shortcut
   * that appears to do something and does not is worse than no shortcut.
   */
  readonly onCommit?: () => void;
  /**
   * A ref to the focusable WRITING SURFACE, whichever one is live.
   *
   * A form host needs this: when the server refuses a Markdown field — an
   * oversized Diary body, a rejected Task description — `useForm`'s
   * `focusFirstInvalid` and the error-summary links move focus to the control that
   * failed, and a control that reports no focusable node simply cannot be reached
   * that way (AGENTS.md §15: keyboard-complete, and announce change). It resolves
   * to the SSR/no-JS textarea before enhancement and to the CodeMirror content
   * element after it, so the contract does not depend on enhancement having
   * happened. Focusing the content element puts the caret in the document, which
   * is where an author being sent to fix their text wants it.
   */
  readonly surfaceRef?: (node: HTMLElement | null) => void;
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
   * EDIT-01 — how much chrome the editor carries.
   *
   * `comfortable` (the default) is the editor-first workspace: a Note, a Diary
   * entry, a Review — where the writing surface IS the page and a generous
   * minimum height is right. `compact` is an editor embedded in a record body,
   * where the page already provides the frame: a shorter minimum height and no
   * Read/Write toggle, because the surrounding surface already shows the record.
   */
  readonly density?: "comfortable" | "compact";
  /**
   * Hide the Read/Write toggle. Implied by `density="compact"`, and available
   * separately for a host that renders its own view/edit transition (the DS-16
   * inline Markdown field does exactly that).
   */
  readonly hideModeToggle?: boolean;
  /**
   * Focus the writing surface as soon as it is ready.
   *
   * Deliberately NOT called `autoFocus`: this is not the DOM attribute, and the
   * distinction matters. The DOM attribute steals focus on page load, which is
   * the behaviour the accessibility lint (correctly) refuses. This flag is set
   * only when the user has just ASKED to edit — the caret belongs in the text
   * they chose to open, and dropping them outside it would be the defect.
   */
  readonly autoFocusOnMount?: boolean;
  /**
   * EDIT-02 — render the writing surface as temporarily un-editable.
   *
   * For a host whose save semantics are an explicit FORM submit: while the
   * request is in flight every other control in that form is disabled, and an
   * editor that stayed live would let the user type into a document that is
   * about to be replaced by the server's answer. The toolbar goes with it —
   * a formatting button that edits a frozen document is a control that lies.
   *
   * It is NOT a read view. Reading is the Read toggle (or the caller's own
   * rendered content); this is the disabled STATE of an editing control.
   */
  readonly disabled?: boolean;
  /**
   * NOTES-05 §5 — enable the record-link picker.
   *
   * Optional, so the editor keeps working with no linking capability at all (the
   * Diary body, its intended second consumer, may not want one). When supplied,
   * a "Record link" command joins the toolbar; choosing a record splices
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

/** The surface state before anything has been reported by a live editor. */
const INITIAL_SURFACE: Omit<EditorSurfaceState, "value"> = {
  selectionStart: 0,
  selectionEnd: 0,
  canUndo: false,
  canRedo: false,
};

export function LiveMarkdownEditor({
  value,
  onChange,
  onBlur,
  onCommit,
  surfaceRef,
  label,
  help,
  error,
  placeholder,
  toolbarLabel = "Formatting",
  statusSlot,
  rows = 18,
  density = "comfortable",
  hideModeToggle = false,
  autoFocusOnMount = false,
  disabled = false,
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
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const surfaceRefCallback = useRef(surfaceRef);
  surfaceRefCallback.current = surfaceRef;
  const valueRef = useRef(value);
  valueRef.current = value;
  const autoFocusRef = useRef(autoFocusOnMount);
  autoFocusRef.current = autoFocusOnMount;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  /** Reconfigure the live view's editable state, once one exists. */
  const setEditableRef = useRef<((editable: boolean) => void) | null>(null);

  const baseId = `dh-md-editor-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const invalid = Boolean(error);
  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  /* -- Toolbar state (EDIT-01) -------------------------------------------- */

  // The selection and history depth of whichever surface is live. The live
  // editor reports them; the fallback textarea's selection is read from the DOM
  // on the events that can move it, and it contributes no history (see below).
  const [surface, setSurface] = useState(INITIAL_SURFACE);

  const activeIds = useMemo(
    () =>
      activeFormattingIds({
        value,
        selectionStart: surface.selectionStart,
        selectionEnd: surface.selectionEnd,
      }),
    [value, surface.selectionStart, surface.selectionEnd],
  );

  const onSurfaceState = useCallback((next: EditorSurfaceState) => {
    setSurface({
      selectionStart: next.selectionStart,
      selectionEnd: next.selectionEnd,
      canUndo: next.canUndo,
      canRedo: next.canRedo,
    });
  }, []);

  /** Read the fallback textarea's selection after any event that can move it. */
  const syncFallbackSelection = useCallback(() => {
    const textarea = fallbackRef.current;
    if (!textarea) return;
    setSurface((previous) => {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      if (previous.selectionStart === start && previous.selectionEnd === end) {
        return previous;
      }
      return { ...previous, selectionStart: start, selectionEnd: end };
    });
  }, []);

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
            ([
              { EditorState },
              { EditorView },
              { createEditorExtensions, setEditorEditable },
            ]) => {
              if (cancelled || !node.isConnected) return;
              /*
               * DEBT-202 — the enhanced editor starts from the FALLBACK's own
               * value, not from the prop it mounted with.
               *
               * The prop lags the textarea by however long React takes to
               * commit, and this `.then` fires whenever a ~525 kB chunk happens
               * to finish loading. Reading the DOM here is the only way to be
               * sure the handoff takes what the author actually typed — and if
               * the host has not seen it yet, it is reported upward below, so
               * the FORM agrees with the editor rather than saving over it.
               */
              const fallback = fallbackRef.current;
              const handoff = resolveEnhancementHandoff(
                valueRef.current,
                fallback
                  ? {
                      value: fallback.value,
                      selectionStart: fallback.selectionStart ?? 0,
                      selectionEnd: fallback.selectionEnd ?? 0,
                    }
                  : null,
              );
              const view = new EditorView({
                parent: node,
                state: EditorState.create({
                  doc: handoff.doc,
                  selection: {
                    anchor: handoff.selectionStart,
                    head: handoff.selectionEnd,
                  },
                  extensions: createEditorExtensions({
                    ariaLabel: label,
                    placeholder,
                    readOnly: disabledRef.current,
                    onChange: (next) => onChangeRef.current(next),
                    onSurfaceState,
                    onBlur: () => onBlurRef.current?.(),
                    // Asked at PRESS time, never captured at creation: a host
                    // that disables its fields mid-submit and re-enables them
                    // must not lose the shortcut for the rest of the session.
                    onCommit: () => {
                      const commit = onCommitRef.current;
                      if (!commit) return false;
                      commit();
                      return true;
                    },
                  }),
                }),
              });
              viewRef.current = view;
              if (handoff.adopted) {
                // The host had not committed these characters. Telling it now is
                // what stops the save reporting success over the top of them.
                onChangeRef.current(handoff.doc);
              }
              // The live surface is now the focusable one. `contentDOM` is the
              // element CodeMirror gives `role="textbox"`, so a host focusing it
              // lands the caret in the document rather than on a wrapper.
              surfaceRefCallback.current?.(view.contentDOM);
              // Reconfiguration, not re-creation: a later disable must not cost
              // the author their undo history or their caret.
              setEditableRef.current = (editable) =>
                setEditorEditable(view, editable);
              setEditorReady(true);
              if (autoFocusRef.current && !disabledRef.current) {
                view.focus();
              }
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
        setEditableRef.current = null;
        if (viewRef.current) {
          surfaceRefCallback.current?.(null);
          viewRef.current.destroy();
          viewRef.current = null;
        }
        setEditorReady(false);
        setSurface(INITIAL_SURFACE);
      }
    },
    [label, placeholder, onSurfaceState],
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

  // Focus the fallback surface when asked to, so the caller's "enter editing"
  // transition lands the caret in the text regardless of which surface is live.
  useEffect(() => {
    if (autoFocusOnMount && !editorReady && !disabled) {
      fallbackRef.current?.focus();
    }
  }, [autoFocusOnMount, editorReady, disabled]);

  // Track the host's disabled state onto whichever surface is live.
  useEffect(() => {
    setEditableRef.current?.(!disabled);
  }, [disabled, editorReady]);

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
    setSurface((previous) => ({
      ...previous,
      selectionStart: result.selectionStart,
      selectionEnd: result.selectionEnd,
    }));
  }, []);

  const applyAction = useCallback(
    (action: MarkdownFormattingAction) => applyTransform(action.transform),
    [applyTransform],
  );

  /* -- Undo / redo --------------------------------------------------------- */

  const runHistoryCommand = useCallback(async (command: "undo" | "redo") => {
    const view = viewRef.current;
    if (!view) return;
    const commands = await import("@codemirror/commands");
    (command === "undo" ? commands.undo : commands.redo)(view);
    view.focus();
  }, []);

  /**
   * Undo/redo are offered ONLY on the enhanced surface.
   *
   * The fallback `<textarea>` has the browser's own undo stack, which no API can
   * query — a permanently-enabled button that may silently do nothing is exactly
   * the non-functional control this toolbar refuses to render. ⌘Z still works
   * there, natively, because nothing intercepts it.
   */
  const history = useMemo<EditorHistoryCommands | undefined>(
    () =>
      editorReady
        ? {
            canUndo: surface.canUndo,
            canRedo: surface.canRedo,
            onUndo: () => void runHistoryCommand("undo"),
            onRedo: () => void runHistoryCommand("redo"),
          }
        : undefined,
    [editorReady, surface.canUndo, surface.canRedo, runHistoryCommand],
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
              // user.
              label: "Record link",
              hint: "Link a DalyHub record (project, person, meeting, asset…)",
              icon: <LinkIcon data-variant="record" />,
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
  const showModeToggle = !hideModeToggle && density !== "compact";

  return (
    <div
      className="dh-md-editor"
      data-mode={mode}
      data-density={density}
      data-disabled={disabled ? "true" : undefined}
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
            activeIds={activeIds}
            // The toolbar keeps its shape while disabled — the controls grey
            // out rather than disappearing, so nothing shifts under the pointer
            // when a save starts and finishes.
            history={history}
            disabled={disabled}
          />
        ) : (
          <span className="dh-md-editor__reading-note">Reading</span>
        )}
        {statusSlot || showModeToggle ? (
          <div className="dh-md-editor__bar-end">
            {statusSlot}
            {showModeToggle ? (
              <button
                type="button"
                className="dh-md-editor__mode-toggle"
                aria-pressed={mode === "read"}
                onClick={toggleMode}
              >
                {editorViewModeLabel(otherEditorViewMode(mode))}
              </button>
            ) : null}
          </div>
        ) : null}
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
              ref={(node) => {
                fallbackRef.current = node;
                // Only while the fallback IS the writing surface: once CodeMirror
                // mounts, the ref above takes over and this element is gone.
                if (!editorReady) surfaceRefCallback.current?.(node);
              }}
              className="dh-md-editor__fallback"
              value={value}
              rows={rows}
              placeholder={placeholder}
              aria-label={label}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              disabled={disabled}
              spellCheck
              onChange={(event) => {
                onChange(event.target.value);
                syncFallbackSelection();
              }}
              onSelect={syncFallbackSelection}
              onKeyUp={syncFallbackSelection}
              onClick={syncFallbackSelection}
              onBlur={() => onBlur?.()}
              onKeyDown={(event) => {
                // The fallback surface gets the same chord. Plain Enter is left
                // entirely alone — the textarea inserts its paragraph.
                if (
                  onCommit &&
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  onCommit();
                }
              }}
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
