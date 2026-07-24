/**
 * NOTES-01C — the Note editor's view-mode model (pure, React-free).
 *
 * The desktop editor offers Source / Split / Preview. Split needs two columns
 * of real width to be worth anything — squeezed onto a narrow viewport it
 * would double the visible document length instead of helping (spec §E: "No
 * desktop split-pane squeezed onto a phone"). This module is the single,
 * pure place that decides what is actually offered/selected for a given
 * viewport, so the component only wires it to `matchMedia` and never
 * re-derives the rule.
 */

export type NoteEditorViewMode = "source" | "split" | "preview";

/** The DS-01 `md` breakpoint (48rem = 768px) — matches the Inspector's own
 * compact-viewport threshold (`~/shared/inspector/use-compact-viewport.ts`),
 * so "wide enough for two columns" is judged consistently across the app. */
export const NOTE_EDITOR_WIDE_QUERY = "(min-width: 48rem)";

/** View modes actually offered at this width. Split is omitted (not merely
 * disabled) below the breakpoint — there is no benefit to advertising a mode
 * that immediately falls back. */
export function availableNoteEditorViewModes(
  isWide: boolean,
): readonly NoteEditorViewMode[] {
  return isWide ? ["source", "split", "preview"] : ["source", "preview"];
}

/**
 * The EFFECTIVE view mode for a desired selection at this width: Split
 * degrades to Source (the canonical, editable mode) the moment the viewport
 * is too narrow to show it usefully — e.g. the window is resized, or a
 * selection restored from a previous wide session is applied on a phone.
 * Source and Preview are always available and pass through unchanged.
 */
export function resolveNoteEditorViewMode(
  desired: NoteEditorViewMode,
  isWide: boolean,
): NoteEditorViewMode {
  if (desired === "split" && !isWide) {
    return "source";
  }
  return desired;
}
