/**
 * UNTITLED-14 — the shared INLINE ADD row: the last row of a list, not a form.
 *
 * A list of short lines — a meeting's agenda, its decisions, its outcomes — is
 * added to by typing into it. This is that row: a quiet "＋ Add {noun}" control
 * that becomes a text field IN PLACE, saves on Enter, and then **stays open and
 * focused for the next one**. Type, Enter, type, Enter. Escape or a blur on an
 * empty field closes it again.
 *
 * ── Why this exists next to `InlineCaptureRow` ──────────────────────────────
 *
 * `~/shared/task-record/InlineCaptureRow` is the same INTERACTION and is
 * deliberately not this: it parses the quick-capture grammar, resolves a
 * destination, and posts to the canonical `/tasks/new` — it is the Task
 * capture row and must stay one. This is the generic one for a list whose rows
 * are a line of text and whose authority is its own module's route. The
 * interaction contract is copied from it on purpose, so a burst of five agenda
 * items costs the same five titles and five Enters as a burst of five tasks.
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 *
 * A Meeting record drew FOUR disclosure forms — a visible label, a text field
 * and an Add button per band — which is four forms to manage rather than four
 * lists to add to. §E of the redesign brief names the shape to move away from:
 * `Add → modal → form → Save → close → return`. The saving path, the optimistic
 * behaviour and the failure contract are unchanged; what changes is that the
 * control is the list's own last row and that saving does not close it.
 *
 * ── Failure ─────────────────────────────────────────────────────────────────
 *
 * DS-06, the same contract as the Task capture row: entered text is NEVER
 * discarded on a failed save, the error is shown inline and announced, and the
 * field keeps focus so a retry is one keystroke away.
 */

import { useCallback, useId, useRef, useState } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

export interface InlineAddRowProps {
  /**
   * The noun, lower case and singular — "agenda item", "decision". It names the
   * control ("Add agenda item"), the field ("New agenda item") and the
   * announcement, so four of these on one record are told apart by a screen
   * reader.
   */
  readonly noun: string;
  /**
   * Persist one line. Resolve `true` on success — the field clears and stays
   * open; resolve `false` and the text is kept exactly as typed.
   */
  readonly onAdd: (body: string) => Promise<boolean>;
  /** The surface's own polite announcer, where it has one. */
  readonly announce?: (message: string) => void;
  readonly className?: string;
  readonly inputTestId?: string;
}

export function InlineAddRow({
  noun,
  onAdd,
  announce,
  className,
  inputTestId,
}: InlineAddRowProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setBody("");
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    const value = body.trim();
    if (value.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onAdd(value);
    setSaving(false);
    if (ok) {
      // Cleared, still open, still focused: the next one costs one line.
      setBody("");
      announce?.(`Added ${noun}.`);
      fieldRef.current?.focus();
    } else {
      setError(
        `Couldn’t add that ${noun}. Your text is still here — try again.`,
      );
      fieldRef.current?.focus();
    }
  }, [announce, body, noun, onAdd, saving]);

  if (!open) {
    return (
      <button
        type="button"
        className={cx(
          /*
           * A ROW, not a button: full width, the list's own padding, a hover
           * wash and a hairline above it from the list's divider. It reads as
           * the place the next line goes rather than as a control parked under
           * the list. The 44px floor applies on a coarse pointer, where this is
           * the thing a thumb lands on during a live meeting.
           */
          "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-tertiary outline-focus-ring transition duration-100 ease-linear",
          "[@media(hover:none)]:min-h-[var(--app-touch-target-min)] hover:bg-secondary hover:text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2",
          className,
        )}
        onClick={() => {
          setOpen(true);
          // The field is the point of pressing this, so focus lands in it.
          requestAnimationFrame(() => fieldRef.current?.focus());
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Add {noun}
      </button>
    );
  }

  return (
    <form
      className={cx("flex w-full flex-col gap-1 px-4 py-2", className)}
      aria-label={`Add ${noun}`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        ref={fieldRef}
        type="text"
        name="body"
        value={body}
        disabled={saving}
        data-testid={inputTestId}
        aria-label={`New ${noun}`}
        aria-invalid={error !== null || undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={`Type and press Enter…`}
        className={cx(
          /*
           * No box. The field takes the ROW's geometry — same padding, same
           * type, same baseline — so pressing "Add agenda item" looks like the
           * row turning into a field rather than a form opening under the list.
           */
          "w-full border-0 bg-transparent p-0 text-sm text-primary outline-hidden placeholder:text-placeholder",
          "[@media(hover:none)]:min-h-[var(--app-touch-target-min)]",
        )}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onBlur={() => {
          // A field left empty is a field nobody wanted; one with text in it is
          // kept, so a mis-click never loses a line.
          if (body.trim().length === 0 && !saving) close();
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-xs text-error-primary">
          {error}
        </p>
      ) : null}
    </form>
  );
}
