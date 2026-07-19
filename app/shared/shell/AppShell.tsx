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

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { MobileNav } from "./MobileNav";
import { MenuIcon } from "~/shared/icons";
import { Sidebar } from "./Sidebar";
import type { ThemePreference } from "./theme";

/** The DOM id of the persistent rail's primary navigation. */
const RAIL_NAV_ID = "primary-navigation";

/**
 * The full Search surface (DS-08) is lazy-loaded by module path so the complete
 * search UI, controller and model stay OUT of the initial application bundle and
 * out of every route chunk — the chunk loads only when Search is first opened.
 */
const SearchSurface = lazy(() => import("~/shared/search/SearchSurface"));

/** True when a keydown should be ignored by the global `/` Search shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
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
  const toggleRef = useRef<HTMLButtonElement>(null);
  // The element focus returns to when Search closes — whatever opened it (the
  // sidebar Search button, or the element focused when `/` was pressed).
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  // Mirror of `searchOpen` for the document keydown listener, so a repeated `/`
  // press while Search is already open is a no-op (it never re-captures a new
  // opener or re-triggers the surface).
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;

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
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // The Product Frame allocates `/` to focus Search anywhere in the app
  // (PRODUCT_EXPERIENCE) — it never claims the `⌘K` command-palette shortcut.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      openSearch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  return (
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
      />

      <div className="dh-main-col">
        <div className="dh-mobilebar">
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
        </div>

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
    </div>
  );
}
