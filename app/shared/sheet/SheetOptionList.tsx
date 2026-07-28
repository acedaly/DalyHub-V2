/**
 * MOBILE-01 — the large labelled option rows a phone sheet offers.
 *
 * The shared presentation for "pick one of a few things" inside a {@link Sheet}:
 * the Quick Capture chooser (Task / Diary entry / Meeting / Note) and the mobile
 * collection sheet's sort and density choices all render through it, so a phone
 * choice looks and behaves the same everywhere.
 *
 * Each row is a real `button` with a visible text label beside its entity icon —
 * never an unlabelled glyph — and meets the 44px target by construction. Selection
 * is conveyed by `aria-pressed` plus a check mark and weight, never by colour
 * alone (AGENTS.md §15).
 */

import type { ReactNode } from "react";

import { CheckIcon } from "~/shared/icons";

export type SheetOptionListProps = {
  /** The accessible name of the group of choices. */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export function SheetOptionList({
  label,
  children,
  className,
}: SheetOptionListProps) {
  return (
    <div
      className={["dh-sheet-options", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export type SheetOptionProps = {
  /** The visible, always-present label. */
  readonly label: string;
  /** Optional one-line explanation beneath the label. */
  readonly description?: string;
  /** A decorative leading glyph (the label carries the meaning). */
  readonly icon?: ReactNode;
  /** Whether this option is currently chosen. */
  readonly selected?: boolean;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly "data-testid"?: string;
};

export function SheetOption({
  label,
  description,
  icon,
  selected = false,
  onSelect,
  disabled,
  ...rest
}: SheetOptionProps) {
  return (
    <button
      type="button"
      className="dh-sheet-option"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      data-testid={rest["data-testid"]}
    >
      {icon ? (
        <span className="dh-sheet-option__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="dh-sheet-option__text">
        <span className="dh-sheet-option__label">{label}</span>
        {description ? (
          <span className="dh-sheet-option__description">{description}</span>
        ) : null}
      </span>
      {/* Selection is shape + weight + aria-pressed, never colour alone. */}
      <span className="dh-sheet-option__check" aria-hidden="true">
        {selected ? <CheckIcon /> : null}
      </span>
    </button>
  );
}
