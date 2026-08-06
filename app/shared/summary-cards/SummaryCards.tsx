/**
 * DS-13 — the ONE shared summary-card grid.
 *
 * A small, responsive grid of "one fact per card" tiles for a record's Summary:
 * a label, a value, an optional supporting detail, and an optional destination.
 * Projects, Areas and Assets each hand-rolled a variant of this shape before; this
 * is the shared pattern they converge on, so a new module never invents another
 * one (AGENTS.md §9.8, DEBT-01).
 *
 * Deliberate properties:
 *
 *   - **Semantics first.** The grid is a `<ul>` of list items, so assistive tech
 *     announces "list, N items" and the set is navigable as a group. When a card
 *     has a destination the whole card is ONE link — never a card wrapping a
 *     separate link, which would produce two tab stops for one target.
 *   - **Meaning is never colour.** `tone` only tints the value; the label always
 *     states what the number is.
 *   - **Touch-first.** Every card clears the shared 44px minimum target
 *     (`--app-control-height-lg`) at every width, and the grid reflows from one
 *     column upward with no horizontal scrolling (DS-11).
 *   - **No data fetching, no derivation.** Callers pass already-derived, already
 *     formatted values; this component only lays them out.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

/** The restrained tone vocabulary a summary value may carry. */
export type SummaryCardTone = "neutral" | "success" | "info";

/** One fact on the grid. */
export interface SummaryCardItem {
  readonly id: string;
  /** What the value is (always rendered — meaning never rests on the number). */
  readonly label: string;
  /** The already-formatted value. */
  readonly value: string;
  /** Optional supporting line beneath the value. */
  readonly detail?: string;
  /** Optional in-app destination; makes the whole card a single link. */
  readonly href?: string;
  /** Optional decorative leading glyph (always `aria-hidden` here). */
  readonly icon?: ReactNode;
  readonly tone?: SummaryCardTone;
  /**
   * An accessible-name override for a linked card. Defaults to
   * `"<label>: <value>"`, which is what a screen-reader user needs to hear
   * before following it.
   */
  readonly ariaLabel?: string;
}

export interface SummaryCardsProps {
  readonly items: readonly SummaryCardItem[];
  /** The list's accessible name. Required — an unlabelled group is a dead end. */
  readonly label: string;
  /** Use instead of `label` when a visible heading already names the group. */
  readonly labelledBy?: string;
  readonly className?: string;
}

function CardBody({ item }: { readonly item: SummaryCardItem }) {
  return (
    <>
      {item.icon ? (
        <span className="dh-summary-card__icon" aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      <span className="dh-summary-card__label">{item.label}</span>
      <span
        className="dh-summary-card__value"
        data-tone={item.tone ?? "neutral"}
      >
        {item.value}
      </span>
      {item.detail ? (
        <span className="dh-summary-card__detail">{item.detail}</span>
      ) : null}
    </>
  );
}

export function SummaryCards({
  items,
  label,
  labelledBy,
  className,
}: SummaryCardsProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul
      className={["dh-summary-cards", className].filter(Boolean).join(" ")}
      {...(labelledBy
        ? { "aria-labelledby": labelledBy }
        : { "aria-label": label })}
    >
      {items.map((item) => (
        <li key={item.id} className="dh-summary-cards__item">
          {item.href ? (
            <Link
              className="dh-summary-card dh-summary-card--link"
              to={item.href}
              aria-label={item.ariaLabel ?? `${item.label}: ${item.value}`}
            >
              <CardBody item={item} />
            </Link>
          ) : (
            <div className="dh-summary-card">
              <CardBody item={item} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
