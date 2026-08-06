/**
 * PX-02 shell — the user menu (sidebar bottom).
 *
 * Relocates the identity + settings chrome out of the header and behind an
 * avatar-triggered menu (PRODUCT_EXPERIENCE #4): the owner's name, their verified
 * email, a Settings link and Sign out. The header pixels return to the work;
 * identity lives where premium applications keep it.
 *
 * M3-01 removed the theme quick-switch that used to sit here, along with the
 * Settings → Appearance section it mirrored: DalyHub ships one generated
 * light/dark pair and follows the operating system, so there is no choice left to
 * offer (ADR-074 decision 5). The `theme` prop below is inert and goes with the
 * rest of the plumbing in step 6.
 *
 * Interaction is an accessible disclosure (NOT a menu): a trigger with
 * `aria-expanded` + `aria-controls` reveals a `role="group"` panel whose controls
 * (the theme form and ordinary links) are all keyboard-reachable; Escape closes and
 * restores focus to the trigger; an outside click or choosing Settings / Sign out
 * closes it. It is not a modal, so it needs no focus trap. It deliberately does not
 * declare `aria-haspopup="menu"`, whose menu keyboard model the panel does not use.
 */

import { useEffect, useId, useRef, useState } from "react";

import { ChevronDownIcon, SettingsIcon, SignOutIcon } from "~/shared/icons";

import { displayNameFromEmail, initialsFromName } from "./identity-display";
import type { ThemePreference } from "./theme";

/** The Cloudflare Access application logout endpoint (ADR-016 §5.7). */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

/**
 * The display-identity derivations now live in `identity-display.ts` (pure, no
 * React) so a server loader can reuse them without importing this component. They
 * are re-exported here because this module has always been their import path.
 */
export {
  displayNameFromEmail,
  greetingNameFor,
  initialsFromName,
} from "./identity-display";

export type UserMenuProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
  /** Inert since M3-01; removed with the rest of the theme plumbing (step 6). */
  readonly theme: ThemePreference;
  /** Optional display name; derived from the email when absent. */
  readonly name?: string;
  /**
   * The Settings route href. Omitted until Settings ships (SET-01): the menu never
   * renders a Settings action that would dead-end on the 404 page (AGENTS.md §6 —
   * no dead ends). SET-01 threads a real href through here to light it up.
   */
  readonly settingsHref?: string;
};

export function UserMenu({ email, name, settingsHref }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const displayName = name ?? displayNameFromEmail(email);
  const initials = initialsFromName(displayName);

  // Close on outside click and on Escape (restoring focus to the trigger).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="dh-user-menu" ref={containerRef}>
      {open ? (
        <div
          className="dh-user-menu__panel"
          id={panelId}
          role="group"
          aria-label="Account"
        >
          <div className="dh-user-menu__identity">
            <span className="dh-user-menu__name">{displayName}</span>
            <span className="dh-user-menu__email" title={email}>
              {email}
            </span>
          </div>
          <div className="dh-user-menu__section dh-user-menu__links">
            {settingsHref ? (
              <a
                className="dh-user-menu__link"
                href={settingsHref}
                onClick={() => setOpen(false)}
              >
                <span className="dh-user-menu__link-icon" aria-hidden="true">
                  <SettingsIcon />
                </span>
                Settings
              </a>
            ) : null}
            <a
              className="dh-user-menu__link"
              href={ACCESS_LOGOUT_PATH}
              onClick={() => setOpen(false)}
            >
              <span className="dh-user-menu__link-icon" aria-hidden="true">
                <SignOutIcon />
              </span>
              Sign out
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="dh-user-menu__trigger"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="dh-user-menu__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="dh-user-menu__trigger-name">{displayName}</span>
        <span className="dh-user-menu__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
    </div>
  );
}
