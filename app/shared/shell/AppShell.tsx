/**
 * PX-02 application frame, with the MOBILE-01 phone shell.
 *
 * The premium application shell that replaces FND-09's website-like top bar
 * (PRODUCT_EXPERIENCE #1, #2): a persistent left sidebar owning identity and
 * navigation, and a full-height content pane with its own scroll. Layout is
 * `grid-template-columns: var(--dh-shell-nav-width) 1fr` — the sidebar width token
 * DS-01 already defined and nothing consumed until now.
 *
 * - Desktop/laptop/tablet: the sidebar is a persistent rail; the pane scrolls
 *   independently so Pane Headers and filter bars can pin (PRODUCT_EXPERIENCE #11).
 *   MOBILE-01 changes NOTHING here.
 * - Phone (MOBILE-01): the rail is hidden and navigation becomes a persistent
 *   BOTTOM bar within thumb reach — `Today · Tasks · Capture · Diary · More` —
 *   derived from the registry (see `mobile-navigation.ts`). "More" opens the same
 *   complete navigation sheet the hamburger used to (MobileNav), so every module
 *   stays one tap away and there is no second module list. A compact top bar keeps
 *   the route title, a contextual Back and Search.
 *
 * The shell also mounts, exactly once each: the shared Quick Capture provider (so
 * any surface opens the ONE capture sheet) and the shared keyboard-inset observer
 * (the only Visual Viewport listener in the product). Both are cheap: capture is
 * lazy-loaded and the observer publishes a single CSS custom property.
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
import { CaptureProvider, useCapture } from "~/shared/capture";
import { useKeyboardInset } from "~/shared/viewport";

import { BottomNav } from "./BottomNav";
import { MobileNav } from "./MobileNav";
import { MobileTopBar } from "./MobileTopBar";
import { MobileTopBarProvider } from "./mobile-top-bar-context";
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

/**
 * The phone bar, wired to the shared capture surface.
 *
 * A thin inner component because `useCapture()` must be read BENEATH the
 * `CaptureProvider` the shell itself mounts. `BottomNav` stays a pure,
 * prop-driven component so it can be tested without either provider.
 */
function ShellBottomNav({
  navigation,
  onOpenMore,
  moreOpen,
}: {
  readonly navigation: readonly NavigationItem[];
  readonly onOpenMore: (opener: HTMLElement) => void;
  readonly moreOpen: boolean;
}) {
  const capture = useCapture();
  return (
    <BottomNav
      navigation={navigation}
      onOpenCapture={(opener) => capture?.openCapture(undefined, opener)}
      onOpenMore={onOpenMore}
      moreOpen={moreOpen}
    />
  );
}

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
  // The control that opened the complete-navigation sheet ("More" on the phone
  // bar), so focus returns to it on close.
  const [navOpener, setNavOpener] = useState<HTMLElement | null>(null);

  // The ONE Visual Viewport listener in DalyHub. It publishes
  // `--dh-keyboard-inset`, which every keyboard-aware surface styles against —
  // there is never a per-form resize listener (MOBILE-01 §B3).
  useKeyboardInset();
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

  const openMoreNavigation = useCallback((opener: HTMLElement) => {
    setNavOpener(opener);
    setNavOpen(true);
  }, []);
  const closeMoreNavigation = useCallback(() => setNavOpen(false), []);

  return (
    <FeedbackProvider>
      <CommandContextProvider>
        <CaptureProvider>
          <MobileTopBarProvider>
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
                settingsHref="/settings"
                navId={RAIL_NAV_ID}
                variant="rail"
                onOpenSearch={openSearch}
                onOpenCommand={openCommand}
              />

              <div className="dh-main-col">
                {/* A `header` so the phone bar’s title and actions are contained by a
                landmark (the `banner`) on mobile, where the rail sidebar banner is
                hidden — otherwise its content sits outside every landmark (WCAG
                region, DS-11). On desktop this bar is `display:none` and ignored. */}
                <MobileTopBar
                  workspaceName={workspaceName}
                  onOpenSearch={openSearch}
                />

                <main id="main-content" className="dh-pane" tabIndex={-1}>
                  {children}
                </main>
              </div>

              {/* MOBILE-01: persistent phone navigation. Hidden above `md`, so the
              desktop rail experience is byte-for-byte unchanged. */}
              <ShellBottomNav
                navigation={navigation}
                onOpenMore={openMoreNavigation}
                moreOpen={navOpen}
              />

              {navOpen ? (
                <MobileNav
                  workspaceName={workspaceName}
                  email={email}
                  theme={theme}
                  navigation={navigation}
                  settingsHref="/settings"
                  opener={navOpener}
                  onClose={closeMoreNavigation}
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
          </MobileTopBarProvider>
        </CaptureProvider>
      </CommandContextProvider>
    </FeedbackProvider>
  );
}
