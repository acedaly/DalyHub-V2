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

import { useEffect, useRef, type CSSProperties } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import type { NavigationItem } from "~/platform/modules/navigation-adapter";

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
  appearance,
  navigation,
  settingsHref,
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
    <div className="fixed inset-0 z-40" ref={rootRef}>
      {/* The scrim keeps the SHARED motion grammar (`motion.css`), which honours
       * `prefers-reduced-motion` in one place for every overlay in the product. */}
      <div
        className="dh-motion-scrim absolute inset-0 bg-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        ref={panelRef}
        /*
         * The M3 modal navigation drawer rounds its TRAILING edge only — the
         * leading edge is flush with the screen it slid in from. Kept, because it
         * is right: a sheet anchored to an edge should look anchored to it.
         *
         * The travel is the shared edge-anchored grammar
         * (`.dh-motion-edge-inline`), pointed at the LEADING edge via the shared
         * displacement custom property — same keyframe as the Drawer, opposite
         * direction.
         */
        style={{ "--app-motion-edge-from": "-100%" } as CSSProperties}
        className="dh-motion-edge-inline absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] max-w-full flex-col overflow-y-auto rounded-r-xl bg-primary pb-[var(--dh-safe-bottom)] pl-[var(--dh-safe-left)] shadow-xl"
      >
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
          closeButtonRef={closeButtonRef}
        />
      </div>
    </div>
  );
}
