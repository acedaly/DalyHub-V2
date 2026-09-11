/**
 * Phase 1 shell — mobile navigation hosted in Untitled's slideout primitives.
 *
 * The complete DalyHub navigation stays registry-driven and product-specific, but
 * the overlay frame is no longer a bespoke drawer. Untitled UI's `slideout-menu`
 * source supplies the React Aria ModalOverlay/Modal/Dialog layer: dismissal,
 * modal semantics, focus containment, scroll locking and enter/exit animation
 * come from the same primitive future mobile detail sheets will use.
 */

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import {
  Dialog,
  Modal,
  ModalOverlay,
} from "~/shared/ui/untitled/application/slideout-menus/slideout-menu";

import { Sidebar } from "./Sidebar";

/** The DOM id of the mobile overlay's primary navigation. */
export const MOBILE_NAV_ID = "primary-navigation-mobile";

export type MobileNavProps = {
  readonly workspaceName: string;
  readonly email: string;
  /** The owner's stored appearance preference, for the account menu's control. */
  readonly appearance: AppearancePreference;
  readonly navigation: readonly NavigationItem[];
  readonly settingsHref?: string;
  /** Close the sheet. */
  readonly onClose: () => void;
  /** Open global Search (also closes the sheet). */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Open the Command Palette (also closes the sheet). */
  readonly onOpenCommand?: (opener: HTMLElement) => void;
};

export function MobileNav({
  workspaceName,
  email,
  appearance,
  navigation,
  settingsHref,
  onClose,
  onOpenSearch,
  onOpenCommand,
}: MobileNavProps) {
  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      className="z-40 md:hidden"
    >
      <Modal className="max-w-[min(20rem,86vw)]">
        <Dialog aria-label="Navigation" className="pb-[var(--dh-safe-bottom)]">
          <Sidebar
            workspaceName={workspaceName}
            email={email}
            appearance={appearance}
            navigation={navigation}
            settingsHref={settingsHref}
            navId={MOBILE_NAV_ID}
            variant="overlay"
            onNavigate={onClose}
            onClose={onClose}
            onOpenSearch={onOpenSearch}
            onOpenCommand={onOpenCommand}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
