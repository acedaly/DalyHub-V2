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

import { useRef, useState } from "react";

import { SearchLg, XClose } from "@untitledui/icons";

import { IconButton } from "~/shared/ui/IconButton";
import { Input as UntitledInput } from "~/shared/ui/untitled/base/input/input";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const hasQuery = value.length > 0;
  // A narrowed collection always shows the control that narrowed it, at every
  // width — a hidden filter that cannot be seen cannot be cleared.
  const open = phoneOpen || hasQuery;

  const clearOnEscape = (event: {
    key: string;
    stopPropagation: () => void;
  }) => {
    if (event.key !== "Escape") return;
    if (hasQuery) {
      // Stop the key here: an Escape that clears the field must not also close
      // the drawer or sheet the collection may sit under.
      event.stopPropagation();
      onChange("");
    } else if (phoneOpen) {
      event.stopPropagation();
      setPhoneOpen(false);
      // Focus goes back to the control that opened the field, never to the top
      // of the document.
      toggleRef.current?.focus();
    }
  };

  return (
    <div
      className={[
        "flex min-w-0 items-center gap-2",
        open ? "max-md:w-full" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-open={open ? "true" : undefined}
      data-testid={testId}
      data-untitled-source="base/input"
    >
      {/*
        UNTITLED-13 — the shared `IconButton`, not the vendored `ButtonUtility`
        directly.
        
        MEASURED: `meetings-people-shot.mjs` reported this control at **32×32**
        on a 393px phone with touch emulated, against DalyHub's 44px
        coarse-pointer floor. It is upstream's `h-max p-1.5` around a 20px
        glyph — right for a desktop toolbar, and exactly the case the shared
        `IconButton` was built for: its own note says "Untitled's desktop
        dimensions are not assumed sufficient" and it takes
        `--dh-control-height` in both axes for that reason.
        
        This is the PHONE reveal for search on every collection in the product
        — Meetings, Notes, Tasks, Projects, Areas, Goals, Habits, Assets — so it
        was the one control an owner reaches for on the device the floor exists
        for, four pixels short in each direction. Pre-existing since DS-02 and
        unrelated to this pass except that this pass is the one that measured
        it.
      */}
      <IconButton
        ref={toggleRef}
        icon={<SearchLg aria-hidden="true" />}
        label={label}
        tooltip
        variant="subtle"
        aria-expanded={open}
        className={["dh-csearch__toggle", open ? "hidden" : "md:hidden"]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          setPhoneOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      />
      <div
        className={[
          /*
           * A CAP, not a width.
           *
           * This was `md:w-64 md:flex-none lg:w-72`, which is a field that
           * refuses to shrink. On a collection that keeps its view switcher
           * INLINE with the header (Habits, Reviews), the header then carries a
           * title, a 288px field, a tab strip and a primary action on one row —
           * and at 1440px the field overflowed its own track and was drawn
           * underneath the switcher. Capping instead keeps the identical width
           * wherever there is room, and gives the row somewhere to take it from
           * where there is not.
           */
          "relative min-w-0 flex-1 md:max-w-64 lg:max-w-72",
          open ? "" : "max-md:hidden",
        ].join(" ")}
      >
        <UntitledInput
          ref={inputRef}
          size="sm"
          type="search"
          icon={SearchLg}
          aria-label={label}
          value={value}
          placeholder={placeholder ?? label}
          onChange={onChange}
          onKeyDown={clearOnEscape}
          inputClassName={
            hasQuery ? "dh-csearch__input pr-9" : "dh-csearch__input"
          }
        />
        {hasQuery ? (
          <button
            type="button"
            /*
             * Clear stays a 24px MARK inside the field — it cannot be 44px
             * without being taller than the control it sits in — but its hit
             * area takes the floor on a coarse pointer through the inset
             * `::after` the row links use, so a thumb gets 44px while the
             * drawn box stays where it belongs.
             */
            className="absolute inset-y-0 right-1.5 my-auto flex size-6 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <span className="sr-only">{`Clear ${label.toLowerCase()}`}</span>
            <XClose className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
