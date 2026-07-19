/**
 * PX-02 shell — the sidebar Search and Command Palette entries.
 *
 * The two keyboard-shell affordances that sit above primary navigation
 * (PRODUCT_EXPERIENCE #1, Part II navigation philosophy): a Search entry (`/`
 * focuses it) and a Command Palette entry (`⌘K`). PX-02 ships the FRAME — the
 * durable home and reserved shortcut hints — while the surfaces they open are built
 * in DS-08 (Search) and DS-09 (Command Palette). Each is a real, labelled,
 * keyboard-reachable button; a consumer wires `onOpenSearch`/`onOpenCommand` when
 * those land, so nothing here is bespoke or throwaway.
 *
 * The shortcut hints are decorative text; the accessible name is the label.
 */

import { CommandIcon, SearchIcon } from "~/shared/icons";

export type SidebarSearchProps = {
  /**
   * Opens global Search (DS-08). Receives the triggering button so Search can
   * restore focus to it on close. Absent until DS-08 wires it.
   */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Opens the Command Palette (DS-09). Absent until DS-09 wires it. */
  readonly onOpenCommand?: () => void;
};

export function SidebarSearch({
  onOpenSearch,
  onOpenCommand,
}: SidebarSearchProps) {
  return (
    <div className="dh-sidebar__search" aria-label="Search and commands">
      <button
        type="button"
        className="dh-sidebar__search-entry"
        onClick={
          onOpenSearch
            ? (event) => onOpenSearch(event.currentTarget)
            : undefined
        }
      >
        <span className="dh-sidebar__search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <span className="dh-sidebar__search-label">Search</span>
        <kbd className="dh-sidebar__search-hint" aria-hidden="true">
          /
        </kbd>
      </button>
      <button
        type="button"
        className="dh-sidebar__search-entry"
        onClick={onOpenCommand}
      >
        <span className="dh-sidebar__search-icon" aria-hidden="true">
          <CommandIcon />
        </span>
        <span className="dh-sidebar__search-label">Command palette</span>
        <kbd className="dh-sidebar__search-hint" aria-hidden="true">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}
