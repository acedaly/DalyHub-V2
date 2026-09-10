/**
 * PX-02 shell — the persistent sidebar (and the mobile overlay's content).
 *
 * The sidebar is the one element that never changes between surfaces
 * (PRODUCT_EXPERIENCE Part II): workspace identity at the top, primary
 * navigation, a spacer, and — in the mobile sheet — the Search entries and the
 * user menu. The SAME component renders as the desktop rail and as the mobile
 * overlay sheet; the `variant` decides which of the two carries the chrome that
 * the desktop top app bar now owns.
 *
 * The RAIL carries no Search entry. Search lives in the desktop top app bar
 * (`DesktopTopBar`). The OVERLAY keeps both Search and the palette, because the
 * phone has no top app bar of that kind and the sheet is where a thumb reaches
 * them.
 *
 * ── DS-03 — the ACCOUNT is at the bottom, and only the account ──────────────
 * Search is an ACTION — it opens a surface, it has a shortcut, it belongs with
 * the other actions at the top of the working area. The account is an IDENTITY,
 * and identity belongs with the other identity in the frame: the product mark at
 * the top of the same column. A rail that opens with "DalyHub" and closes with
 * "you" is a frame; a rail that opens with "DalyHub" and ends in whitespace is a
 * menu.
 *
 * ── UNTITLED-02 — the composition is Untitled UI's ──────────────────────────
 *
 * Adapted from Untitled's `sidebar-sections-subheadings`: a single scrolling
 * column with grouped, sub-headed destinations and an account block pinned to the
 * bottom. Three DalyHub departures from that reference, each deliberate:
 *
 *   1. THE RAIL IS RECESSED, not floating. Untitled draws a white card inset
 *      from the viewport with a ring and a shadow. AGENTS.md §6 D35 is explicit
 *      that DalyHub's rail sits UNDER its own canvas — near-white beneath a
 *      white page — because it is a different surface from the page it frames,
 *      not an object resting on it. So it is `bg-secondary` against the pane's
 *      `bg-primary`, flush and full-height, with one hairline. It is also what
 *      "stationary surfaces should not rely on elevation" means in practice.
 *
 *   2. CAPTURE KEEPS THE PRIMARY CONTROL. Untitled's reference puts a search
 *      glyph beside the logo and nothing else. Capture is one of DalyHub's
 *      defining actions and the brief is explicit that it must not be buried, so
 *      the rail's one filled control is Capture — the only primary-emphasis
 *      button in the whole frame.
 *
 *   3. NO `NavAccountCard`. Untitled's account block is a bordered card with an
 *      avatar, a name, an email and a dismiss button — four elements and a
 *      border to say one thing. `UserMenu` is a single row that opens the real
 *      menu, which is what the account actually needs to be.
 *
 * It composes shared parts only and holds no business logic. The `navId` is
 * parameterised so the persistent and overlay instances never collide on a DOM id.
 */

import type { RefObject } from "react";

import { useCapture } from "~/shared/capture";
import { Button } from "~/shared/ui/untitled/base/buttons/button";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { Plus, X as CloseGlyph } from "@untitledui/icons";

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { PrimaryNavigation } from "./PrimaryNavigation";
import { SidebarBrand } from "./SidebarBrand";
import { SidebarSearch } from "./SidebarSearch";
import { UserMenu } from "./UserMenu";
import { useCollapsedRail } from "./collapsed-rail";

export type SidebarProps = {
  /** The current workspace's display name. */
  readonly workspaceName: string;
  /** The authenticated owner's verified email. */
  readonly email: string;
  /**
   * The owner's stored appearance preference, for the account menu's control.
   * Optional, and defaults to `system`, so a Sidebar rendered without it (a
   * test, a future preview) still draws a correct — if not personalised —
   * control rather than an empty one.
   */
  readonly appearance?: AppearancePreference;
  /** The registry-driven navigation model. */
  readonly navigation: readonly NavigationItem[];
  /** The first-class Settings route. */
  readonly settingsHref?: string;
  /** The DOM id of this instance's primary nav (unique per instance). */
  readonly navId: string;
  /** `rail` = persistent desktop sidebar; `overlay` = mobile sheet content. */
  readonly variant?: "rail" | "overlay";
  /** Called after a navigation target is chosen (closes the mobile sheet). */
  readonly onNavigate?: () => void;
  /** When provided, renders a Close control (mobile overlay only). */
  readonly onClose?: () => void;
  /** Ref for the Close control, so the overlay can focus it on open. */
  readonly closeButtonRef?: RefObject<HTMLButtonElement | null>;
  /** Opens global Search (DS-08) from the Search affordance. */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Opens the Command Palette (DS-09) from the Command Palette affordance. */
  readonly onOpenCommand?: (opener: HTMLElement) => void;
};

export function Sidebar({
  workspaceName,
  email,
  appearance = "system",
  navigation,
  settingsHref,
  navId,
  variant = "rail",
  onNavigate,
  onClose,
  closeButtonRef,
  onOpenSearch,
  onOpenCommand,
}: SidebarProps) {
  const capture = useCapture();
  const isRail = variant === "rail";
  /*
   * The rail collapses to glyphs on a tablet; the sheet never does. Read here as
   * well as inside `PrimaryNavigation` so the brand, the Capture control and the
   * account row collapse WITH the rows rather than a beat behind them — one
   * media listener each, both driven by the same shared hook.
   */
  const collapsed = useCollapsedRail(isRail);

  return (
    /*
     * The DRAWER is the `navigation` landmark, not just the list inside it.
     *
     * The brand block, and (in the overlay) the search entries and the account
     * menu, are page content too, and axe's `region` rule wants all of it inside
     * a landmark. Labelling the drawer rather than the inner list is what puts
     * them there — and it is honest, because the drawer as a whole IS the primary
     * navigation region. The inner nav keeps its id so the phone sheet's "More"
     * control still has a real `aria-controls` target.
     */
    <nav
      aria-label="Primary"
      data-testid={isRail ? "sidebar-rail" : "sidebar-overlay"}
      className={cx(
        "flex h-full min-h-0 flex-col gap-5",
        isRail
          ? cx(
              /*
               * Recessed under the pane's canvas, flush and full-height. See (1).
               *
               * STICKY, not `fixed` — and it must NOT be a scroll container.
               * The document is the scroll container (so the Drawer's body-scroll
               * lock and `ScrollRestoration` keep working, and sticky page
               * headers still pin to the viewport), the rail sticks beside it,
               * and only the destination LIST below scrolls. Making the rail
               * itself scroll would make it a clipping ancestor for the account
               * panel that opens out of it — measured once at 68px wide on a
               * tablet, with Settings and Sign out sliced to single letters.
               *
               * `z-20` puts it above the pane's own positioned content, so that
               * upward-opening panel is painted over the page rather than under
               * it; the top bar and every overlay still outrank it.
               */
              // Below `md` there is no rail at all — the phone's bottom bar
              // navigates, and "More" opens this same component as a sheet.
              "max-md:hidden",
              "sticky top-0 z-20 h-dvh border-r border-secondary bg-secondary",
              collapsed ? "px-3 py-4" : "px-4 py-5",
            )
          : "min-h-full bg-primary px-4 py-4",
      )}
    >
      {onClose ? (
        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <CloseGlyph aria-hidden="true" className="size-5" />
          <span className="sr-only">Close navigation</span>
        </button>
      ) : null}

      <SidebarBrand workspaceName={workspaceName} collapsed={collapsed} />

      {isRail && capture ? (
        /*
         * The ONE primary-emphasis control in the frame. Icon-only when the rail
         * collapses — the label stays as the accessible name, so the control is
         * never unnamed.
         */
        <Button
          size="md"
          color="primary"
          iconLeading={Plus}
          className="w-full"
          aria-label={collapsed ? "Capture" : undefined}
          data-testid="sidebar-capture"
          /*
           * `onPress`, and the OPENER comes from the event rather than a ref.
           *
           * Untitled's `Button` forwards its props to React Aria's, whose type
           * does not declare `ref` — and it does not need to. The press event
           * already carries the element that was pressed, which is exactly what
           * `openCapture` wants so focus can return here when the surface
           * closes. One less ref, and it cannot be null at the moment it is
           * read.
           */
          onPress={(event) => {
            capture.openCapture(undefined, event.target as HTMLElement);
          }}
        >
          {collapsed ? null : "Capture"}
        </Button>
      ) : null}

      {!isRail ? (
        <SidebarSearch
          onOpenSearch={onOpenSearch}
          onOpenCommand={onOpenCommand}
        />
      ) : null}

      {/* The one scrolling region. Everything above and below it is pinned, so a
       * long module list never pushes identity or the account off the rail. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <PrimaryNavigation
          id={navId}
          items={navigation}
          onNavigate={onNavigate}
          collapsible={isRail}
          surface={isRail ? "rail" : "sheet"}
        />
      </div>

      {/* DS-03 — the bottom utility region, on BOTH variants.
       *
       * The SAME component and the same `above` placement in each: the trigger
       * is pinned to the bottom of a column and the panel opens upward from it,
       * which was already the shape this menu was built for. The rail and the
       * sheet differ only in the width around it. */}
      <div className="mt-auto border-t border-secondary pt-4">
        <UserMenu
          email={email}
          appearance={appearance}
          settingsHref={settingsHref}
          collapsible={isRail}
        />
      </div>
    </nav>
  );
}
