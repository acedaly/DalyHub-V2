/**
 * The desktop top app bar.
 *
 * Before this, DalyHub had no top app bar above the phone breakpoint at all: the
 * shell was a rail and a pane, so the primary search lived in the navigation
 * drawer as a 56px pill with an equally prominent Command palette pill beneath
 * it, and every page's own header had to double as the application bar. That is
 * why records, collections and Settings each grew a different header.
 *
 * The bar owns two things and nothing else:
 *
 *   - the primary SEARCH affordance, at the start of the content region so it
 *     lines up with the page beneath it;
 *   - the utilities that belong to the application rather than to a page — the
 *     command palette, help, and the account menu.
 *
 * What it deliberately does NOT carry: a notification bell (DalyHub has no
 * notification system, and a bell that never rings is a decorative control), a
 * plan or billing entry (there is no plan concept), a theme switch, or an
 * appearance indicator. The last one was built and then removed: DalyHub follows
 * `prefers-color-scheme` and has no appearance action at all, so a sun/moon glyph
 * in a row of controls reads as a theme toggle that does nothing. An icon that
 * looks operable and is not is worse than no icon (ADR-074 decision 5).
 *
 * Behaviour is UNCHANGED. The search control opens the same DS-08 Search surface
 * the sidebar entry opened, through the same `onOpenSearch` callback, passing the
 * same opener element so focus returns correctly on close; `/` still focuses it
 * and `⌘K` still toggles the palette, both through the one shared dispatcher in
 * `CommandShortcutLayer`. This is a relocation, not a reimplementation.
 *
 * LANDMARKS. This bar is the desktop `banner`, which is what a top app bar is.
 * It has to be a landmark rather than a bare `div`: axe's `region` rule requires
 * all page content to be contained by one, and the utilities here are page
 * content — the first version of this component shipped them in a plain `div`
 * and failed the Help and About accessibility scans for exactly that reason.
 *
 * The banner moved here FROM the sidebar brand block, so there is still exactly
 * one per viewport: this bar on desktop (where the phone bar is `display: none`)
 * and `MobileTopBar` on the phone (where this one is). The drawer is now a
 * `navigation` landmark in its own right and contains its brand block, so
 * nothing lost containment in the move.
 *
 * The search region nests inside the banner, which is ordinary, and it is the
 * only `role="search"` in the desktop shell now that the rail carries none.
 */

import { CommandIcon, HelpIcon, SearchIcon } from "~/shared/icons";

import { UserMenu } from "./UserMenu";

export type DesktopTopBarProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
  /** Optional display name; derived from the email when absent. */
  readonly name?: string;
  /** The first-class Settings route, surfaced inside the account menu. */
  readonly settingsHref?: string;
  /** Opens global Search (DS-08), receiving the trigger so focus can return. */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Opens the Command Palette (DS-09), receiving the trigger for the same reason. */
  readonly onOpenCommand?: (opener: HTMLElement) => void;
};

export function DesktopTopBar({
  email,
  name,
  settingsHref,
  onOpenSearch,
  onOpenCommand,
}: DesktopTopBarProps) {
  return (
    <header className="dh-topbar">
      <div
        className="dh-topbar__search"
        role="search"
        aria-label="Search DalyHub"
      >
        <button
          type="button"
          className="dh-topbar__search-entry md-state-layer"
          onClick={
            onOpenSearch
              ? (event) => onOpenSearch(event.currentTarget)
              : undefined
          }
        >
          <span className="dh-topbar__search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span className="dh-topbar__search-label">Search DalyHub…</span>
          {/* Decorative: the accessible name is the label, and the shortcut is
           * published properly in the keyboard reference. */}
          <kbd className="dh-topbar__search-hint" aria-hidden="true">
            /
          </kbd>
        </button>
      </div>

      <div className="dh-topbar__utilities">
        {/* The palette keeps a home in the chrome, but as a 40px icon control
         * rather than as a second full-width pill competing with search. */}
        <button
          type="button"
          className="dh-topbar__utility md-state-layer"
          onClick={
            onOpenCommand
              ? (event) => onOpenCommand(event.currentTarget)
              : undefined
          }
        >
          <span className="dh-topbar__utility-icon" aria-hidden="true">
            <CommandIcon />
          </span>
          <span className="dh-visually-hidden">Command palette</span>
        </button>

        <a className="dh-topbar__utility md-state-layer" href="/help">
          <span className="dh-topbar__utility-icon" aria-hidden="true">
            <HelpIcon />
          </span>
          <span className="dh-visually-hidden">Help</span>
        </a>

        <UserMenu
          email={email}
          name={name}
          settingsHref={settingsHref}
          placement="below"
          compact
        />
      </div>
    </header>
  );
}
