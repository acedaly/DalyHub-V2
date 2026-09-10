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
 * DS-02 existed to write it against. It is now the shared `<Button>` (at
 * `secondary` emphasis since FINAL-UI — see the component), with the same label
 * and the same `openCapture` contract
 * on the one generic path — so it takes D33's control corner, the compact
 * density the application declares, and the shared state layer, and the shell
 * stops being a place where a button is drawn differently from every other
 * button in the product.
 *
 * The utilities are `IconButton` for the same reason. Each keeps its required
 * accessible name and its tooltip carrying the reserved shortcut.
 *
 * ── The bell, and the sentence that used to be here ─────────────────────────
 * This paragraph read: "What the bar deliberately does NOT carry: a notification
 * bell (DalyHub has no notification system, and a bell that never rings is a
 * decorative control — the references show one, and this is the clearest place
 * the product's truth has to win over the picture)". NOTIFY-01 changed the
 * truth, not the principle: there is a ledger of events now, the bell counts the
 * unread ones, and it opens a log of what was actually said. It is still absent
 * from the bar when the shell is not given a count to show, so a deployment with
 * notifications off gains no decorative control.
 *
 * What the bar still deliberately does NOT carry: a plan or billing entry (there
 * is no plan concept), or a standing appearance toggle. APPEARANCE-01 puts
 * appearance inside the account menu, because it is set once and then forgotten.
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
 *
 * ── UNTITLED-02 ─────────────────────────────────────────────────────────────
 *
 * The `dh-topbar__*` family and its ~230 lines of `shell.css` are gone. Search
 * takes Untitled's INPUT anatomy — the same height, radius, ring, shadow and
 * focus ring a real `Input` has — while remaining a `<button>`, so it looks like
 * the field it opens without becoming a second search implementation. The
 * utilities are Untitled's `ButtonUtility`, and Create is Untitled's `Button`.
 *
 * The bar also lost its background. It was a filled band above the pane, which
 * put two horizontal edges between the rail's top and the page's first row; it is
 * now the same canvas as the pane with a single hairline under it, so the frame
 * reads as one surface and the eye goes to the content rather than to the
 * chrome.
 */

import type { MouseEvent } from "react";

import { Command, HelpCircle, Plus, SearchLg } from "@untitledui/icons";

import { useCapture } from "~/shared/capture";
import { NotificationBell } from "~/shared/notifications";
import { Tooltip } from "~/shared/tooltip";
import { Button } from "~/shared/ui/untitled/base/buttons/button";
import { ButtonUtility } from "~/shared/ui/untitled/base/buttons/button-utility";

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
  return (
    <Button
      /*
       * FINAL-UI — SECONDARY, not primary, and the reason is §73 rather than a
       * demotion of global capture.
       *
       * Two filled violet buttons were on screen at once on every collection in
       * the product: this one in the frame, and the page's own "+ New task" /
       * "+ New project" twenty pixels below it. The brief asks for one primary
       * action per major surface, and the approved concepts are unambiguous
       * about which one it is — every concept page draws its create action in
       * the PAGE header and none of them fills the bar's control. The action,
       * its label, its shortcut, its accessible name and its unconditional touch
       * target are all unchanged; only the emphasis moved to the surface that
       * owns the record being created.
       */
      color="secondary"
      size="md"
      data-testid="topbar-create"
      iconLeading={Plus}
      /*
       * `onPress`, and the OPENER comes from the event rather than a ref — see
       * the same note in `Sidebar`. The button hands itself to `openCapture`, so
       * focus returns here when the surface closes, which is the contract the
       * retired floating button had.
       */
      onPress={(event) => {
        capture?.openCapture(undefined, event.target as HTMLElement);
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
  /**
   * NOTIFY-01 — opens the notification inbox. Omitted (with `unread`) renders no
   * bell at all, which is what the pre-NOTIFY-01 bar was and what a surface
   * rendering this component without the shell's loader data still gets.
   */
  readonly onOpenNotifications?: (opener: HTMLElement) => void;
  readonly unreadNotifications?: number;
  readonly notificationsOpen?: boolean;
};

export function DesktopTopBar({
  onOpenSearch,
  onOpenCommand,
  onOpenNotifications,
  unreadNotifications = 0,
  notificationsOpen = false,
}: DesktopTopBarProps) {
  return (
    <header
      data-testid="desktop-top-bar"
      className="flex h-16 shrink-0 items-center gap-3 border-b border-secondary bg-primary px-4 max-md:hidden lg:px-6"
    >
      {/* Search LEADS, aligned to the page gutter beneath it. */}
      <div
        role="search"
        aria-label="Search DalyHub"
        className="min-w-0 flex-1 lg:max-w-80"
      >
        <button
          type="button"
          data-testid="topbar-search"
          onClick={
            onOpenSearch
              ? (event) => onOpenSearch(event.currentTarget)
              : undefined
          }
          /*
           * Untitled's `Input` anatomy, on a button. Same height, radius, ring,
           * shadow and focus treatment as a real field, so the control looks
           * like the surface it opens — but it is still a button, because a
           * second real text field would be a second search implementation to
           * keep in step with the first.
           */
          className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-md shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <SearchLg
            aria-hidden="true"
            className="size-5 shrink-0 text-fg-quaternary"
          />
          {/* The label is REAL text and the button's accessible name AT EVERY
           * WIDTH: visible from `lg` up, collapsed with the visually-hidden
           * technique (never `display:none`) below it, so the name survives the
           * visual collapse. Pointer and screen reader are told the same thing;
           * `aria-hidden` on the hint keeps the shortcut out of the name. */}
          <span className="flex-1 truncate text-left text-sm text-placeholder max-lg:sr-only">
            Search DalyHub
          </span>
          <kbd
            aria-hidden="true"
            className="hidden shrink-0 rounded border border-secondary px-1.5 py-0.5 font-mono text-xs text-quaternary lg:inline-block"
          >
            /
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Every utility here is icon-only, and each one needs to say what it is
         * to a pointer AND a keyboard. `ButtonUtility` requires the accessible
         * name by type and composes Untitled's tooltip, which carries each one's
         * reserved shortcut. */}
        <ButtonUtility
          size="sm"
          color="tertiary"
          icon={Command}
          /*
           * `ButtonUtility` names itself from its `tooltip`, which would make the
           * accessible name "Command palette ⌘K". The shortcut is a DESCRIPTION,
           * not part of the name — the same distinction the retired bar made by
           * putting `aria-hidden` on its hint — so the label is stated
           * separately and overrides it. Both still reach a pointer.
           */
          tooltip="Command palette  ⌘K"
          aria-label="Command palette"
          onClick={
            onOpenCommand
              ? (event: MouseEvent<HTMLButtonElement>) =>
                  onOpenCommand(event.currentTarget)
              : undefined
          }
        />

        {/* Help is a real destination, so it stays an ANCHOR rather than
         * becoming a button that navigates: middle-click, "open in new tab" and
         * the status-bar preview are all behaviours a button would remove.
         * `ButtonUtility` renders a `<button>`, so this composes the shared
         * tooltip directly and takes the same paint. */}
        <Tooltip label="Help" placement="bottom">
          {(tip) => (
            <a
              ref={tip.ref}
              href="/help"
              aria-describedby={tip.describedBy}
              className="flex size-9 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <HelpCircle aria-hidden="true" className="size-5" />
              <span className="sr-only">Help</span>
            </a>
          )}
        </Tooltip>

        {onOpenNotifications ? (
          <NotificationBell
            unread={unreadNotifications}
            open={notificationsOpen}
            onOpen={onOpenNotifications}
            testId="topbar-notifications"
          />
        ) : null}

        <TopBarCreate />
      </div>
    </header>
  );
}
