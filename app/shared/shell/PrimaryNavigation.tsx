/**
 * PX-02 shell — registry-driven primary navigation, as icon + label rows.
 *
 * Renders the navigation model the shell loader derived from the registry, one row
 * per module. Each row is `icon + label` — never text-only (DESIGN_SYSTEM.md →
 * Foundations; PRODUCT_EXPERIENCE §cause 3). The icon is the module's ENTITY
 * IDENTITY glyph (derived from the module's own entity-type manifest), so a module
 * is recognisable at a glance in the sidebar exactly as it is on a Card. It imports
 * no module route component — it consumes plain data (label, href, entityType).
 *
 * React Router's `NavLink` sets `aria-current="page"` on the active item, so the
 * active state is conveyed SEMANTICALLY (reinforced by weight + a tint, never colour
 * alone — AGENTS.md §15). The row leaves room for a future quiet count and a future
 * collapsed icon-rail without a redesign.
 */

import { NavLink } from "react-router";

import { EntityIcon, isEntityType } from "~/shared/entity";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

export type PrimaryNavigationProps = {
  /** The id the mobile navigation toggle references via `aria-controls`. */
  readonly id: string;
  /** The derived navigation items, in deterministic order. */
  readonly items: readonly NavigationItem[];
  /** Called when a navigation target is chosen (used to close the mobile sheet). */
  readonly onNavigate?: () => void;
};

export function PrimaryNavigation({
  id,
  items,
  onNavigate,
}: PrimaryNavigationProps) {
  return (
    <nav id={id} className="dh-nav" aria-label="Primary">
      <ul className="dh-nav__list">
        {items.map((item) => (
          <li key={item.id} className="dh-nav__item">
            <NavLink
              to={item.href}
              className={({ isActive }) =>
                isActive ? "dh-nav__link dh-nav__link--active" : "dh-nav__link"
              }
              onClick={onNavigate}
              end
            >
              <span className="dh-nav__icon">
                {isEntityType(item.entityType) ? (
                  <EntityIcon type={item.entityType} />
                ) : (
                  <span className="dh-nav__icon-dot" aria-hidden="true" />
                )}
              </span>
              <span className="dh-nav__label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
