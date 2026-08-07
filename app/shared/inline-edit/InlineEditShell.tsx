/**
 * DS-16 — the read affordance and the editing frame every inline field shares.
 *
 * ── The discoverability rule ─────────────────────────────────────────────────
 * A pencil icon beside every value is the lazy answer: it doubles the number of
 * controls, it puts a permanent piece of chrome next to text that is usually
 * just being read, and it still teaches nothing about which values are editable
 * because it is beside all of them. DalyHub's answer is the FIELD ITSELF:
 *
 *   - the value is a real `<button>`, so it is reachable, activatable and
 *     announced as a control on every input device — not a `div` with a click
 *     handler that a keyboard user can never reach;
 *   - pointer devices get a restrained hover container (a state layer, not a
 *     border) and keyboard users get the SAME treatment on `:focus-visible`, so
 *     the affordance is never hover-only (AGENTS.md §15);
 *   - an EMPTY value renders its invitation ("Add a description") rather than
 *     an invisible target, because a zero-height button is not discoverable by
 *     anyone;
 *   - a READ-ONLY value renders as plain text with no container, no hover and no
 *     tab stop. A value that cannot be changed must not look like one that can.
 *
 * ── The one place an explicit Edit control IS right ──────────────────────────
 * `variant="block"` — rendered long-form content. Two reasons the value cannot
 * be the button there, and both are hard:
 *
 *   1. rendered Markdown contains block elements and its own LINKS. Nesting
 *      `<p>` and `<a>` inside a `<button>` is invalid HTML and produces exactly
 *      the "nested interactive element" defect this upgrade is meant to remove
 *      — the link becomes unclickable and the button unannounceable;
 *   2. a paragraph of prose is something people click INTO to select text.
 *      Turning that gesture into "open the editor" fights the user.
 *
 * So a block field renders its content plainly and offers one small, permanently
 * visible **Edit** control named for its field ("Edit description"). It is not
 * hover-revealed and it is not a bare pencil next to every value — it is the
 * single case where the field would otherwise look misleadingly static.
 * An EMPTY block skips it: the invitation is the button.
 *
 * ── What the shell does not do ───────────────────────────────────────────────
 * It holds no draft, performs no save and knows no field type. Those belong to
 * `useInlineEdit` and to the typed fields built on it.
 */

import type { ReactNode, RefObject } from "react";

import { EditIcon } from "~/shared/icons";

export interface InlineEditShellProps {
  /**
   * The field's name — "Title", "Status", "Due date". It is the accessible name
   * of the read affordance and the prefix of the announced value, so a screen
   * reader user hears "Status, Active, edit" rather than a bare "Active".
   */
  readonly label: string;
  /** The stored value, rendered when not editing. */
  readonly children?: ReactNode;
  /** Plain-text form of the value, for the affordance's accessible name. */
  readonly valueText?: string;
  /** The invitation shown (and announced) when the value is empty. */
  readonly emptyLabel?: string;
  /** True when the stored value is absent. */
  readonly isEmpty?: boolean;
  /** True while the editor is open — the shell renders `editor` instead. */
  readonly editing: boolean;
  /** The editing surface, rendered in place of the read affordance. */
  readonly editor?: ReactNode;
  /** Enter editing. Fired by click, Enter and Space on the affordance. */
  readonly onActivate?: () => void;
  /** Attach the affordance so the hook can return focus to it. */
  readonly triggerRef?: RefObject<HTMLElement | null>;
  /**
   * Extra ARIA for the read affordance, for a field whose editor is an anchored
   * popover rather than an inline control — the menu-button pattern needs
   * `aria-haspopup`/`aria-expanded`/`aria-controls` ON THE TRIGGER, and the
   * trigger belongs to this component.
   */
  readonly triggerProps?: {
    readonly id?: string;
    readonly "aria-haspopup"?: "menu" | "dialog";
    readonly "aria-expanded"?: boolean;
    readonly "aria-controls"?: string;
  };
  /** A save is in flight — a subtle pending cue, never a blocking spinner. */
  readonly pending?: boolean;
  /** The refusal message from the last failed save. */
  readonly error?: string | null;
  /** Identifier for the error message, so the editor can point `aria-errormessage` at it. */
  readonly errorId?: string;
  /**
   * Render as plain, non-interactive text. Used for a value the current user or
   * the current record state cannot change (an archived Area is read-only).
   */
  readonly readOnly?: boolean;
  /** Visual treatment. `heading` inherits the record title's typography. */
  readonly variant?: "text" | "heading" | "block";
  /**
   * The stored value keeps its line breaks, so the READ state must too. Without
   * this a two-paragraph plain-text value collapses into one run-on line at
   * rest and re-splits the moment the editor opens, which reads as data loss.
   */
  readonly multiline?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function InlineEditShell({
  label,
  children,
  valueText,
  emptyLabel,
  isEmpty = false,
  editing,
  editor,
  onActivate,
  triggerRef,
  triggerProps,
  pending = false,
  error = null,
  errorId,
  readOnly = false,
  variant = "text",
  multiline = false,
  className,
  "data-testid": testId,
}: InlineEditShellProps) {
  const classes = ["dh-inline-edit", className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      data-variant={variant}
      data-multiline={multiline ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      data-invalid={error ? "true" : undefined}
      data-testid={testId}
    >
      {editing ? (
        editor
      ) : readOnly ? (
        // No button, no tab stop, no hover container: a read-only value is text.
        <span className="dh-inline-edit__static">
          {isEmpty ? (
            <span className="dh-inline-edit__empty-static">—</span>
          ) : (
            children
          )}
        </span>
      ) : variant === "block" && !isEmpty ? (
        <div className="dh-inline-edit__block">
          <div className="dh-inline-edit__block-content">{children}</div>
          <button
            type="button"
            ref={(node) => {
              if (triggerRef) triggerRef.current = node;
            }}
            className="dh-inline-edit__edit"
            onClick={onActivate}
          >
            <EditIcon />
            {`Edit ${label.toLocaleLowerCase()}`}
          </button>
        </div>
      ) : (
        <button
          type="button"
          ref={(node) => {
            if (triggerRef) triggerRef.current = node;
          }}
          className="dh-inline-edit__trigger"
          data-empty={isEmpty ? "true" : undefined}
          {...triggerProps}
          // The name is "<field>: <value>" so the control announces WHICH field
          // it edits — "Active" alone tells a screen-reader user nothing about
          // what pressing it would change.
          aria-label={
            isEmpty
              ? `${label}: ${emptyLabel ?? "not set"}`
              : `${label}: ${valueText ?? ""}`
          }
          onClick={onActivate}
        >
          <span className="dh-inline-edit__value">
            {isEmpty ? (
              <span className="dh-inline-edit__empty">
                {emptyLabel ?? "Not set"}
              </span>
            ) : (
              children
            )}
          </span>
        </button>
      )}

      {/*
       * The pending and error slots are OUTSIDE the branch above so their live
       * region is not destroyed and recreated on every transition — a live
       * region that unmounts as it gains content announces nothing.
       */}
      <span className="dh-inline-edit__status" aria-live="polite">
        {pending ? (
          <span className="dh-inline-edit__pending">Saving…</span>
        ) : null}
      </span>
      {error ? (
        <p className="dh-inline-edit__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
