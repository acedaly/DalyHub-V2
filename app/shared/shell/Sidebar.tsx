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
 * The RAIL carries no Search entry. Search moved into the desktop top app bar
 * (`DesktopTopBar`): a drawer that opened with a 56px Search pill and a 56px
 * Command palette pill spent 112px before its first destination, and duplicated
 * the primary search affordance. The OVERLAY keeps both, because the phone has
 * no top app bar of that kind and the sheet is where a thumb reaches them.
 *
 * ── DS-03 — the ACCOUNT came back, and only the account ─────────────────────
 * The same pass that moved Search out moved the account menu out with it, on the
 * reasoning that the drawer had become a list of two large chrome objects and
 * fourteen destinations. That was right about Search and wrong about the
 * account, and the two concept references are unambiguous about which: the
 * bottom of the rail carries the owner's avatar, name and email, and the top bar
 * carries search and one create action.
 *
 * The distinction is what each thing IS. Search is an ACTION — it opens a
 * surface, it has a shortcut, it belongs with the other actions at the top of
 * the working area. The account is an IDENTITY, and identity belongs with the
 * other identity in the frame: the product mark at the top of the same column.
 * A rail that opens with "DalyHub" and closes with "you" is a frame; a rail that
 * opens with "DalyHub" and ends in whitespace is a menu.
 *
 * It also pays for itself in the region the concepts care most about. The bar
 * gave up its widest trailing control, which is what let Search move to the
 * LEADING edge where the page's own content starts.
 *
 * The OVERLAY is unchanged and still renders both: a phone sheet is the only
 * place either lives at that width.
 *
 * It composes shared parts only and holds no business logic. The `navId` is
 * parameterised so the persistent and overlay instances never collide on a DOM id.
 */

import { useRef, type RefObject } from "react";

import { useCapture } from "~/shared/capture";
import { CloseIcon, PlusIcon } from "~/shared/icons";
import { Button } from "~/shared/ui";

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { PrimaryNavigation } from "./PrimaryNavigation";
import { SidebarBrand } from "./SidebarBrand";
import { SidebarSearch } from "./SidebarSearch";
import { UserMenu } from "./UserMenu";

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
  const captureRef = useRef<HTMLButtonElement>(null);
  return (
    /*
     * The DRAWER is the `navigation` landmark, not just the list inside it.
     *
     * The brand block, and (in the overlay) the search entries and the account
     * menu, are page content too, and axe's `region` rule wants all of it inside
     * a landmark. Labelling the drawer rather than the inner list is what puts
     * them there — and it is honest, because the drawer as a whole IS the primary
     * navigation region. The inner `.dh-nav` keeps its id so the phone sheet's
     * "More" control still has a real `aria-controls` target.
     */
    <nav className={`dh-sidebar dh-sidebar--${variant}`} aria-label="Primary">
      {onClose ? (
        <button
          type="button"
          className="dh-sidebar__close"
          ref={closeButtonRef}
          onClick={onClose}
        >
          <span className="dh-sidebar__close-icon" aria-hidden="true">
            <CloseIcon />
          </span>
          <span className="dh-visually-hidden">Close navigation</span>
        </button>
      ) : null}

      <SidebarBrand workspaceName={workspaceName} />
      {variant === "rail" && capture ? (
        <Button
          ref={captureRef}
          variant="primary"
          block
          icon={<PlusIcon />}
          className="dh-sidebar__capture"
          onClick={() => {
            if (captureRef.current) {
              capture.openCapture(undefined, captureRef.current);
            }
          }}
        >
          Capture
        </Button>
      ) : null}
      {variant === "overlay" ? (
        <SidebarSearch
          onOpenSearch={onOpenSearch}
          onOpenCommand={onOpenCommand}
        />
      ) : null}
      <PrimaryNavigation
        id={navId}
        items={navigation}
        onNavigate={onNavigate}
        collapsible={variant === "rail"}
      />
      <div className="dh-sidebar__spacer" />
      {/* DS-03 — the bottom utility region, on BOTH variants.
       *
       * The SAME component and the same `above` placement in each: the trigger
       * is pinned to the bottom of a column and the panel opens upward from it,
       * which was already the shape this menu was built for. The rail and the
       * sheet differ only in the width around it, so the difference is CSS (the
       * collapsed rail hides the name and keeps the avatar) rather than a second
       * component or a prop the menu has to branch on. */}
      <div className="dh-sidebar__account">
        <UserMenu
          email={email}
          appearance={appearance}
          settingsHref={settingsHref}
          collapsible={variant === "rail"}
        />
      </div>
    </nav>
  );
}
