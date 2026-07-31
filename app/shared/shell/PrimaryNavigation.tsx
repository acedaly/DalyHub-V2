/**
 * PX-02/PX-03 shell — registry-driven primary navigation, as icon + label rows.
 *
 * Renders the navigation model the shell loader derived from the registry, one row
 * per module. Each row is `icon + label` — never text-only (DESIGN_SYSTEM.md →
 * Foundations; PRODUCT_EXPERIENCE §cause 3). The icon is the module's ENTITY
 * IDENTITY glyph (derived from the module's own entity-type manifest), so a module
 * is recognisable at a glance in the sidebar exactly as it is on a Card. It imports
 * no module route component — it consumes plain data (label, href, entityType).
 *
 * THEME-01 — the cross-cutting modules (Today, Help, About, Settings, AI) own no
 * entity type and used to render a generic dot here, which read as a missing glyph
 * in permanent chrome. They now declare `meta.navIcon` and the shared `NavIcon`
 * resolver returns a real icon for every row. The resolution rule lives in one
 * place; this component just renders it.
 *
 * React Router's `NavLink` sets `aria-current="page"` on the active item, so the
 * active state is conveyed SEMANTICALLY (reinforced by weight + a tint, never colour
 * alone — AGENTS.md §15). The row leaves room for a future quiet count and a future
 * collapsed icon-rail without a redesign.
 *
 * PX-03 — group dividers. `NavigationItem.group` (already derived from
 * `meta.navGroup`, FND-09) was carried through the model but never rendered. A
 * plain, decorative `<hr>` divider is inserted whenever consecutive items' `group`
 * differs — a single flat list stays a single flat list when no module declares a
 * group (today's behaviour, unchanged), so this is additive, not a redesign. The
 * divider carries no text: the recommended module grouping (Today/Areas/Goals/
 * Projects/Tasks · Notes/Diary/Meetings/People/Assets · Reviews/AI · Settings/Help)
 * is conveyed by rhythm alone, matching the roadmap's sidebar sketch.
 */

import { Fragment } from "react";
import { NavLink } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { NavIcon } from "./NavIcon";

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
        {items.map((item, index) => {
          const previous = items[index - 1];
          const startsNewGroup = index > 0 && previous?.group !== item.group;
          return (
            <Fragment key={item.id}>
              {startsNewGroup ? (
                <li className="dh-nav__divider" aria-hidden="true">
                  <hr />
                </li>
              ) : null}
              <li className="dh-nav__item">
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    isActive
                      ? "dh-nav__link dh-nav__link--active"
                      : "dh-nav__link"
                  }
                  onClick={onNavigate}
                  end
                >
                  <span className="dh-nav__icon">
                    <NavIcon
                      entityType={item.entityType}
                      navIcon={item.navIcon}
                    />
                  </span>
                  <span className="dh-nav__label">{item.label}</span>
                </NavLink>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
