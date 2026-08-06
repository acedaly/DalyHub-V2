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
 * The RAIL no longer carries a Search entry or a user menu. Both moved into the
 * desktop top app bar (`DesktopTopBar`): a drawer that opened with a 56px Search
 * pill and a 56px Command palette pill spent 112px before its first destination,
 * and duplicated the primary search affordance. The OVERLAY keeps both, because
 * the phone has no top app bar of that kind and the sheet is where a thumb
 * reaches them.
 *
 * It composes shared parts only and holds no business logic. The `navId` is
 * parameterised so the persistent and overlay instances never collide on a DOM id.
 */

import type { RefObject } from "react";

import { CloseIcon } from "~/shared/icons";

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
      />
      <div className="dh-sidebar__spacer" />
      {variant === "overlay" ? (
        <UserMenu email={email} settingsHref={settingsHref} />
      ) : null}
    </nav>
  );
}
