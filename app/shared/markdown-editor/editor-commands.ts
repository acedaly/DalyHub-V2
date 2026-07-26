/**
 * NOTES-05 — the bridge from the pure Markdown-source transforms to CodeMirror.
 *
 * Both the toolbar and the keyboard shortcuts apply a `MarkdownTransform` to the
 * live editor through here. A transform is a pure string-in/string-out splice
 * over the document and its single selection; `applyMarkdownTransform` reads the
 * current document + selection out of the view, runs the transform, and — only
 * if it actually changed the source — dispatches ONE transaction that updates
 * the document and restores the computed selection. One transaction means one
 * undo step, and because the document IS the Markdown source, nothing here
 * introduces a second document model.
 *
 * `computeTransformChange` is the pure core (view-free) so the "did it change /
 * where does the selection land" logic is unit tested against an `EditorState`.
 */

import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { MarkdownTransform } from "./markdown-transforms";

export interface TransformChange {
  readonly changed: boolean;
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** Run a transform against a CodeMirror state's document + primary selection. */
export function computeTransformChange(
  state: EditorState,
  transform: MarkdownTransform,
): TransformChange {
  const value = state.doc.toString();
  const main = state.selection.main;
  const result = transform({
    value,
    selectionStart: main.from,
    selectionEnd: main.to,
  });
  return {
    changed: result.value !== value,
    value: result.value,
    selectionStart: result.selectionStart,
    selectionEnd: result.selectionEnd,
  };
}

/**
 * Apply a transform to a live editor view. Returns true if it was handled
 * (always true when a view is present, so it can back a keymap command). A
 * no-op transform still refocuses the editor but dispatches no change, so it
 * never marks the document unsaved.
 */
export function applyMarkdownTransform(
  view: EditorView,
  transform: MarkdownTransform,
): boolean {
  const change = computeTransformChange(view.state, transform);
  if (change.changed) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: change.value },
      selection: EditorSelection.range(
        change.selectionStart,
        change.selectionEnd,
      ),
      scrollIntoView: true,
    });
  } else {
    view.dispatch({
      selection: EditorSelection.range(
        change.selectionStart,
        change.selectionEnd,
      ),
    });
  }
  view.focus();
  return true;
}
