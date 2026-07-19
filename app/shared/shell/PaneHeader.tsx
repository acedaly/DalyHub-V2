/**
 * PX-02 shell — the Pane Header.
 *
 * The header BELONGS TO THE CURRENT SCREEN, not the app frame (PRODUCT_EXPERIENCE
 * #1, Part V). It carries the page title, an optional subtitle/summary, an optional
 * view-switcher slot and a single primary-action slot — and never theme controls, an
 * email address or logout (those live in the User Menu). It is entity-agnostic: a
 * surface passes plain nodes into the slots.
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

export type PaneHeaderProps = {
  /** The page title (required). */
  readonly title: string;
  /** Optional heading level for a correct document outline (default 1). */
  readonly headingLevel?: 1 | 2 | 3;
  /** Optional entity type — renders the type's identity glyph beside the title. */
  readonly entityType?: EntityType;
  /** Optional subtitle / count / summary line under the title. */
  readonly subtitle?: ReactNode;
  /** Optional view-switcher slot (e.g. list / board / grid). */
  readonly viewSwitcher?: ReactNode;
  /** Optional single primary-action slot (one accent action per pane). */
  readonly primaryAction?: ReactNode;
  /** Optional id for the heading (for `aria-labelledby` on the owning region). */
  readonly titleId?: string;
  readonly className?: string;
};

export function PaneHeader({
  title,
  headingLevel = 1,
  entityType,
  subtitle,
  viewSwitcher,
  primaryAction,
  titleId,
  className,
}: PaneHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = ["dh-pane-header", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="dh-pane-header__lead">
        {entityType ? (
          <EntityIcon
            type={entityType}
            variant="badge"
            className="dh-pane-header__icon"
          />
        ) : null}
        <div className="dh-pane-header__titles">
          <Heading id={titleId} className="dh-pane-header__title">
            {title}
          </Heading>
          {subtitle ? (
            <p className="dh-pane-header__subtitle">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {viewSwitcher || primaryAction ? (
        <div className="dh-pane-header__actions">
          {viewSwitcher ? (
            <div className="dh-pane-header__views">{viewSwitcher}</div>
          ) : null}
          {primaryAction ? (
            <div className="dh-pane-header__primary">{primaryAction}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
