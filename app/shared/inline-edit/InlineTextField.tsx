/**
 * DS-16 — inline PLAIN text, single-line or multi-line.
 *
 * The single-line interaction is the conventional one, and conventional is the
 * point: click (or Enter/Space) the value to edit, Enter to save, Escape to
 * cancel, blur to save. That is what a Gmail subject, a Todoist task name and a
 * Docs title all do, and DalyHub had three different answers before this
 * component existed.
 *
 * Enter saves in the SINGLE-LINE form and only there. A single-line field has no
 * other use for the key, whereas in a multiline field Enter is a paragraph and
 * hijacking it costs the user their text.
 *
 * Blur saves rather than cancels, for the same reason autosave exists: clicking
 * away from a field you have just typed into is not "discard that". A failed
 * save keeps the editor open with the text intact, so nothing is lost either
 * way.
 *
 * ── The multiline form (EDIT-02) ─────────────────────────────────────────────
 * Some values are prose but NOT Markdown — a Goal's definition of done is stored
 * and rendered as plain text with its line breaks preserved. Sending those
 * through `InlineMarkdownField` would offer a formatting toolbar for syntax the
 * field does not store, which is the "a control that silently does nothing"
 * defect in another costume; sending them through a single-line input would
 * throw away the line breaks the data model keeps. So this component grows a
 * `multiline` form that shares the same state machine, the same read affordance
 * and the same failure behaviour, and differs only where a paragraph forces it
 * to:
 *
 *   - Enter inserts a newline; ⌘/Ctrl+Enter saves;
 *   - explicit **Save** and **Cancel** controls, because there is no single key
 *     that can mean "done" here;
 *   - blur does NOT save — a multiline editor is tall enough that clicking
 *     inside the page while thinking is ordinary, and a mid-thought autosave
 *     would write a half-finished paragraph and close the editor under the user;
 *   - Escape cancels only while the draft still equals the stored value, so a
 *     stray Escape can never discard typed words (the same rule
 *     `InlineMarkdownField` follows, for the same reason).
 */

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlineTextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onSave: (next: string) => Promise<InlineSaveOutcome>;
  readonly emptyLabel?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly variant?: "text" | "heading";
  /** Maximum characters accepted by the control (the server still decides). */
  readonly maxLength?: number;
  /**
   * Edit as a multi-line plain-text area (line breaks preserved) with explicit
   * Save/Cancel, instead of a single-line input. See the note above.
   */
  readonly multiline?: boolean;
  /** Rows for the multiline editor. Ignored in the single-line form. */
  readonly rows?: number;
  /** DHDS-10 — how loud the field is at rest. See {@link InlineEditShell}. */
  readonly presentation?: "default" | "meta";
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function InlineTextField({
  label,
  value,
  onSave,
  emptyLabel,
  placeholder,
  readOnly = false,
  variant = "text",
  maxLength,
  multiline = false,
  rows = 5,
  presentation = "default",
  className,
  "data-testid": testId,
}: InlineTextFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const errorId = `${useId()}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus is moved imperatively rather than with the `autoFocus` attribute. The
  // attribute grabs focus on page LOAD, which is the behaviour that makes it an
  // accessibility problem; this only runs when the user has just asked to edit,
  // where landing the caret in the field is the whole point.
  useEffect(() => {
    if (!field.editing) return;
    if (multiline) areaRef.current?.focus();
    else inputRef.current?.focus();
  }, [field.editing, multiline]);

  const onSingleLineKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      field.submit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      // Stop here: an Escape meant for this field must not also close an
      // enclosing Drawer (DS-11 — the top layer handles the key).
      event.stopPropagation();
      field.cancel();
    }
  };

  const onMultilineKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      field.submit();
      return;
    }
    if (event.key === "Escape" && field.draft === value) {
      event.preventDefault();
      event.stopPropagation();
      field.cancel();
    }
  };

  const editor = multiline ? (
    <div className="dh-inline-edit__composer">
      <textarea
        className="dh-inline-edit__input dh-inline-edit__textarea"
        aria-label={label}
        value={field.draft}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={field.pending}
        aria-invalid={field.error ? true : undefined}
        aria-errormessage={field.error ? errorId : undefined}
        ref={areaRef}
        spellCheck
        onChange={(event) => field.change(event.target.value)}
        onKeyDown={onMultilineKeyDown}
      />
      <div className="dh-inline-edit__actions">
        <button
          type="button"
          className="dh-btn dh-btn--primary dh-btn--sm"
          disabled={field.pending}
          onClick={() => field.submit()}
        >
          {field.pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-btn--sm"
          disabled={field.pending}
          onClick={field.cancel}
        >
          Cancel
        </button>
        <span className="dh-inline-edit__hint">⌘/Ctrl + Enter to save</span>
      </div>
    </div>
  ) : (
    <input
      type="text"
      className="dh-inline-edit__input"
      aria-label={label}
      value={field.draft}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={field.pending}
      aria-invalid={field.error ? true : undefined}
      aria-errormessage={field.error ? errorId : undefined}
      ref={inputRef}
      onChange={(event) => field.change(event.target.value)}
      onKeyDown={onSingleLineKeyDown}
      // Blur saves rather than cancels — clicking away from text you just
      // typed is not "discard that". But it must NOT restore focus when the
      // save lands: the user has already Tabbed or clicked somewhere else,
      // and yanking focus back would drag them out of their destination and
      // send the next Tab backwards.
      //
      // A save already in flight is also not re-submitted by the blur its
      // own disabled state causes.
      onBlur={() => {
        if (!field.pending) field.submit(undefined, { restoreFocus: false });
      }}
    />
  );

  return (
    <InlineEditShell
      label={label}
      valueText={value}
      isEmpty={value.trim().length === 0}
      emptyLabel={emptyLabel}
      editing={field.editing}
      onActivate={field.begin}
      triggerRef={field.triggerRef}
      pending={field.pending}
      error={field.error}
      errorId={errorId}
      readOnly={readOnly}
      variant={variant}
      presentation={presentation}
      multiline={multiline}
      className={className}
      data-testid={testId}
      editor={editor}
    >
      {value}
    </InlineEditShell>
  );
}
