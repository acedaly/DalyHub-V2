/**
 * The desktop top app bar.
 *
 * ── The search control is a COMPACT CAPSULE ─────────────────────────────────
 * It has been all three things a search affordance can be, and the third is the
 * right one.
 *
 * It began as a 56px pill spanning the start of the content region — the first
 * and largest thing on every screen, on a product with one user who knows what
 * their own data contains. On Today that pill was the whole top of the page, and
 * the day's work started below it. M3-01 replaced it with a 40px glyph in the
 * utility cluster, which fixed the size and lost the affordance: an icon says
 * "there is a control here", it does not say "you can search your workspace".
 *
 * VIS-01 draws the middle answer the convergence reference uses — a control
 * that LOOKS like a field, states what it searches, prints its shortcut, and is
 * bounded: it sits in the utility cluster at the trailing end of the bar, at
 * control height rather than 56px, and it never spans the content region. It
 * collapses back to the glyph below `lg`, where a bounded capsule and a page
 * title cannot both have the width.
 *
 * It is still a BUTTON that opens the DS-08 Search surface, not an input. A
 * second real text field would be a second search implementation to keep in
 * step with the first. The accessible name, the `role="search"` region and the
 * `/` shortcut are the same ones the pill and the glyph had.
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
 * plan or billing entry (there is no plan concept), or a standing appearance
 * toggle. APPEARANCE-01 gives the owner a real System/Light/Dark choice, and puts
 * it INSIDE the account menu rather than beside these utilities: appearance is set
 * once and then forgotten, so a permanent sun/moon glyph in the bar would spend
 * top-level chrome — on every page, at every width — on a control that is used
 * about as often as Sign out.
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

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import { CommandIcon, HelpIcon, SearchIcon } from "~/shared/icons";
import { Tooltip } from "~/shared/tooltip";

import { UserMenu } from "./UserMenu";

export type DesktopTopBarProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
  /** The owner's stored appearance preference, for the account menu's control. */
  readonly appearance: AppearancePreference;
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
  appearance,
  name,
  settingsHref,
  onOpenSearch,
  onOpenCommand,
}: DesktopTopBarProps) {
  return (
    <header className="dh-topbar">
      <div className="dh-topbar__utilities">
        {/* Search leads the utility cluster — it is the most-used of them, and
         * the tooltip carries the `/` shortcut the pill used to print. */}
        <div role="search" aria-label="Search DalyHub">
          <button
            type="button"
            className="dh-topbar__search md-state-layer"
            onClick={
              onOpenSearch
                ? (event) => onOpenSearch(event.currentTarget)
                : undefined
            }
          >
            <span className="dh-topbar__search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            {/* The label is REAL text, not a placeholder and not a visually
             * hidden name on a glyph: a control that looks like a field has to
             * say what searching it does, and this is the accessible name as
             * well, so pointer and screen reader are told the same thing.
             * `aria-hidden` on the hint keeps the shortcut out of that name. */}
            <span className="dh-topbar__search-label">Search DalyHub</span>
            <span className="dh-topbar__search-hint" aria-hidden="true">
              /
            </span>
          </button>
        </div>

        {/* M3-TIP — every utility here is icon-only, and none of them said what
         * it was to a pointer OR a keyboard before. The shared tooltip names them
         * on hover and on `:focus-visible`, and carries each one's reserved
         * shortcut. */}
        <Tooltip label="Command palette" shortcut="Mod-k" placement="bottom">
          {(tip) => (
            <button
              type="button"
              ref={tip.ref}
              className="dh-topbar__utility md-state-layer"
              aria-describedby={tip.describedBy}
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
          )}
        </Tooltip>

        <Tooltip label="Help" placement="bottom">
          {(tip) => (
            <a
              ref={tip.ref}
              className="dh-topbar__utility md-state-layer"
              href="/help"
              aria-describedby={tip.describedBy}
            >
              <span className="dh-topbar__utility-icon" aria-hidden="true">
                <HelpIcon />
              </span>
              <span className="dh-visually-hidden">Help</span>
            </a>
          )}
        </Tooltip>

        <UserMenu
          email={email}
          appearance={appearance}
          name={name}
          settingsHref={settingsHref}
          placement="below"
          compact
        />
      </div>
    </header>
  );
}
