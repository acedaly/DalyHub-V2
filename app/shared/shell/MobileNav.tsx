/**
 * PX-02 shell — the mobile navigation overlay.
 *
 * On narrow viewports the sidebar becomes an animated overlay sheet
 * (PRODUCT_EXPERIENCE #9), replacing FND-09's unanimated `display:none` collapse.
 * It REUSES the Drawer's existing machinery pointed at navigation — the same focus
 * management, background inertness and body-scroll lock — so there is no second
 * focus-trap implementation (PRODUCT_EXPERIENCE Part VI, Focus rule):
 *   - `useDrawerFocus` moves focus to the Close control on open, traps Tab within
 *     the sheet, and restores focus to the opening toggle on close;
 *   - `useInertBackground` makes the rest of the app inert while the sheet is open;
 *   - `useBodyScrollLock` freezes the page behind it without losing scroll position.
 *
 * It mounts only while open (so the mount/unmount focus contract applies cleanly),
 * closes on scrim click and on Escape, is safe-area aware, and animates in via the
 * DS-01 motion tokens (instant under reduced-motion). It never jumps page content:
 * the persistent rail is hidden on mobile and this sheet is viewport-fixed.
 */

import { useEffect, useRef } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { Sidebar } from "./Sidebar";
import type { ThemePreference } from "./theme";

/** The DOM id of the mobile overlay's primary navigation. */
export const MOBILE_NAV_ID = "primary-navigation-mobile";

export type MobileNavProps = {
  readonly workspaceName: string;
  readonly email: string;
  readonly theme: ThemePreference;
  readonly navigation: readonly NavigationItem[];
  /** The toggle that opened the sheet, to restore focus to on close. */
  readonly opener: HTMLElement | null;
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
  theme,
  navigation,
  opener,
  onClose,
  onOpenSearch,
  onOpenCommand,
}: MobileNavProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(true);
  useInertBackground(rootRef, true);
  useDrawerFocus({
    containerRef: panelRef,
    active: true,
    closeButtonRef,
    opener,
  });

  // Escape closes the sheet (the top-most overlay).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="dh-mobilenav" ref={rootRef}>
      <div
        className="dh-mobilenav__scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="dh-mobilenav__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        ref={panelRef}
      >
        <Sidebar
          workspaceName={workspaceName}
          email={email}
          theme={theme}
          navigation={navigation}
          navId={MOBILE_NAV_ID}
          variant="overlay"
          onNavigate={onClose}
          onClose={onClose}
          onOpenSearch={onOpenSearch}
          onOpenCommand={onOpenCommand}
          closeButtonRef={closeButtonRef}
        />
      </div>
    </div>
  );
}
