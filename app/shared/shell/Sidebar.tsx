/**
 * PX-02 shell — the persistent sidebar (and the mobile overlay's content).
 *
 * The sidebar is the one element that never changes between surfaces
 * (PRODUCT_EXPERIENCE Part II): workspace identity at the top, the Search and
 * Command Palette entries, primary navigation, a spacer, and the user menu pinned
 * at the bottom. The SAME component renders as the desktop rail and as the mobile
 * overlay sheet — only the `variant` (and the presence of a close button) differ, so
 * navigation, identity and the user menu are identical in both.
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
import type { ThemePreference } from "./theme";

export type SidebarProps = {
  /** The current workspace's display name. */
  readonly workspaceName: string;
  /** The authenticated owner's verified email. */
  readonly email: string;
  /** The active theme preference. */
  readonly theme: ThemePreference;
  /** The registry-driven navigation model. */
  readonly navigation: readonly NavigationItem[];
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
};

export function Sidebar({
  workspaceName,
  email,
  theme,
  navigation,
  navId,
  variant = "rail",
  onNavigate,
  onClose,
  closeButtonRef,
  onOpenSearch,
}: SidebarProps) {
  return (
    <div className={`dh-sidebar dh-sidebar--${variant}`}>
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
      <SidebarSearch onOpenSearch={onOpenSearch} />
      <PrimaryNavigation
        id={navId}
        items={navigation}
        onNavigate={onNavigate}
      />
      <div className="dh-sidebar__spacer" />
      <UserMenu email={email} theme={theme} />
    </div>
  );
}
