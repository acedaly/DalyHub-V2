/**
 * The desktop top app bar.
 *
 * ── What the bar is for ─────────────────────────────────────────────────────
 * Two things, and nothing else:
 *
 *   - the primary SEARCH affordance;
 *   - the actions that belong to the APPLICATION rather than to a page — create,
 *     the command palette, help.
 *
 * Everything about a PAGE — its title, its filters, its own primary action —
 * belongs to the Pane Header beneath it. Keeping the two apart is what stopped
 * records, collections and Settings each growing a different header.
 *
 * ── DS-03 — search LEADS the bar ────────────────────────────────────────────
 * The search control has been in three places and this is the fourth, which
 * needs saying plainly because each move was a correction of the last.
 *
 * It began as a 56px pill spanning the start of the content region: the first
 * and largest thing on every screen, in a product with one user who knows what
 * their own data contains. M3-01 replaced it with a 40px glyph in the utility
 * cluster, which fixed the size and lost the affordance. VIS-01 drew the middle
 * answer — a control that looks like a field, states what it searches, prints
 * its shortcut and is bounded — and put it at the TRAILING end of the bar,
 * because that is where the account menu and the utilities already were and a
 * capsule floating at the left of an otherwise empty bar looked stranded.
 *
 * DS-03 moves it to the LEADING edge, which is where both concept references
 * draw it and where it should have been once the bar had a reason to be there.
 * Two things changed to make it possible:
 *
 *   - the ACCOUNT menu moved to the bottom of the rail (`Sidebar`), so the
 *     trailing cluster is three compact controls rather than five and the bar
 *     is no longer weighted to one end;
 *   - the bar came down to 56px, so a field at the left of it reads as the top
 *     of the working area rather than as a band above it.
 *
 * It aligns to the page gutter, so the search field, the page title beneath it
 * and the first card below that all start on the same vertical line — the
 * alignment the Pane Header already established with the content it titles.
 *
 * It is still a BUTTON that opens the DS-08 Search surface, not an input. A
 * second real text field would be a second search implementation to keep in step
 * with the first. The accessible name, the `role="search"` region and the `/`
 * shortcut are the same ones the pill and the glyph had, and it still collapses
 * to a labelled glyph below `lg`, where the bar has to leave the pane its width.
 *
 * ── The create action is the shared Button ──────────────────────────────────
 * It was a hand-rolled `.dh-topbar__create`: a violet stadium, written before
 * DS-02 existed to write it against. It is now `<Button variant="primary">`,
 * which is the same colour, the same label and the same `openCapture` contract
 * on the one generic path — so it takes D33's control corner, the compact
 * density the application declares, and the shared state layer, and the shell
 * stops being a place where a button is drawn differently from every other
 * button in the product.
 *
 * The utilities are `IconButton` for the same reason. Each keeps its required
 * accessible name and its tooltip carrying the reserved shortcut.
 *
 * What the bar deliberately does NOT carry: a notification bell (DalyHub has no
 * notification system, and a bell that never rings is a decorative control — the
 * references show one, and this is the clearest place the product's truth has to
 * win over the picture), a plan or billing entry (there is no plan concept), or
 * a standing appearance toggle. APPEARANCE-01 puts appearance inside the account
 * menu, because it is set once and then forgotten.
 *
 * LANDMARKS. This bar is the desktop `banner`, which is what a top app bar is.
 * It has to be a landmark rather than a bare `div`: axe's `region` rule requires
 * all page content to be contained by one, and the utilities here are page
 * content — the first version of this component shipped them in a plain `div`
 * and failed the Help and About accessibility scans for exactly that reason.
 * There is still exactly one `banner` per viewport: this bar on desktop (where
 * the phone bar is `display: none`) and `MobileTopBar` on the phone. The rail is
 * a `navigation` landmark in its own right and contains its brand block and now
 * its account block, so nothing lost containment when the account moved.
 *
 * The search region nests inside the banner, which is ordinary, and it is the
 * only `role="search"` in the desktop shell.
 */

import { useRef } from "react";

import { useCapture } from "~/shared/capture";
import { CommandIcon, HelpIcon, PlusIcon, SearchIcon } from "~/shared/icons";
import { Tooltip } from "~/shared/tooltip";
import { Button, IconButton } from "~/shared/ui";

/**
 * The bar's CREATE control, wired to the shared capture surface.
 *
 * A thin inner component because `useCapture()` must be read beneath the shell's
 * own `CaptureProvider`, and `DesktopTopBar` is rendered inside it. The button
 * hands itself to `openCapture` as the opener, so focus returns here when the
 * surface closes — the same contract the retired floating button had.
 */
function TopBarCreate() {
  const capture = useCapture();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Button
      variant="primary"
      ref={ref}
      className="dh-topbar__create"
      data-testid="topbar-create"
      icon={<PlusIcon />}
      onClick={() => {
        if (ref.current) capture?.openCapture(undefined, ref.current);
      }}
    >
      {/* Real text, and the accessible name — never a visually-hidden name on a
       * glyph. The references' button says "New", a violet control this
       * prominent must say what it does, and the word costs ~30px in a cluster
       * that has the room at every width this bar is shown at. */}
      New
    </Button>
  );
}

export type DesktopTopBarProps = {
  /** Opens global Search (DS-08), receiving the trigger so focus can return. */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Opens the Command Palette (DS-09), receiving the trigger for the same reason. */
  readonly onOpenCommand?: (opener: HTMLElement) => void;
};

export function DesktopTopBar({
  onOpenSearch,
  onOpenCommand,
}: DesktopTopBarProps) {
  return (
    <header className="dh-topbar">
      {/* Search LEADS, aligned to the page gutter beneath it. */}
      <div
        role="search"
        aria-label="Search DalyHub"
        className="dh-topbar__lead"
      >
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
          {/* The label is REAL text, not a placeholder and not a visually hidden
           * name on a glyph: a control that looks like a field has to say what
           * searching it does, and this is the accessible name as well, so
           * pointer and screen reader are told the same thing. `aria-hidden` on
           * the hint keeps the shortcut out of that name. */}
          <span className="dh-topbar__search-label">Search DalyHub</span>
          <span className="dh-topbar__search-hint" aria-hidden="true">
            /
          </span>
        </button>
      </div>

      <div className="dh-topbar__utilities">
        {/* M3-TIP — every utility here is icon-only, and none of them said what
         * it was to a pointer OR a keyboard before. `IconButton` requires the
         * accessible name by type and composes the shared tooltip, which carries
         * each one's reserved shortcut. */}
        <IconButton
          icon={<CommandIcon />}
          label="Command palette"
          tooltip
          shortcut="Mod-k"
          onClick={
            onOpenCommand
              ? (event) => onOpenCommand(event.currentTarget)
              : undefined
          }
        />

        {/* Help is a real destination, so it stays an ANCHOR rather than
         * becoming a button that navigates: middle-click, "open in new tab" and
         * the status-bar preview are all behaviours a button would remove.
         * `IconButton` renders a `<button>`, and there is no icon-only link
         * primitive to reach for — so this composes the shared tooltip directly,
         * exactly as `IconButton` does internally, and takes the same paint from
         * `.dh-topbar__utility`. */}
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

        <TopBarCreate />
      </div>
    </header>
  );
}
