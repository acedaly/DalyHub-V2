/**
 * EDIT-02 — the shared writing surface, wearing a DS-06 field's clothes.
 *
 * The product had two long-form presentations: the live editor (Notes, Meetings,
 * Reviews) and a bare `<textarea>` with a "Show preview" disclosure (the Diary
 * body, a Task's description). Same Markdown, same storage, same renderer — two
 * different things to learn, and the one used for the DIARY, which is the second
 * most writing-heavy surface in DalyHub, was the poorer of the two.
 *
 * Unifying them is a PRESENTATION change, not a persistence change. The forms
 * that host this keep their own save semantics — the Diary edit panel still has
 * an explicit **Save changes** button and a dirty guard, Diary capture still
 * submits, a Note still autosaves — because §6 of the brief is right that
 * forcing every module onto one persistence strategy is a rewrite nobody asked
 * for. This component therefore does exactly one thing the editor could not do
 * on its own: wear the shared field ANATOMY (a real visible label row with the
 * required/optional cue, help text, an error slot) so it can stand in a
 * `<Form>` beside `TextField` and `SelectField` without looking like a
 * transplant.
 *
 * It is deliberately NOT in `~/shared/forms`: that package is imported by nearly
 * every route, and re-exporting the editor from it would pull the writing
 * surface into bundles that only ever render a text input.
 */

import { useId } from "react";

import type { BaseControlProps } from "~/shared/forms/control-props";

import { LiveMarkdownEditor } from "./LiveMarkdownEditor";

export interface MarkdownEditorFieldProps extends BaseControlProps<string> {
  /** Rows for the SSR/no-JS fallback surface. */
  readonly rows?: number;
  readonly placeholder?: string;
  /**
   * How much chrome the editor carries — see `LiveMarkdownEditor`. A field
   * inside a form is `compact` by default: the form already provides the frame,
   * and a comfortable editor would open half a screen for a two-line note.
   */
  readonly density?: "comfortable" | "compact";
  /**
   * DOC-EDITOR-01 — ⌘/Ctrl+Enter inside the writing surface.
   *
   * A form that hosts this field owns an explicit Save, and the keyboard path to
   * it should not require leaving the text. Hosts pass their submit; a field
   * whose host autosaves passes nothing.
   */
  readonly onCommit?: () => void;
}

export function MarkdownEditorField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required,
  disabled,
  readOnly,
  showOptionalCue = true,
  className,
  rows = 6,
  placeholder,
  density = "compact",
  onCommit,
}: MarkdownEditorFieldProps) {
  /*
   * The wrapper is NOT a second `role="group"`, and it does not name the editor.
   *
   * `LiveMarkdownEditor` already exposes the writing surface as a group named
   * for the field, and every surface inside it (the CodeMirror content, the
   * SSR fallback textarea) carries the same name. Wrapping that in another group
   * with the same name puts two identically-named containers in the
   * accessibility tree — indistinguishable to anyone navigating by name, and
   * caught by the first test written against this component. So the wrapper is
   * presentational: it carries the VISIBLE label row (whose words are the same
   * words the editor announces) and the field's data attributes, and the editor
   * owns the programmatic name.
   *
   * The label row still carries an id, unique per instance, so a host can point
   * at it — `id` is otherwise unusable here, because the editor does not accept
   * one for its writing surface.
   */
  const generatedId = useId();
  const labelId = `${id ?? `${generatedId}-markdown`}-label`;

  const rootClassName = ["dh-field", "dh-field--markdown-editor", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      data-invalid={Boolean(error) || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
      <div className="dh-field__label-row">
        <span id={labelId} className="dh-field__label-text">
          {label}
        </span>
        {required ? (
          <span className="dh-field__required">
            <span aria-hidden="true">*</span>
            <span className="dh-visually-hidden"> (required)</span>
          </span>
        ) : showOptionalCue ? (
          <span className="dh-field__optional">Optional</span>
        ) : null}
      </div>

      <LiveMarkdownEditor
        label={label}
        value={value}
        onChange={onChange}
        onBlur={onBlur ? () => onBlur() : undefined}
        // Never while the field cannot be typed in: a shortcut that fires from a
        // disabled control is the same lie as an enabled button that does
        // nothing.
        onCommit={onCommit && !disabled && !readOnly ? onCommit : undefined}
        help={help}
        error={error ?? null}
        placeholder={placeholder}
        rows={rows}
        density={density}
        toolbarLabel={`${label} formatting`}
        // A read-only field is as un-editable as a disabled one here: the
        // editor has one "you cannot type in this" state, and inventing a
        // second visual treatment for the distinction would teach nothing.
        disabled={disabled || readOnly}
      />
    </div>
  );
}
