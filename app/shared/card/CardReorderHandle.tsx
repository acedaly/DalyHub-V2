/**
 * DS-04 — the accessible reorder handle.
 *
 * A real `<button>` (keyboard-operable, focusable, with an accessible name) that
 * initiates a reorder by pointer or keyboard. Presentational only — all behaviour
 * comes from the `handleProps` that `ReorderableCardCollection` supplies; spread
 * them onto this component. The grip glyph is decorative; the button is named by
 * its `aria-label`.
 */

import type { ButtonHTMLAttributes } from "react";

export type CardReorderHandleProps = ButtonHTMLAttributes<HTMLButtonElement>;

function GripGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5.5" cy="3" r="1.3" fill="currentColor" />
      <circle cx="10.5" cy="3" r="1.3" fill="currentColor" />
      <circle cx="5.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="5.5" cy="13" r="1.3" fill="currentColor" />
      <circle cx="10.5" cy="13" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function CardReorderHandle({
  className,
  type,
  children,
  ...rest
}: CardReorderHandleProps) {
  return (
    <button
      type={type ?? "button"}
      className={["dh-card__reorder-handle", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children ?? <GripGlyph />}
    </button>
  );
}
