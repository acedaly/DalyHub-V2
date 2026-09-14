/**
 * UNTITLED-16 — Untitled's `TableCard.Header`, with a heading LEVEL.
 *
 * A DalyHub OVERRIDE, not vendored source: `scripts/vendor-untitled.mjs` never
 * writes into this directory. It exists for the same reason `section-heading`
 * does, and it is the same defect one component along.
 *
 * Upstream renders `<h2>` unconditionally. That is right wherever a table card
 * is a section of a PAGE — a collection's own title is the `h1` above it — and
 * wrong inside a record TAB, where DalyHub already introduces a
 * visually-hidden `h2` naming the tab. Every band header then becomes a SIBLING
 * of the section that contains it rather than a child of it, and a screen-reader
 * user walking the Asset record's Obligations tab by heading is told "Obligations,
 * Overdue, This week" as three peers instead of one section with two bands.
 *
 * Everything visual is upstream's, copied from
 * `application/table/table.tsx`'s `TableCardHeader`: the padding ramp, the
 * bottom border, the title/badge row, the description and the trailing slot.
 * The addition is `level`.
 *
 * One deliberate divergence, because it cannot be avoided from outside the
 * vendored file: upstream reads its padding `size` from `TableContext`, which
 * the vendored module does not export. Here `size` is a PROP, and a caller that
 * sets `size` on `TableCard.Root` must pass the same value here. That is a
 * worse contract than upstream's and it is the price of not patching a
 * regenerated file; it is stated rather than hidden.
 */

import { isValidElement, type ReactNode } from "react";

import { Badge } from "~/shared/ui/untitled/base/badges/badges";
import { cx } from "~/shared/ui/untitled/utils/cx";

export interface TableCardHeaderProps {
  /** The title of the table card header. */
  readonly title: string;
  /** The badge displayed next to the title. */
  readonly badge?: ReactNode;
  /** The description of the table card header. */
  readonly description?: string;
  /** The content displayed after the title and badge. */
  readonly contentTrailing?: ReactNode;
  /**
   * The heading rank. Pick it from the DOCUMENT, not from the look: a card
   * that is a section of a page whose title is the `h1` is an `h2`; a card
   * inside a record tab that already names itself is an `h3`.
   */
  readonly level?: 2 | 3;
  /** Upstream reads this from context; see the note above. */
  readonly size?: "sm" | "md";
  /** The class name of the table card header. */
  readonly className?: string;
}

export function TableCardHeader({
  title,
  badge,
  description,
  contentTrailing,
  level = 2,
  size = "md",
  className,
}: TableCardHeaderProps) {
  const Heading = `h${level}` as "h2" | "h3";

  return (
    <div
      className={cx(
        "relative flex flex-col items-start gap-4 border-b border-secondary bg-primary px-4 md:flex-row",
        size === "sm" ? "py-4 md:px-5" : "py-5 md:px-6",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Heading className="text-md font-semibold text-primary">
            {title}
          </Heading>
          {badge ? (
            isValidElement(badge) ? (
              badge
            ) : (
              <Badge color="gray" size="sm" type="modern">
                {badge}
              </Badge>
            )
          ) : null}
        </div>
        {description && <p className="text-sm text-tertiary">{description}</p>}
      </div>
      {contentTrailing}
    </div>
  );
}
