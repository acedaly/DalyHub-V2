/**
 * PX-02 shell — the user menu (sidebar bottom).
 *
 * Relocates the identity + settings chrome out of the header and behind an
 * avatar-triggered menu (PRODUCT_EXPERIENCE #4): the owner's name, their verified
 * email, the Theme control, a Settings link and Sign out. The header pixels return
 * to the work; identity lives where premium applications keep it.
 *
 * It REUSES the existing theme implementation unchanged — the same accessible
 * `ThemeControl` fieldset, posting to the same action, with the same cookie-backed
 * persistence (ADR-016 §5.11). PX-02 only relocates the control; it changes no theme
 * behaviour or persistence.
 *
 * Interaction is an accessible disclosure: a trigger with `aria-expanded` /
 * `aria-haspopup` reveals a panel whose controls are all keyboard-reachable; Escape
 * closes and restores focus to the trigger; an outside click or choosing Settings /
 * Sign out closes it. It is not a modal, so it needs no focus trap.
 */

import { useEffect, useId, useRef, useState } from "react";

import { ChevronDownIcon, SettingsIcon, SignOutIcon } from "~/shared/icons";

import { ThemeControl } from "./ThemeControl";
import type { ThemePreference } from "./theme";

/** The Cloudflare Access application logout endpoint (ADR-016 §5.7). */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

/** Derive a friendly display name from an email local part (e.g. "aidan" → "Aidan"). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) {
    return email;
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Derive up-to-two-letter initials for the avatar. */
export function initialsFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export type UserMenuProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
  /** The active theme preference (drives the control's active state). */
  readonly theme: ThemePreference;
  /** Optional display name; derived from the email when absent. */
  readonly name?: string;
  /** The Settings route href. */
  readonly settingsHref?: string;
};

export function UserMenu({
  email,
  theme,
  name,
  settingsHref = "/settings",
}: UserMenuProps) {
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
          <div className="dh-user-menu__section">
            <ThemeControl current={theme} />
          </div>
          <div className="dh-user-menu__section dh-user-menu__links">
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
        aria-haspopup="menu"
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
