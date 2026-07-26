/**
 * NOTES-05 — the CodeMirror extension that keeps the live-preview decorations in
 * sync with the document and selection.
 *
 * It is a `StateField` (not a view plugin) because the live preview includes
 * *block* decorations — the rendered thematic rule and table widgets — and
 * CodeMirror only accepts block decorations from state fields. The field
 * recomputes `buildLivePreviewDecorations` whenever the document or the
 * selection changes: the selection matters because a construct reveals its raw
 * Markdown source while the caret is inside it (see `live-decorations.ts`).
 *
 * Recomputing from the freshly-parsed tree (rather than mapping the previous
 * set) keeps the logic a single pure function that is trivial to reason about
 * and unit test; the Lezer parse is incremental and the source is bounded to
 * FND-08's 1 MiB, so this is comfortably within budget for note-scale writing.
 *
 * It recomputes on three signals: a document change, a selection change (a
 * construct reveals its raw source while the caret is inside it — see
 * `live-decorations.ts`), AND when the syntax tree itself advances. The last one
 * matters for a large document: CodeMirror parses incrementally and dispatches a
 * tree-advance transaction that changes neither the doc nor the selection, so
 * without it the regions parsed after the initial synchronous budget would stay
 * unstyled until the next edit.
 */

import { StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView, type DecorationSet } from "@codemirror/view";

import { buildLivePreviewDecorations } from "./live-decorations";

export function livePreview() {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDecorations(state);
    },
    update(value, tr) {
      if (
        tr.docChanged ||
        tr.selection ||
        syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ) {
        return buildLivePreviewDecorations(tr.state);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
