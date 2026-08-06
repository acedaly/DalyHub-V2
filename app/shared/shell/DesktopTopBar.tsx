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
 *   - the utilities that belong to the application rather than to a page — help,
 *     the appearance indicator, and the account menu.
 *
 * What it deliberately does NOT carry: a notification bell (DalyHub has no
 * notification system, and a bell that never rings is a decorative control), a
 * plan or billing entry (there is no plan concept), or a theme switch (there is
 * one generated light/dark pair selected by the operating system — ADR-074).
 *
 * Behaviour is UNCHANGED. The search control opens the same DS-08 Search surface
 * the sidebar entry opened, through the same `onOpenSearch` callback, passing the
 * same opener element so focus returns correctly on close; `/` still focuses it
 * and `⌘K` still toggles the palette, both through the one shared dispatcher in
 * `CommandShortcutLayer`. This is a relocation, not a reimplementation.
 *
 * It renders no landmark of its own — the shell already has a `banner` (the
 * sidebar brand) and a `main`, and a second banner would be a duplicate-landmark
 * violation. The search region is the one landmark here, and it is the only
 * `role="search"` in the desktop shell now that the rail no longer carries one.
 */

import {
  CommandIcon,
  HelpIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "~/shared/icons";

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
    <div className="dh-topbar">
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

        <AppearanceIndicator />

        <UserMenu
          email={email}
          name={name}
          settingsHref={settingsHref}
          placement="below"
          compact
        />
      </div>
    </div>
  );
}

/**
 * A read-only statement of which appearance is in force, and why.
 *
 * NOT a control: DalyHub has one generated light/dark pair and follows
 * `prefers-color-scheme` alone, so there is nothing here to change (ADR-074
 * decision 5). It is a `span`, not a button — it takes no focus and responds to
 * no click, because a control that looks operable and is not is worse than no
 * control.
 *
 * Both states are rendered and one is hidden by a media query rather than by
 * JavaScript, because the server cannot know the visitor's OS appearance and a
 * client-only guess would flash the wrong glyph on first paint. `display: none`
 * removes the hidden branch from the accessibility tree as well as from the
 * page, so exactly one of the two labels is ever announced.
 */
function AppearanceIndicator() {
  return (
    <span
      className="dh-topbar__appearance"
      title="DalyHub follows your device's light or dark appearance"
    >
      <span className="dh-topbar__appearance-state dh-topbar__appearance-state--light">
        <span className="dh-topbar__utility-icon" aria-hidden="true">
          <SunIcon />
        </span>
        <span className="dh-visually-hidden">
          Light appearance, following your device
        </span>
      </span>
      <span className="dh-topbar__appearance-state dh-topbar__appearance-state--dark">
        <span className="dh-topbar__utility-icon" aria-hidden="true">
          <MoonIcon />
        </span>
        <span className="dh-visually-hidden">
          Dark appearance, following your device
        </span>
      </span>
    </span>
  );
}
