/**
 * PX-02 shell — the Pane Header.
 *
 * The header BELONGS TO THE CURRENT SCREEN, not the app frame (PRODUCT_EXPERIENCE
 * #1, Part V). It never carries theme controls, an email address or logout —
 * those live in the User Menu — and it is entity-agnostic: a surface passes
 * plain nodes into the slots.
 *
 * The slot set is wider than it was, because three slots could not carry the
 * product. Collections, records and Settings each grew their OWN header for want
 * of an eyebrow, a status chip or a metadata line here, which is how DalyHub
 * ended up with four header systems that agreed on nothing. The slots are:
 *
 *     [icon]  EYEBROW      [ status ]  [ search ][ views ][ secondary ][ PRIMARY ]
 *             Title
 *             Supporting line
 *             metadata · metadata · metadata
 *
 * Everything except `title` is optional, and a header that passes only a title
 * renders exactly what it used to. `density` chooses between the compact band a
 * collection wants above a filter row and the taller identity band a record
 * wants; nothing else changes between them.
 *
 * ── UIQ-013/014 — SEMANTIC OWNERSHIP IS THE CONTRACT ────────────────────────
 * Which slot a control belongs in is fixed product-wide, and does not vary by
 * module (DESIGN_SYSTEM.md → Collection header anatomy):
 *
 *   - `viewSwitcher` — the ONE `~/shared/view-switcher` control, changing the
 *     collection's PRESENTATION or its PRINCIPAL MODE. Never a data filter.
 *   - `secondaryActions` — at most one or two supporting actions (Tasks'
 *     Review Inbox); everything past that belongs in an overflow menu.
 *   - `primaryAction` — exactly one, and always the same conceptual place on
 *     every collection: the trailing end of the control cluster. A module with
 *     no page-level create passes nothing rather than promoting something else
 *     into the slot.
 *   - `search` — REDESIGN-04, and the ONE exception to the rule below.
 *
 * Filters — selects, tags, chips — are NOT header slots. They live in the band
 * beneath, `CollectionLayout`'s `filterBar` (or `mobileControls`), so "how is
 * this shown" and "which records are included" stay legible as two different
 * questions.
 *
 * ── Why `search` is nonetheless a header slot ───────────────────────────────
 * `mockup3.png` draws it there, on the title row beside the primary action, and
 * the reference is right about it for a reason the rule did not anticipate:
 * search is the one control an owner reaches for WITHOUT having decided to
 * filter. It is how you find a known record, not how you narrow an unknown set
 * — closer in use to the pane's title than to its filter row. Three modules had
 * already reached the same conclusion privately (Assets keeps its search
 * "visible at every width" while everything else goes in the sheet), which is
 * the shape of a missing slot rather than three local decisions.
 *
 * It is a distinct slot rather than a licence to put filters here: it takes the
 * shared `CollectionSearchField` and nothing else, and every OTHER narrowing
 * control still belongs in the band beneath. The band's own semantics are
 * unchanged.
 *
 * The switcher is a SIBLING of the action cluster rather than a child of it,
 * which is what lets the narrow composition put the title and the primary
 * action on one row and give the switcher its own beneath — an intentional
 * change of composition rather than a desktop row collapsing by accident.
 *
 * It is still not a business-logic component: it takes nodes and strings, and
 * decides only where they go.
 *
 * It renders as a plain container (NOT a `<header>` element) so the frame keeps
 * exactly one `banner` landmark — the sidebar brand; the page title is carried by a
 * real heading. It is made sticky by CollectionLayout / the pane's scroll container
 * (PRODUCT_EXPERIENCE #11) — the header itself owns no scroll behaviour, only
 * structure. Exactly one primary action per pane (Part III §3): the slot holds one.
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

import { useSetMobileTopBar } from "./mobile-top-bar-context";

export type PaneHeaderProps = {
  /** The page title (required). */
  readonly title: string;
  /** Optional heading level for a correct document outline (default 1). */
  readonly headingLevel?: 1 | 2 | 3;
  /**
   * A rendered identity node beside the title — a RECORD's chosen icon in its
   * own accent container. The header does not resolve icons; it only gives one
   * a place to sit.
   *
   * ── UIX-06 — a COLLECTION passes nothing here, and that is the rule ────────
   * The band used to draw a generic type badge from an `entityType` prop, which
   * produced three different page origins across the product: a collection's
   * title started 40px right of Today's and Analytics', because those two have
   * no entity type to badge. It was also the same glyph the sidebar was already
   * showing, highlighted, 200px to the left — one icon, twice, for one route.
   *
   * The documented anatomy (DESIGN_SYSTEM.md → the collection-header anatomy)
   * has always shown the title leading, and every root reference draws it that
   * way. A record keeps its icon because a record's mark carries its Area's
   * identity accent (D22/§6.2), which is information rather than decoration.
   */
  readonly icon?: ReactNode;
  /** A short context label above the title ("Project", "Area · Health"). */
  readonly eyebrow?: ReactNode;
  /** Optional subtitle / count / summary line under the title. */
  readonly subtitle?: ReactNode;
  /** Compact status beside the title — a chip, a state pill. */
  readonly status?: ReactNode;
  /** Key facts under the supporting line, laid out as one wrapping metadata row. */
  readonly meta?: ReactNode;
  /**
   * REDESIGN-04 — the collection's inline search field, on the title row.
   * Takes the shared `CollectionSearchField`; see the note above for why this
   * one narrowing control is a header slot and no other is.
   */
  readonly search?: ReactNode;
  /** Optional view-switcher slot (e.g. list / board / grid). */
  readonly viewSwitcher?: ReactNode;
  /** Secondary actions, before the primary one (overflow menus, Rename, Export). */
  readonly secondaryActions?: ReactNode;
  /** Optional single primary-action slot (one accent action per pane). */
  readonly primaryAction?: ReactNode;
  /**
   * `compact` is the collection band — title, count, actions, sitting directly
   * above a filter row. `identity` is the record band, which has room for the
   * icon, the eyebrow and a metadata line. Defaults to `compact`.
   */
  readonly density?: "compact" | "identity";
  /** Optional id for the heading (for `aria-labelledby` on the owning region). */
  readonly titleId?: string;
  readonly className?: string;
};

export function PaneHeader({
  title,
  headingLevel = 1,
  icon,
  eyebrow,
  subtitle,
  status,
  meta,
  search,
  viewSwitcher,
  secondaryActions,
  primaryAction,
  density = "compact",
  titleId,
  className,
}: PaneHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = cx(
    "dh-pane-header flex w-full max-w-[var(--dh-shell-content-max-width)] flex-wrap items-end justify-between gap-x-4 gap-y-3 bg-transparent px-[var(--dh-shell-gutter)]",
    density === "compact"
      ? "dh-pane-header--compact py-4 pb-2"
      : "dh-pane-header--identity items-start py-5 pb-4",
    className,
  );

  // MOBILE-01 — a phone screen says which COLLECTION it is showing, not the
  // workspace name it would otherwise repeat everywhere. Only the pane's own
  // heading publishes: a nested `h2` header inside a pane is a section, not the
  // screen. A record opened over the pane publishes on top of this and restores
  // it on close.
  const publishedToMobileBar = headingLevel === 1;
  useSetMobileTopBar({ title: publishedToMobileBar ? title : null });

  return (
    <div
      className={classes}
      data-untitled-source="page-header"
      data-dh-header-density={density}
    >
      <div className="dh-pane-header__lead flex min-w-0 flex-1 items-center gap-3">
        {icon}
        <div
          className={cx(
            "dh-pane-header__titles min-w-0",
            density === "compact" && "flex items-baseline gap-3",
          )}
        >
          {eyebrow ? (
            <p className="dh-pane-header__eyebrow m-0 mb-1 text-xs font-semibold tracking-wide text-tertiary uppercase">
              {eyebrow}
            </p>
          ) : null}
          {/* `data-published` marks the title the PHONE top bar is already
           * showing. At phone widths the CSS hides this copy VISUALLY but leaves
           * it in the document, because the bar renders its title as a `p` — so
           * removing this heading would leave the screen with no `h1` at all.
           * One visible title, one heading outline. */}
          <div className="dh-pane-header__headline flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Heading
              id={titleId}
              className="dh-pane-header__title m-0 text-display-xs font-semibold text-primary"
              data-published={publishedToMobileBar ? "true" : undefined}
            >
              {title}
            </Heading>
            {status ? (
              <span className="dh-pane-header__status inline-flex items-center">
                {status}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p
              className={cx(
                "dh-pane-header__subtitle text-sm text-tertiary tabular-nums",
                density === "compact" ? "m-0" : "mt-1 mb-0",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          {meta ? (
            <div className="dh-pane-header__meta mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-tertiary tabular-nums">
              {meta}
            </div>
          ) : null}
        </div>
      </div>

      {search ? (
        <div className="dh-pane-header__search flex min-w-0 flex-1 basis-48 items-center justify-end">
          {search}
        </div>
      ) : null}

      {viewSwitcher ? (
        <div className="dh-pane-header__views flex min-w-0 items-center">
          {viewSwitcher}
        </div>
      ) : null}

      {secondaryActions || primaryAction ? (
        <div className="dh-pane-header__actions flex flex-none flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {secondaryActions ? (
            <div className="dh-pane-header__secondary flex items-center gap-2">
              {secondaryActions}
            </div>
          ) : null}
          {primaryAction ? (
            <div className="dh-pane-header__primary flex flex-none items-center">
              {primaryAction}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
