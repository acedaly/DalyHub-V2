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
 *
 * ── Why both CodeMirror imports here are TYPE-ONLY ──────────────────────────
 * A `type` import is erased at build time; a value import is not. This module is
 * reached statically from `LiveMarkdownEditor`, which is itself reached from the
 * Task record — so a value import of `@codemirror/state` here put CodeMirror's
 * 48 KB state package into the STATIC graph of `/today` and `/tasks`, on a
 * surface where no editor has been opened. MEASURED: 48.1 KB raw / 15.9 KB gzip
 * on both routes, for a selection object.
 *
 * The one value that was imported, `EditorSelection.range(anchor, head)`, has a
 * plain-object equivalent that CodeMirror's own `TransactionSpec` accepts —
 * `{ anchor, head }` — so the dependency was never needed at all. Held by
 * `scripts/route-budget.mjs`, which fails if either route statically loads the
 * editor runtime again.
 */

import type { EditorState } from "@codemirror/state";
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
      selection: { anchor: change.selectionStart, head: change.selectionEnd },
      scrollIntoView: true,
    });
  } else {
    view.dispatch({
      selection: { anchor: change.selectionStart, head: change.selectionEnd },
    });
  }
  view.focus();
  return true;
}
