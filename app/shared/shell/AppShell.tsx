/**
 * PX-02 application frame, with the MOBILE-01 phone shell.
 *
 * The premium application shell that replaces FND-09's website-like top bar
 * (PRODUCT_EXPERIENCE #1, #2): a persistent left sidebar owning identity and
 * navigation, and a full-height content pane with its own scroll. Layout is
 * `grid-template-columns: var(--app-shell-navigation-width) 1fr` — the sidebar width token
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

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import type { NavigationItem } from "~/platform/modules/navigation-adapter";
// Import the specific modules (not the `~/shared/commands` barrel) so the shell
// does NOT eagerly pull the palette controller / DS-08 Search UI into the initial
// bundle — the palette itself stays lazy-loaded (ADR-024 §24.13).
import { CommandContextProvider } from "~/shared/commands/CommandContextProvider";
import { CommandShortcutLayer } from "~/shared/commands/CommandShortcutLayer";
import type { ShortcutBinding } from "~/shared/commands/useCommandShortcuts";

import { FeedbackProvider } from "~/shared/feedback";
import { CaptureProvider, useCapture } from "~/shared/capture";
// Imported from the specific modules rather than the `~/shared/offline` barrel.
// The barrel also exports the Settings panel and the snapshot view, and a barrel
// import pulls their whole graph into the SHELL — which every page loads.
import { ConnectionStatus } from "~/shared/offline/ConnectionStatus";
import { OfflineProvider } from "~/shared/offline/OfflineProvider";
import { useKeyboardInset } from "~/shared/viewport";

import { BottomNav } from "./BottomNav";
import { CaptureFab } from "./CaptureFab";
import { DesktopTopBar } from "./DesktopTopBar";
import { MobileNav } from "./MobileNav";
import { MobileTopBar } from "./MobileTopBar";
import { MobileTopBarProvider } from "./mobile-top-bar-context";
import { Sidebar } from "./Sidebar";

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
 * UX-01 — the app-wide keyboard reference. Lazy for the same reason: it is opened
 * rarely, so its markup and the shared reference catalogue stay out of the initial
 * bundle until `?` is actually pressed.
 */
const KeyboardShortcutsSheet = lazy(
  () => import("~/shared/commands/KeyboardShortcutsSheet"),
);

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
  /**
   * APPEARANCE-01 — the owner's stored System/Light/Dark preference, threaded to
   * the account menu's appearance control. The same value `root.tsx` writes to
   * `<html data-appearance>`, from the same loader, so the control and the
   * document can never show different things.
   */
  readonly appearance: AppearancePreference;
  /** The derived, registry-driven navigation model. */
  readonly navigation: readonly NavigationItem[];
  /** The routed page content (the route `Outlet`). */
  readonly children: React.ReactNode;
};

export function AppShell({
  workspaceName = "DalyHub",
  email,
  appearance,
  navigation,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The control that opened the complete-navigation sheet ("More" on the phone
  // bar), so focus returns to it on close.
  const [navOpener, setNavOpener] = useState<HTMLElement | null>(null);

  // The ONE Visual Viewport listener in DalyHub. It publishes
  // `--app-keyboard-inset`, which every keyboard-aware surface styles against —
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
  const shortcutsOpenerRef = useRef<HTMLElement | null>(null);
  const shortcutsOpenRef = useRef(false);
  shortcutsOpenRef.current = shortcutsOpen;

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

  /**
   * UX-01 — the keyboard reference, available from EVERY surface. Before this the
   * reference lived only on Today, while its own first row told the owner that `?`
   * works "Anywhere". Registered as a FALLBACK binding, so Today's contextual `?`
   * (which hosts the same reference inside its drawer stack) still wins there.
   */
  const openShortcuts = useCallback(() => {
    if (shortcutsOpenRef.current) {
      return;
    }
    shortcutsOpenerRef.current =
      typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null);
    setNavOpen(false);
    setSearchOpen(false);
    setCommandOpen(false);
    setShortcutsOpen(true);
  }, []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  const fallbackShortcuts = useMemo<ShortcutBinding[]>(
    () => [
      {
        shortcut: { key: "?", modifiers: ["shift"] },
        onTrigger: openShortcuts,
      },
    ],
    [openShortcuts],
  );

  const openMoreNavigation = useCallback((opener: HTMLElement) => {
    setNavOpener(opener);
    setNavOpen(true);
  }, []);
  const closeMoreNavigation = useCallback(() => setNavOpen(false), []);

  return (
    <FeedbackProvider>
      {/* PWA-03 — ONE offline/connection context for the authenticated session.
       * It registers the service worker, owns the connection-state machine and
       * holds the device's snapshot + capture queue. It wraps the shell (rather
       * than a page) because the status surface, the capture sheet and the
       * Settings panel all read the same state, and because registration must
       * survive navigation between modules. */}
      <OfflineProvider>
        <CommandContextProvider>
          <CaptureProvider>
            <MobileTopBarProvider>
              <CommandShortcutLayer
                reserved={reservedShortcuts}
                fallback={fallbackShortcuts}
              />
              <div className="dh-app">
                <a className="skip-link" href="#main-content">
                  Skip to main content
                </a>

                <Sidebar
                  workspaceName={workspaceName}
                  email={email}
                  navigation={navigation}
                  settingsHref="/settings"
                  navId={RAIL_NAV_ID}
                  variant="rail"
                />

                <div className="dh-main-col">
                  {/* The DESKTOP top app bar: the primary search affordance and
                the application's own utilities. Hidden at phone widths, where
                the bar below takes over. It opens the SAME Search surface and
                the SAME palette the rail used to, through the same callbacks. */}
                  <DesktopTopBar
                    email={email}
                    appearance={appearance}
                    settingsHref="/settings"
                    onOpenSearch={openSearch}
                    onOpenCommand={openCommand}
                  />

                  {/* A `header` so the phone bar’s title and actions are contained by a
                landmark (the `banner`) on mobile, where the rail sidebar banner is
                hidden — otherwise its content sits outside every landmark (WCAG
                region, DS-11). On desktop this bar is `display:none` and ignored. */}
                  <MobileTopBar
                    workspaceName={workspaceName}
                    onOpenSearch={openSearch}
                  />

                  <main id="main-content" className="dh-pane" tabIndex={-1}>
                    {/* PWA-03 — the calm connection/sync surface. It renders
                  NOTHING while DalyHub is online, up to date and has nothing
                  queued: the absence of a warning is the healthy state. */}
                    <ConnectionStatus className="dh-pane__connection" />
                    {children}
                  </main>
                </div>

                {/* M3-01: the one floating action button, wired to the SAME
              shared capture surface every other entry point opens. It clears
              the phone navigation bar and the home indicator. */}
                <CaptureFab />

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
                    appearance={appearance}
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

                {shortcutsOpen ? (
                  <Suspense fallback={null}>
                    <KeyboardShortcutsSheet
                      onClose={closeShortcuts}
                      opener={shortcutsOpenerRef.current}
                    />
                  </Suspense>
                ) : null}
              </div>
            </MobileTopBarProvider>
          </CaptureProvider>
        </CommandContextProvider>
      </OfflineProvider>
    </FeedbackProvider>
  );
}
