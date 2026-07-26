/**
 * NOTES-05 — the writing editor's view-mode model (pure, React-free).
 *
 * NOTES-05 retires the NOTES-01C desktop Source/Split/Preview complexity as the
 * PRIMARY interaction. There is now exactly ONE writing surface — the live
 * editor, where the document is styled as it is typed — plus an optional,
 * unobtrusive **Read** mode that renders the note fully through the one FND-08
 * pipeline for a distraction-free read. That is the whole model: two modes, no
 * split, no persistent raw-source pane.
 *
 * Keeping it a pure two-value model (rather than an ad-hoc boolean in the
 * component) means the "what is offered / what is selected" logic is unit
 * tested in isolation and identical on every viewport — the live editor is the
 * one primary editor on both desktop and mobile (there is no wide-only Split to
 * degrade any more).
 */

/** The two editor view modes. `write` is the live editor; `read` is the
 * unobtrusive full FND-08 render. */
export type EditorViewMode = "write" | "read";

/** The default mode — always the live writing surface. */
export const DEFAULT_EDITOR_VIEW_MODE: EditorViewMode = "write";

/** The modes offered, in toggle order. Both are always available on every
 * viewport (unlike the old wide-only Split), because the live editor is the
 * one primary editor everywhere. */
export const EDITOR_VIEW_MODES: readonly EditorViewMode[] = ["write", "read"];

/** The other mode — the toggle target from `mode`. */
export function otherEditorViewMode(mode: EditorViewMode): EditorViewMode {
  return mode === "write" ? "read" : "write";
}

/** A stable human label for a mode (also the accessible name of its control). */
export function editorViewModeLabel(mode: EditorViewMode): string {
  return mode === "write" ? "Write" : "Read";
}
