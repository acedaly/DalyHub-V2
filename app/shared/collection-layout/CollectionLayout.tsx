/**
 * PX-02 — the Shared Collection Layout.
 *
 * The product's most common screen — "a filtered collection of Cards with a Filter
 * bar, opening records in a Drawer" (DESIGN_SYSTEM.md → Using this system) — finally
 * has a named scaffold (PRODUCT_EXPERIENCE #5). This is to screens what the Record
 * Layout (DS-02) is to records: one entity-agnostic composition every collection
 * surface (Today, Projects, Areas, Goals, Notes, People) configures, so the product
 * stays consistent at the screen level as well as the component level.
 *
 * Responsibilities (and ONLY these — no business logic, no repositories, no entity
 * assumptions):
 *   - a Pane Header (title, subtitle/count, view-switcher slot, one primary action);
 *   - a FilterBar slot;
 *   - a content slot (a DS-04 Card collection);
 *   - a selection/bulk-action slot;
 *   - built-in Loading (skeletons), Empty, Filtered-empty and Error states;
 *   - a sticky header + filter bar and correct scroll ownership within the pane
 *     (PRODUCT_EXPERIENCE #11), and responsive spacing.
 *
 * State precedence in the content region: error → loading → filtered-empty → empty →
 * children. Every collection surface therefore wires all four states by construction
 * — a surface can never render a blank region (PRODUCT_EXPERIENCE Part IV §5).
 */

import { useId } from "react";
import type { ReactNode } from "react";

import type { EntityType } from "~/shared/entity";
import { PaneHeader } from "~/shared/shell/PaneHeader";
import { CollectionSkeleton } from "~/shared/skeleton";

export type CollectionLayoutProps = {
  /* -- Pane header -- */
  readonly title: string;
  readonly headingLevel?: 1 | 2 | 3;
  readonly entityType?: EntityType;
  readonly subtitle?: ReactNode;
  readonly viewSwitcher?: ReactNode;
  readonly primaryAction?: ReactNode;

  /* -- Filter bar slot -- */
  readonly filterBar?: ReactNode;

  /* -- State slots (precedence: error → loading → filtered-empty → empty) -- */
  readonly error?: ReactNode;
  readonly isLoading?: boolean;
  /** Loading content; defaults to a density-aware collection skeleton. */
  readonly loadingSlot?: ReactNode;
  readonly isFilteredEmpty?: boolean;
  readonly filteredEmptySlot?: ReactNode;
  readonly isEmpty?: boolean;
  readonly emptySlot?: ReactNode;

  /* -- Selection / bulk-action slot (bottom-anchored) -- */
  readonly selection?: ReactNode;

  /* -- The collection content -- */
  readonly children?: ReactNode;

  /** Density hint passed to the default loading skeleton. */
  readonly density?: "comfortable" | "compact";
  /** Presentation hint passed to the default loading skeleton. */
  readonly presentation?: "list" | "board" | "grid";
  readonly className?: string;
};

export function CollectionLayout({
  title,
  headingLevel = 1,
  entityType,
  subtitle,
  viewSwitcher,
  primaryAction,
  filterBar,
  error,
  isLoading = false,
  loadingSlot,
  isFilteredEmpty = false,
  filteredEmptySlot,
  isEmpty = false,
  emptySlot,
  selection,
  children,
  density = "comfortable",
  presentation = "list",
  className,
}: CollectionLayoutProps) {
  const titleId = useId();
  const classes = ["dh-collection", className].filter(Boolean).join(" ");

  let content: ReactNode;
  if (error) {
    content = error;
  } else if (isLoading) {
    content = loadingSlot ?? (
      <CollectionSkeleton density={density} presentation={presentation} />
    );
  } else if (isFilteredEmpty) {
    content = filteredEmptySlot ?? emptySlot;
  } else if (isEmpty) {
    content = emptySlot;
  } else {
    content = children;
  }

  return (
    <section className={classes} aria-labelledby={titleId}>
      <div className="dh-collection__sticky">
        <PaneHeader
          title={title}
          titleId={titleId}
          headingLevel={headingLevel}
          entityType={entityType}
          subtitle={subtitle}
          viewSwitcher={viewSwitcher}
          primaryAction={primaryAction}
        />
        {filterBar ? (
          <div className="dh-collection__filters">{filterBar}</div>
        ) : null}
      </div>

      <div className="dh-collection__content" aria-busy={isLoading}>
        {content}
      </div>

      {selection ? (
        <div className="dh-collection__selection">{selection}</div>
      ) : null}
    </section>
  );
}
