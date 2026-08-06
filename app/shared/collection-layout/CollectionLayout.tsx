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

import { useEffect, useId } from "react";
import type { ReactNode } from "react";

import type { EntityType } from "~/shared/entity";
import { PaneHeader } from "~/shared/shell/PaneHeader";
import { CollectionSkeleton } from "~/shared/skeleton";

/**
 * How many collections currently have their selection slot occupied.
 *
 * A counter rather than a boolean because the flag is on the document, and two
 * mounted collections (a record's tab beneath an open drawer, say) would
 * otherwise let the first one to tear down clear a state the second still
 * needs. Incremented on the way in, decremented on the way out; the attribute
 * exists exactly while the count is positive.
 */
let activeSelectionCount = 0;

/**
 * Publish "a bulk-action bar is on screen" to the shell.
 *
 * The bulk bar is in normal flow at the end of the collection, and on a phone
 * the capture FAB is `position: fixed` in the bottom-right corner — so on a
 * short viewport the FAB sits ON TOP of the bar's trailing controls and eats
 * their clicks. That is a real defect, not a test artefact: with a task
 * selected, Cancel was unreachable by tap in the corner it occupies.
 *
 * The shell hides the FAB while this flag is set (see `shell.css`). Hiding is
 * right rather than merely restyling: during selection the owner is acting on
 * things that already exist, so an affordance for creating a NEW one is not
 * competing for the same corner — it has no business being there at all.
 *
 * It lives here rather than in Today because the selection slot is the shared
 * layout's, so every collection that grows bulk actions inherits the fix.
 */
function useSelectionActive(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activeSelectionCount += 1;
    document.documentElement.dataset.selectionActive = "true";
    return () => {
      activeSelectionCount -= 1;
      if (activeSelectionCount <= 0) {
        activeSelectionCount = 0;
        delete document.documentElement.dataset.selectionActive;
      }
    };
  }, [active]);
}

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
  /**
   * MOBILE-01 — the phone collection controls (one row: Filter + Sort/View),
   * typically a shared `<CollectionControls>`.
   *
   * At phone widths this REPLACES `filterBar` and `viewSwitcher`: a phone cannot
   * afford several permanent rows of chrome above the first record. Both are
   * rendered so the swap is pure CSS (correct on the first server byte, no
   * viewport sniffing and no hydration mismatch); the duplicated markup is a
   * couple of buttons, never a second copy of the collection's content.
   *
   * A collection that supplies none keeps its desktop filter bar at every width —
   * the existing behaviour, unchanged.
   */
  readonly mobileControls?: ReactNode;
  /**
   * TASKS-03 — keep the shared control row visible at EVERY width, instead of only
   * on a phone.
   *
   * A collection with a genuinely rich control surface (Tasks: sixteen filter
   * dimensions, eight sorts, eight groupings, saved views) should not fork into a
   * desktop control bar and a phone sheet — that is two things to learn, two things
   * to keep in step and two places for a filter to hide. Opting in here means the
   * ONE shared sheet, its active count and its chip row are the control surface at
   * every width; the desktop `filterBar` then carries only what genuinely benefits
   * from always being visible.
   */
  readonly persistentControls?: boolean;

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
  mobileControls,
  persistentControls = false,
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
  useSelectionActive(Boolean(selection));
  const classes = [
    "dh-collection",
    // Drives the phone/desktop control swap in CSS (see collection-layout.css).
    mobileControls ? "dh-collection--has-mobile-controls" : null,
    persistentControls ? "dh-collection--persistent-controls" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
        {mobileControls ? (
          <div className="dh-collection__mobile-controls">{mobileControls}</div>
        ) : null}
      </div>

      {/*
       * DS-14 §4 — a collection surface IS the Collection region.
       *
       * Declared once, here, rather than by each of the twelve modules that
       * render through this scaffold: the classification is a property of the
       * surface ("everything the owner scans"), and this component is the
       * definition of that surface. A record that embeds a reading column
       * nests its own Reading region inside, and the nearest wrapper wins.
       */}
      <div className="dh-collection__content" aria-busy={isLoading}>
        {content}
      </div>

      {selection ? (
        <div className="dh-collection__selection">{selection}</div>
      ) : null}
    </section>
  );
}
