/**
 * DS-16 / DHDS-10 — the shared inline-editing system.
 *
 * ONE state machine, ONE read affordance and four typed fields, so that "change
 * this value where it is shown" behaves identically in every module instead of
 * being reinvented per surface. Import from here.
 *
 * | Field | The choice it makes | The surface it opens |
 * |---|---|---|
 * | `InlineTextField`   | a short line of text   | an input, in place |
 * | `InlineSelectField` | one of a CLOSED set    | DHDS-09 `Menu`     |
 * | `InlinePickerField` | one record out of many | DHDS-09 `Picker`   |
 * | `InlineDateField`   | a calendar day         | DHDS-09 `Popover`  |
 *
 * DHDS-10 added `InlinePickerField` and the `presentation` axis. Everything
 * else is DS-16 as it was.
 *
 * ── `presentation` — the rule that keeps this from becoming a spreadsheet ────
 * `default` draws the value, its caret and its empty invitation: a record's
 * summary is a handful of facts the owner came to look at.
 *
 * `meta` is for a field in a RUN of values being scanned — a collection row, a
 * record's context line, a card's meta line. The value stays and the
 * affordances join the DHDS-08 row reveal, so a fifty-row list carries no
 * chevrons and no column of "Not set" at rest. Pass it wherever the field is
 * metadata rather than the point of the screen.
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
export { InlineEditShell } from "./InlineEditShell";
export type { InlineEditShellProps } from "./InlineEditShell";
export { InlineTextField } from "./InlineTextField";
export type { InlineTextFieldProps } from "./InlineTextField";
export { InlineSelectField } from "./InlineSelectField";
export type {
  InlineSelectFieldProps,
  InlineSelectOption,
} from "./InlineSelectField";
export { InlinePickerField } from "./InlinePickerField";
export type { InlinePickerFieldProps } from "./InlinePickerField";
export { InlineDateField } from "./InlineDateField";
export type {
  InlineDateFieldProps,
  InlineDateShortcut,
} from "./InlineDateField";
