/**
 * NOTES-05 — composes the CodeMirror extension set for the live writing editor.
 *
 * Kept deliberately small (no `basicSetup`): a prose writing surface wants line
 * wrapping and undo history, NOT line numbers, code folding, bracket matching or
 * syntax-highlighted code. The Markdown language provides the parse tree the
 * live-preview field styles from; there is no `syntaxHighlighting` because
 * FND-08 renders code as inert, un-highlighted text and the editor matches it.
 *
 * All *visual* styling lives in `app/styles/markdown-editor.css` using DS-01
 * tokens (so the token-only lint applies and light/dark/forced-colors are
 * handled in one place) — this file only wires behaviour and accessibility
 * attributes.
 */

import {
  history,
  historyKeymap,
  defaultKeymap,
  redoDepth,
  undoDepth,
} from "@codemirror/commands";
import { markdownKeymap } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  placeholder as placeholderExt,
} from "@codemirror/view";

import { createMarkdownLanguage } from "./editor-language";
import { formattingKeymap } from "./editor-keymap";
import { livePreview } from "./live-preview";

/**
 * EDIT-01 — everything the toolbar needs to describe itself, read off the live
 * editor state in ONE place.
 *
 * The toolbar's pressed states are derived from the Markdown SOURCE and the
 * selection (see `formatting-state.ts`), and its undo/redo enabled states from
 * CodeMirror's history depths. Pushing all of it through a single callback keeps
 * the component free of CodeMirror imports — it never learns what an
 * `EditorState` is — and means one update produces one React render rather than
 * three.
 */
export interface EditorSurfaceState {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface EditorSetupOptions {
  /** Called with the new Markdown source whenever the document changes. */
  readonly onChange: (value: string) => void;
  /**
   * Called whenever the document, the selection or the history depth changes —
   * i.e. whenever the toolbar's own appearance could be stale.
   */
  readonly onSurfaceState?: (state: EditorSurfaceState) => void;
  /** Called when the editor loses focus (drives autosave-on-blur). */
  readonly onBlur?: () => void;
  /** Accessible name for the editing surface. */
  readonly ariaLabel: string;
  /** Placeholder shown while the document is empty. */
  readonly placeholder?: string;
  /** Render read-only (no editing) — used defensively; the primary read view is
   * the separate FND-08 render, not a read-only editor. */
  readonly readOnly?: boolean;
}

export function createEditorExtensions(options: EditorSetupOptions): Extension {
  const {
    onChange,
    onSurfaceState,
    onBlur,
    ariaLabel,
    placeholder,
    readOnly = false,
  } = options;
  return [
    history(),
    // Formatting shortcuts first, then Markdown's Enter/Backspace list
    // continuation, then the default editing keymap.
    keymap.of([
      ...formattingKeymap(),
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    createMarkdownLanguage(),
    livePreview(),
    EditorView.lineWrapping,
    drawSelection(),
    placeholder ? placeholderExt(placeholder) : [],
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({
      "aria-label": ariaLabel,
      role: "textbox",
      "aria-multiline": "true",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
      // The toolbar's appearance depends on the document, the selection AND the
      // history depth, so every one of those has to re-report. `transactions`
      // covers a history change that moved neither (there is no such case today,
      // but relying on that would be a subtle trap for the next change here).
      if (
        onSurfaceState &&
        (update.docChanged ||
          update.selectionSet ||
          update.transactions.length > 0)
      ) {
        const main = update.state.selection.main;
        onSurfaceState({
          value: update.state.doc.toString(),
          selectionStart: main.from,
          selectionEnd: main.to,
          canUndo: undoDepth(update.state) > 0,
          canRedo: redoDepth(update.state) > 0,
        });
      }
    }),
    EditorView.domEventHandlers({
      blur: () => {
        onBlur?.();
        return false;
      },
    }),
  ];
}
