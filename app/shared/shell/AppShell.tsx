/**
 * PX-02 application frame.
 *
 * The premium application shell that replaces FND-09's website-like top bar
 * (PRODUCT_EXPERIENCE #1, #2): a persistent left sidebar owning identity and
 * navigation, and a full-height content pane with its own scroll. Layout is
 * `grid-template-columns: var(--dh-shell-nav-width) 1fr` — the sidebar width token
 * DS-01 already defined and nothing consumed until now.
 *
 * - Desktop/laptop/tablet: the sidebar is a persistent rail; the pane scrolls
 *   independently so Pane Headers and filter bars can pin (PRODUCT_EXPERIENCE #11).
 * - Mobile: the rail is hidden; a slim bar exposes a menu toggle that opens the
 *   sidebar as an animated, focus-trapped overlay sheet (see MobileNav). No content
 *   jumps — the sheet is viewport-fixed.
 *
 * It stays keyboard-complete with a preserved skip link and correct landmarks: the
 * sidebar brand is the `banner`, primary navigation is a labelled `navigation`, and
 * the pane is the `main` region. The shell consumes only plain data and renders
 * `children` (the route Outlet), so it never imports a module route component.
 */

import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
// Import the specific modules (not the `~/shared/commands` barrel) so the shell
// does NOT eagerly pull the palette controller / DS-08 Search UI into the initial
// bundle — the palette itself stays lazy-loaded (ADR-024 §24.13).
import { CommandContextProvider } from "~/shared/commands/CommandContextProvider";
import { CommandShortcutLayer } from "~/shared/commands/CommandShortcutLayer";
import type { ShortcutBinding } from "~/shared/commands/useCommandShortcuts";

import { FeedbackProvider } from "~/shared/feedback";

import { MobileNav } from "./MobileNav";
import { MenuIcon } from "~/shared/icons";
import { Sidebar } from "./Sidebar";
import type { ThemePreference } from "./theme";

/** The DOM id of the persistent rail's primary navigation. */
const RAIL_NAV_ID = "primary-navigation";

/**
 * The full Search surface (DS-08) and Command Palette (DS-09) are lazy-loaded by
 * module path so their UI, controllers and models stay OUT of the initial
 * application bundle and out of every route chunk — each chunk loads only when its
 * surface is first opened.
 */
const SearchSurface = lazy(() => import("~/shared/search/SearchSurface"));
const CommandPalette = lazy(() => import("~/shared/commands/CommandPalette"));

export type AppShellProps = {
  /** The current workspace's display name (server-derived, safe text). */
  readonly workspaceName?: string;
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
  workspaceName = "DalyHub",
  email,
  navigation,
  theme,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // The element focus returns to when each surface closes — whatever opened it.
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const commandOpenerRef = useRef<HTMLElement | null>(null);
  // Mirrors for the shortcut dispatcher, so a repeat while open is a no-op/toggle
  // without re-capturing a new opener.
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;
  const commandOpenRef = useRef(false);
  commandOpenRef.current = commandOpen;

  // Search and the Command Palette are MUTUALLY EXCLUSIVE: opening one closes the
  // other cleanly, so the two modal surfaces never overlap (ADR-024 §24.12).
  const openSearch = useCallback((opener?: HTMLElement) => {
    if (searchOpenRef.current) {
      return; // already open — do not re-capture the opener or re-open
    }
    searchOpenerRef.current =
      opener ??
      (typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null));
    setNavOpen(false);
    setCommandOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const openCommand = useCallback((opener?: HTMLElement) => {
    if (commandOpenRef.current) {
      return;
    }
    commandOpenerRef.current =
      opener ??
      (typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null));
    setNavOpen(false);
    setSearchOpen(false);
    setCommandOpen(true);
  }, []);
  const closeCommand = useCallback(() => setCommandOpen(false), []);
  // Documented Mod+K policy: pressing it again while the palette is open CLOSES it.
  const toggleCommand = useCallback(() => {
    if (commandOpenRef.current) {
      setCommandOpen(false);
      return;
    }
    openCommand();
  }, [openCommand]);

  // The reserved global shortcuts (ADR-024 §24.13): `Mod+K` toggles the Command
  // Palette (permitted even while typing) and `/` focuses Search (ignored while
  // typing, preserving DS-08 behaviour). CommandShortcutLayer installs the ONE
  // shared dispatcher for these plus any declared NAVIGATION command shortcuts —
  // there is never a per-command document listener.
  const reservedShortcuts = useMemo<ShortcutBinding[]>(
    () => [
      {
        shortcut: { key: "k", modifiers: ["mod"] },
        onTrigger: toggleCommand,
        allowInInput: true,
      },
      { shortcut: { key: "/" }, onTrigger: () => openSearch() },
    ],
    [toggleCommand, openSearch],
  );

  return (
    <FeedbackProvider>
      <CommandContextProvider>
        <CommandShortcutLayer reserved={reservedShortcuts} />
        <div className="dh-app">
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>

          <Sidebar
            workspaceName={workspaceName}
            email={email}
            theme={theme}
            navigation={navigation}
            navId={RAIL_NAV_ID}
            variant="rail"
            onOpenSearch={openSearch}
            onOpenCommand={openCommand}
          />

          <div className="dh-main-col">
            {/* A `header` so the mobile bar's brand + menu toggle are contained by a
                landmark (the `banner`) on mobile, where the rail sidebar banner is
                hidden — otherwise its content sits outside every landmark (WCAG
                region, DS-11). On desktop this bar is `display:none` and ignored. */}
            <header className="dh-mobilebar">
              <button
                type="button"
                className="dh-mobilebar__toggle"
                ref={toggleRef}
                aria-expanded={navOpen}
                aria-controls="primary-navigation-mobile"
                onClick={() => setNavOpen(true)}
              >
                <span className="dh-mobilebar__toggle-icon" aria-hidden="true">
                  <MenuIcon />
                </span>
                <span className="dh-visually-hidden">Open navigation</span>
              </button>
              <span className="dh-mobilebar__brand">{workspaceName}</span>
            </header>

            <main id="main-content" className="dh-pane" tabIndex={-1}>
              {children}
            </main>
          </div>

          {navOpen ? (
            <MobileNav
              workspaceName={workspaceName}
              email={email}
              theme={theme}
              navigation={navigation}
              opener={toggleRef.current}
              onClose={() => setNavOpen(false)}
              onOpenSearch={openSearch}
              onOpenCommand={openCommand}
            />
          ) : null}

          {searchOpen ? (
            <Suspense fallback={null}>
              <SearchSurface
                onClose={closeSearch}
                opener={searchOpenerRef.current}
              />
            </Suspense>
          ) : null}

          {commandOpen ? (
            <Suspense fallback={null}>
              <CommandPalette
                onClose={closeCommand}
                opener={commandOpenerRef.current}
              />
            </Suspense>
          ) : null}
        </div>
      </CommandContextProvider>
    </FeedbackProvider>
  );
}
