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
 *     [icon]  EYEBROW              [ status ]      [ views ][ secondary ][ PRIMARY ]
 *             Title
 *             Supporting line
 *             metadata · metadata · metadata
 *
 * Everything except `title` is optional, and a header that passes only a title
 * renders exactly what it used to. `density` chooses between the compact band a
 * collection wants above a filter row and the taller identity band a record
 * wants; nothing else changes between them.
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

import type { EntityType } from "~/shared/entity";
import { EntityIcon } from "~/shared/entity";

import { useSetMobileTopBar } from "./mobile-top-bar-context";

export type PaneHeaderProps = {
  /** The page title (required). */
  readonly title: string;
  /** Optional heading level for a correct document outline (default 1). */
  readonly headingLevel?: 1 | 2 | 3;
  /** Optional entity type — renders the type's identity glyph beside the title. */
  readonly entityType?: EntityType;
  /**
   * A rendered identity node that REPLACES the `entityType` glyph — a record's
   * chosen icon in its accent container, say. The header does not resolve icons;
   * it only gives one a place to sit.
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
  entityType,
  icon,
  eyebrow,
  subtitle,
  status,
  meta,
  viewSwitcher,
  secondaryActions,
  primaryAction,
  density = "compact",
  titleId,
  className,
}: PaneHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = ["dh-pane-header", `dh-pane-header--${density}`, className]
    .filter(Boolean)
    .join(" ");

  // MOBILE-01 — a phone screen says which COLLECTION it is showing, not the
  // workspace name it would otherwise repeat everywhere. Only the pane's own
  // heading publishes: a nested `h2` header inside a pane is a section, not the
  // screen. A record opened over the pane publishes on top of this and restores
  // it on close.
  const publishedToMobileBar = headingLevel === 1;
  useSetMobileTopBar({ title: publishedToMobileBar ? title : null });

  return (
    <div className={classes}>
      <div className="dh-pane-header__lead">
        {icon ??
          (entityType ? (
            <EntityIcon
              type={entityType}
              variant="badge"
              className="dh-pane-header__icon"
            />
          ) : null)}
        <div className="dh-pane-header__titles">
          {eyebrow ? (
            <p className="dh-pane-header__eyebrow">{eyebrow}</p>
          ) : null}
          {/* `data-published` marks the title the PHONE top bar is already
           * showing. At phone widths the CSS hides this copy VISUALLY but leaves
           * it in the document, because the bar renders its title as a `p` — so
           * removing this heading would leave the screen with no `h1` at all.
           * One visible title, one heading outline. */}
          <div className="dh-pane-header__headline">
            <Heading
              id={titleId}
              className="dh-pane-header__title"
              data-published={publishedToMobileBar ? "true" : undefined}
            >
              {title}
            </Heading>
            {status ? (
              <span className="dh-pane-header__status">{status}</span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="dh-pane-header__subtitle">{subtitle}</p>
          ) : null}
          {meta ? <div className="dh-pane-header__meta">{meta}</div> : null}
        </div>
      </div>

      {viewSwitcher || secondaryActions || primaryAction ? (
        <div className="dh-pane-header__actions">
          {viewSwitcher ? (
            <div className="dh-pane-header__views">{viewSwitcher}</div>
          ) : null}
          {secondaryActions ? (
            <div className="dh-pane-header__secondary">{secondaryActions}</div>
          ) : null}
          {primaryAction ? (
            <div className="dh-pane-header__primary">{primaryAction}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
