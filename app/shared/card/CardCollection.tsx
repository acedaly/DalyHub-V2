/**
 * DS-04 — a plain (non-reorderable) collection container.
 *
 * Renders the SAME shared Card in a vertical list, a board column or a responsive
 * grid via one `presentation` prop — the component never changes, only its layout.
 * A labelled `<ul>`/`<li>` gives the collection list semantics without adding any
 * interactive wrapper around the cards. For reorderable collections use
 * `ReorderableCardCollection`.
 */

import type { ReactNode } from "react";

import type { CardDensity, CardPresentation } from "./types";

export interface CardCollectionProps<T> {
  readonly items: readonly T[];
  readonly getItemId: (item: T) => string;
  readonly renderCard: (item: T) => ReactNode;
  readonly ariaLabel: string;
  readonly presentation?: CardPresentation;
  readonly density?: CardDensity;
  readonly className?: string;
}

export function CardCollection<T>({
  items,
  getItemId,
  renderCard,
  ariaLabel,
  presentation = "list",
  density = "comfortable",
  className,
}: CardCollectionProps<T>) {
  const classes = [
    "dh-card-collection",
    `dh-card-collection--${presentation}`,
    `dh-card-collection--${density}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={classes} aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={getItemId(item)} className="dh-card-collection__item">
          {renderCard(item)}
        </li>
      ))}
    </ul>
  );
}
