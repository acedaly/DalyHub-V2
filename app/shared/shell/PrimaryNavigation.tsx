/**
 * FND-09 shell — registry-driven primary navigation.
 *
 * Renders the navigation model the shell loader derived from the registry. It
 * imports NO module route component — it consumes plain data (label + href). It
 * uses React Router's `NavLink`, which sets `aria-current="page"` on the active
 * item, so the active state is conveyed SEMANTICALLY, not by colour alone
 * (AGENTS.md §15). Labels are plain text.
 */

import { NavLink } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

export type PrimaryNavigationProps = {
  /** The id the mobile navigation toggle references via `aria-controls`. */
  readonly id: string;
  /** The derived navigation items, in deterministic order. */
  readonly items: readonly NavigationItem[];
  /** Whether the (mobile) navigation is expanded. */
  readonly open: boolean;
};

export function PrimaryNavigation({ id, items, open }: PrimaryNavigationProps) {
  return (
    <nav
      id={id}
      className="primary-nav"
      aria-label="Primary"
      data-open={open ? "true" : "false"}
    >
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.href}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link--active" : "nav-link"
              }
              end
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
