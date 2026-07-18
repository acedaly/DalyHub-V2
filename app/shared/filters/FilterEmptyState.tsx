/**
 * DS-07 — the filtered-empty vs genuinely-empty state.
 *
 * A collection with active filters that matches nothing is DIFFERENT from a
 * collection that has no records at all: the former offers a clear-filters
 * recovery (no dead end), the latter teaches the next action. A minimal shared
 * state so consumers render the correct one; richer empty states arrive with
 * DS-10.
 */

import type { ReactNode } from "react";

interface FilterEmptyStateProps {
  /** `filtered` shows a clear-filters recovery; `empty` is a genuinely empty set. */
  readonly variant: "filtered" | "empty";
  readonly title: string;
  readonly description?: ReactNode;
  /** Recovery action for the filtered-empty case. */
  readonly onClearFilters?: () => void;
  readonly children?: ReactNode;
}

export function FilterEmptyState({
  variant,
  title,
  description,
  onClearFilters,
  children,
}: FilterEmptyStateProps) {
  return (
    <div className="dh-filter-empty" data-variant={variant} role="status">
      <p className="dh-filter-empty__title">{title}</p>
      {description ? (
        <p className="dh-filter-empty__description">{description}</p>
      ) : null}
      {variant === "filtered" && onClearFilters ? (
        <button
          type="button"
          className="dh-filter-btn dh-filter-btn--secondary"
          onClick={onClearFilters}
        >
          Clear all filters
        </button>
      ) : null}
      {children}
    </div>
  );
}
