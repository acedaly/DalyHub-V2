/**
 * DS-16 — the shared inline-editing system.
 *
 * ONE state machine, ONE read affordance and four typed fields, so that "change
 * this value where it is shown" behaves identically in every module instead of
 * being reinvented per surface. Import from here.
 *
 * Every field takes an `onSave` that MUST post to the owning module's trusted
 * server action. Nothing in this package touches storage, and nothing in it may
 * bypass a domain rule: authentication, workspace scoping, validation,
 * relationship constraints and Activity all stay exactly where they were
 * (AGENTS.md §17).
 */

export {
  inlineEditReducer,
  initialInlineEditState,
  inlineEditDraft,
  isInlineEditing,
  type InlineEditAction,
  type InlineEditState,
  type InlineSaveOutcome,
} from "./inline-edit-model";
export { useInlineEdit } from "./use-inline-edit";
export type { UseInlineEdit, UseInlineEditOptions } from "./use-inline-edit";
export { useAnchoredAlignment } from "./use-anchored-alignment";
export type { AnchoredAlignment } from "./use-anchored-alignment";
export { InlineEditShell } from "./InlineEditShell";
export type { InlineEditShellProps } from "./InlineEditShell";
export { InlineTextField } from "./InlineTextField";
export type { InlineTextFieldProps } from "./InlineTextField";
export { InlineMarkdownField } from "./InlineMarkdownField";
export type { InlineMarkdownFieldProps } from "./InlineMarkdownField";
export { InlineSelectField } from "./InlineSelectField";
export type {
  InlineSelectFieldProps,
  InlineSelectOption,
} from "./InlineSelectField";
export { InlineDateField } from "./InlineDateField";
export type { InlineDateFieldProps } from "./InlineDateField";
