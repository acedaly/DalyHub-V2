/**
 * PX-02 — the one shared Empty State.
 *
 * DESIGN_SYSTEM.md → Empty States requires that "nothing here yet" always teaches
 * the next action, and PRODUCT_EXPERIENCE #14 unifies the previously-forked empty
 * renderings (RecordContent's `emptySlot`, Filters' `FilterEmptyState`) into ONE
 * component so future modules don't drift a third. It is entity-agnostic: a consumer
 * supplies an icon (usually an entity-identity glyph), a title, a one-sentence body,
 * and up to two actions.
 *
 * It is calm and centred in its content region — never full-screen theatre
 * (PRODUCT_EXPERIENCE Part V, Empty State). The icon is decorative; meaning is
 * carried by the heading and body text (AGENTS.md §15). The filtered-empty variant
 * is just this component configured with a "clear filters" recovery action.
 */

import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** A decorative glyph (commonly an entity-identity icon). */
  readonly icon?: ReactNode;
  /** A richer illustration slot; takes precedence over `icon` when both are set. */
  readonly illustration?: ReactNode;
  /** The heading — what belongs here / what happened. */
  readonly title: string;
  /** Optional heading level for a correct outline (default 2). */
  readonly headingLevel?: 2 | 3;
  /** One calm sentence of context. */
  readonly description?: ReactNode;
  /** The single primary next action (a button or link node). */
  readonly primaryAction?: ReactNode;
  /** An optional secondary action. */
  readonly secondaryAction?: ReactNode;
  /**
   * PX-06 — `compact` tightens the rhythm for a small region (a Today widget, a
   * card-sized section) so a dashboard of quiet sections does not become a page
   * of full-height empty blocks. It is the SAME component and the same anatomy —
   * icon, title, one sentence, a next action — only denser, so a widget's empty
   * state still teaches the next step instead of degrading to a bare paragraph.
   */
  /**
   * RECORD-01 — `inline` is the RECORD-level absence: one calm, left-aligned
   * line, no icon, no centred block, no card.
   *
   * A record tab that is empty is not a collection that is empty. The
   * collection treatment — glyph, headline, sentence, primary button — teaches
   * a first-time owner where their Projects live, and it earns its space
   * there. Inside a record the same treatment restates a next action that is
   * already visible a few pixels above ("No open tasks / Add a task to start
   * moving this project forward" under an Add task control), in a block tall
   * enough to be the loudest thing in the panel.
   *
   * `inline` keeps the heading (the outline stays correct and assistive tech
   * still hears the region's state) and drops the theatre.
   */
  readonly size?: "default" | "compact" | "inline";
  readonly className?: string;
};

export function EmptyState({
  icon,
  illustration,
  title,
  headingLevel = 2,
  description,
  primaryAction,
  secondaryAction,
  size = "default",
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = ["dh-empty-state", className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-size={size}>
      {illustration ? (
        <div className="dh-empty-state__illustration">{illustration}</div>
      ) : icon ? (
        <div className="dh-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <Heading className="dh-empty-state__title">{title}</Heading>
      {description ? (
        <p className="dh-empty-state__body">{description}</p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="dh-empty-state__actions">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
