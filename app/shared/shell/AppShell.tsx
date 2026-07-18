/**
 * FND-09 application shell.
 *
 * A restrained, responsive, semantic frame: a skip link, a header carrying the
 * application identity, registry-driven primary navigation, the theme control and
 * the authenticated-user summary, and a main content region (AGENTS.md §6, §15).
 * It is keyboard-complete, exposes the mobile navigation toggle's expanded state,
 * and conveys active navigation semantically. It adds no UI framework and no icon
 * library — text labels only until DS-01.
 *
 * The shell consumes only plain data (email, theme, the derived navigation model)
 * and renders `children` (the route `Outlet`), so it never imports a module route
 * component and stays testable with arbitrary content.
 */

import { useState } from "react";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { PrimaryNavigation } from "./PrimaryNavigation";
import { ThemeControl } from "./ThemeControl";
import { UserMenu } from "./UserMenu";
import type { ThemePreference } from "./theme";

/** The id the mobile navigation toggle controls. */
const PRIMARY_NAV_ID = "primary-navigation";

export type AppShellProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
  /** The derived, registry-driven navigation model. */
  readonly navigation: readonly NavigationItem[];
  /** The active theme preference (for the control's active state). */
  readonly theme: ThemePreference;
  /** The routed page content (the route `Outlet`). */
  readonly children: React.ReactNode;
};

export function AppShell({
  email,
  navigation,
  theme,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-brand">
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-controls={PRIMARY_NAV_ID}
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
          <span className="app-title">DalyHub</span>
        </div>
        <PrimaryNavigation
          id={PRIMARY_NAV_ID}
          items={navigation}
          open={navOpen}
        />
        <div className="app-tools">
          <ThemeControl current={theme} />
          <UserMenu email={email} />
        </div>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
