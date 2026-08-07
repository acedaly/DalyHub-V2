/**
 * NOTES-05 — the shared writing-first Markdown editor (`~/shared/markdown-editor`).
 *
 * ONE primary editor across desktop and mobile that styles Markdown SOURCE as it
 * is typed (Obsidian-style live preview), built on CodeMirror 6 but always
 * saving plain Markdown source — no rich-text document model, no second render
 * or sanitisation pipeline (the FND-08 `MarkdownContent` sink stays the only one).
 * Notes is the first consumer; the Diary entry body is the intended second.
 *
 * The pure Markdown-source transforms and the formatting-action catalogue are
 * re-exported here so a consumer needs a single import surface.
 */

export { LiveMarkdownEditor } from "./LiveMarkdownEditor";
export type { LiveMarkdownEditorProps } from "./LiveMarkdownEditor";
export { MarkdownEditorField } from "./MarkdownEditorField";
export type { MarkdownEditorFieldProps } from "./MarkdownEditorField";
export { EditorToolbar } from "./EditorToolbar";
export type {
  EditorToolbarProps,
  EditorToolbarCommand,
  EditorHistoryCommands,
} from "./EditorToolbar";
export {
  activeFormattingIds,
  NO_ACTIVE_FORMATTING,
  type ActiveFormattingId,
  type FormattingProbe,
} from "./formatting-state";
export { RecordLinkPicker } from "./RecordLinkPicker";
export type {
  RecordLinkPickerProps,
  RecordLinkOption,
} from "./RecordLinkPicker";
export {
  MARKDOWN_FORMATTING_ACTIONS,
  PRIMARY_FORMATTING_ACTIONS,
  SECONDARY_FORMATTING_ACTIONS,
  FORMATTING_GROUP_ORDER,
  type FormattingGroup,
  type MarkdownFormattingAction,
} from "./formatting-actions";
export { recordLinkTransform } from "./markdown-transforms";
export type {
  EditorSelection as MarkdownEditorSelection,
  EditorTransform as MarkdownEditorTransform,
  MarkdownTransform,
} from "./markdown-transforms";
export {
  DEFAULT_EDITOR_VIEW_MODE,
  EDITOR_VIEW_MODES,
  editorViewModeLabel,
  otherEditorViewMode,
  type EditorViewMode,
} from "./editor-view-mode";
