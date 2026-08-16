/**
 * REDESIGN-04 — the ONE collection search field.
 *
 * `mockup3.png` puts search in the Projects header band, beside the primary
 * action, and the same control belongs on every collection that filters by
 * typing. Before this pass five modules (Assets, Meetings, Notes, People,
 * Reviews) each hand-rolled the same `<label class="dh-field"><span
 * class="dh-visually-hidden">…<input type="search">` with their own wrapper
 * class, their own placeholder grammar and their own reset behaviour — five
 * copies of one control, which is exactly the per-module fork §10.5 forbids.
 *
 * What it owns, so no caller has to decide it again:
 *
 *   - the leading magnifier, decorative, inside the field;
 *   - a REAL accessible name (visually hidden), so the placeholder is a hint
 *     rather than the only label;
 *   - a Clear button that appears only when there is something to clear, and
 *     returns focus to the input — a filtered collection can always be
 *     un-filtered from the control that filtered it;
 *   - Escape clears, which is the behaviour a `type="search"` announces;
 *   - a 44px effective target on coarse pointers (REDESIGN-03 debt item 6 is a
 *     `.dh-btn` defect; nothing new in this scope may inherit it).
 *
 * ── The phone composition ───────────────────────────────────────────────────
 * `mockup3.png`'s handset frame draws search as an ICON beside the add button,
 * not as a field: at 390px a permanent search box costs a whole row above the
 * first record, which is the exact expense REDESIGN-03 spent its Today pass
 * removing. So on a phone the control is a toggle that reveals the field on its
 * own row and moves focus into it, and on desktop the field is simply always
 * there.
 *
 * Both are RENDERED, and which one shows is pure CSS — correct on the first
 * server byte, with no viewport sniffing and no hydration mismatch, exactly as
 * `CollectionLayout` already swaps its desktop filter bar for the phone control
 * sheet. The only JavaScript is one boolean and a `focus()`. A field with a
 * query in it stays open at every width: a narrowed collection must never hide
 * the control that narrowed it.
 *
 * Deliberately UNCONTROLLED-friendly: it takes `value` + `onChange` so a caller
 * can debounce or push to the URL as it already does. It performs no fetching,
 * owns no query state and knows nothing about entities.
 */

import { useId, useRef, useState } from "react";

import { SearchIcon, CloseIcon } from "~/shared/icons";

export type CollectionSearchFieldProps = {
  /** The current query text. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /**
   * The control's accessible name — "Search projects". Always supplied, always
   * visually hidden: the band has no room for a visible label and the
   * placeholder is not one.
   */
  readonly label: string;
  /** The in-field hint. Defaults to the label, so a caller can pass only one. */
  readonly placeholder?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function CollectionSearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
  "data-testid": testId,
}: CollectionSearchFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const hasQuery = value.length > 0;
  // A narrowed collection always shows the control that narrowed it, at every
  // width — a hidden filter that cannot be seen cannot be cleared.
  const open = phoneOpen || hasQuery;

  return (
    <div
      className={["dh-csearch", className].filter(Boolean).join(" ")}
      data-open={open ? "true" : undefined}
      data-testid={testId}
    >
      {/*
       * The phone affordance. Hidden at every width the field is permanent at,
       * so desktop assistive tech never meets a second control for one job.
       */}
      <button
        type="button"
        ref={toggleRef}
        className="dh-csearch__toggle"
        aria-expanded={open}
        onClick={() => {
          setPhoneOpen(true);
          // The field is revealed by the same state change, so focus has to wait
          // for it to exist.
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <span className="dh-visually-hidden">{label}</span>
        <SearchIcon />
      </button>
      <div className="dh-csearch__field">
        <label className="dh-visually-hidden" htmlFor={inputId}>
          {label}
        </label>
        <span className="dh-csearch__icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          id={inputId}
          ref={inputRef}
          className="dh-csearch__input"
          type="search"
          value={value}
          placeholder={placeholder ?? label}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (hasQuery) {
                // Stop the key here: an Escape that clears the field must not
                // also close the drawer or sheet the collection may sit under.
                event.stopPropagation();
                onChange("");
              } else if (phoneOpen) {
                event.stopPropagation();
                setPhoneOpen(false);
                // Focus goes back to the control that opened the field, never
                // to the top of the document.
                toggleRef.current?.focus();
              }
            }
          }}
        />
        {hasQuery ? (
          <button
            type="button"
            className="dh-csearch__clear"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <span className="dh-visually-hidden">{`Clear ${label.toLowerCase()}`}</span>
            <CloseIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
