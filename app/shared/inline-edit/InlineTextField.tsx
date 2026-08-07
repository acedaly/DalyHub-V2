/**
 * DS-16 — inline SINGLE-LINE text.
 *
 * The interaction is the conventional one, and conventional is the point: click
 * (or Enter/Space) the value to edit, Enter to save, Escape to cancel, blur to
 * save. That is what a Gmail subject, a Todoist task name and a Docs title all
 * do, and DalyHub had three different answers before this component existed.
 *
 * Enter saves here — and ONLY here. A single-line field has no other use for the
 * key, whereas in a multiline field Enter is a newline and hijacking it costs
 * the user paragraphs (see `InlineMarkdownField`).
 *
 * Blur saves rather than cancels, for the same reason autosave exists: clicking
 * away from a field you have just typed into is not "discard that". A failed
 * save keeps the editor open with the text intact, so nothing is lost either
 * way.
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
  className,
  "data-testid": testId,
}: InlineTextFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const errorId = `${useId()}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus is moved imperatively rather than with the `autoFocus` attribute. The
  // attribute grabs focus on page LOAD, which is the behaviour that makes it an
  // accessibility problem; this only runs when the user has just asked to edit,
  // where landing the caret in the field is the whole point.
  useEffect(() => {
    if (field.editing) inputRef.current?.focus();
  }, [field.editing]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
      className={className}
      data-testid={testId}
      editor={
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
          onKeyDown={onKeyDown}
          // Blur saves rather than cancels — clicking away from text you just
          // typed is not "discard that". But it must NOT restore focus when the
          // save lands: the user has already Tabbed or clicked somewhere else,
          // and yanking focus back would drag them out of their destination and
          // send the next Tab backwards.
          //
          // A save already in flight is also not re-submitted by the blur its
          // own disabled state causes.
          onBlur={() => {
            if (!field.pending)
              field.submit(undefined, { restoreFocus: false });
          }}
        />
      }
    >
      {value}
    </InlineEditShell>
  );
}
