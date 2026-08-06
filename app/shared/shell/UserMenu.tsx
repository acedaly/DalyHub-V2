/**
 * PX-02 shell — the user menu.
 *
 * Relocates the identity + settings chrome behind an avatar-triggered menu
 * (PRODUCT_EXPERIENCE #4): the owner's name, their verified email, a Settings
 * link and Sign out.
 *
 * It renders in two places, which is why `placement` and `compact` exist rather
 * than two components: the DESKTOP top app bar (compact — avatar and chevron
 * only, opening downward) and the MOBILE navigation sheet (full — avatar, name
 * and chevron, opening upward from the bottom of the sheet). The disclosure
 * behaviour, the panel contents and the focus handling are identical in both,
 * so there is one implementation and two skins.
 *
 * APPEARANCE-01 puts the appearance choice here — the second of its two homes,
 * alongside Settings → General. It is one shared control (`AppearanceSelector`)
 * reading one stored preference, so the two surfaces show the same current value
 * and neither can drift. It sits in the account menu rather than in a page header
 * because appearance is set rarely: it belongs beside Settings and Sign out, not
 * in chrome that every page pays for.
 *
 * This is NOT the seven-palette theme quick-switch M3-01 removed. There is still
 * one generated light/dark pair and no palettes (ADR-074); the only thing on offer
 * is which half of that pair to paint.
 *
 * Interaction is an accessible disclosure (NOT a menu): a trigger with
 * `aria-expanded` + `aria-controls` reveals a `role="group"` panel whose controls
 * (the appearance radio group and ordinary links) are all keyboard-reachable;
 * Escape closes and restores focus to the trigger; an outside click or choosing
 * Settings / Sign out closes it. It is not a modal, so it needs no focus trap. It
 * deliberately does not declare `aria-haspopup="menu"`, whose menu keyboard model
 * the panel does not use — which is also why the appearance control can be a real
 * radio group in here rather than a `menuitemradio` reimplementation.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { AppearancePreference } from "~/kernel/preferences/appearance";
import { ChevronDownIcon, SettingsIcon, SignOutIcon } from "~/shared/icons";

import { AppearanceSelector } from "./AppearanceSelector";
import { displayNameFromEmail, initialsFromName } from "./identity-display";

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
  /** Optional display name; derived from the email when absent. */
  readonly name?: string;
  /**
   * APPEARANCE-01 — the owner's stored System/Light/Dark preference. Defaults to
   * `system`, which is both the shipped behaviour and the safe reading of a
   * missing value, so a caller that has not been threaded yet renders a correct
   * (if not personalised) control rather than an empty one.
   */
  readonly appearance?: AppearancePreference;
  /**
   * The Settings route href. Omitted until Settings ships (SET-01): the menu never
   * renders a Settings action that would dead-end on the 404 page (AGENTS.md §6 —
   * no dead ends). SET-01 threads a real href through here to light it up.
   */
  readonly settingsHref?: string;
  /**
   * Which way the panel opens. `below` for the top app bar, `above` for a
   * control pinned to the bottom of a sheet. Defaults to `above`, the original
   * sidebar-bottom behaviour.
   */
  readonly placement?: "above" | "below";
  /** Avatar and chevron only, without the name — for the top app bar. */
  readonly compact?: boolean;
};

export function UserMenu({
  email,
  name,
  appearance = "system",
  settingsHref,
  placement = "above",
  compact = false,
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

  /*
   * The panel is rendered BEFORE the trigger when it opens upward and AFTER it
   * when it opens downward, so the DOM order matches the visual order in both
   * placements and a keyboard user tabs through the panel in the direction they
   * see it. (The panel is positioned absolutely either way; this is about
   * reading order, not layout.)
   */
  const panel = open ? (
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
      {/* The appearance choice, as a labelled section of the panel rather than a
       * nested submenu: three options fit, and a submenu would put the owner's
       * current appearance one interaction further away than the thing it tells
       * them. Choosing an option does NOT close the panel — the point of setting
       * appearance here is to see the result and, if it is wrong, to change it
       * again without reopening the menu. */}
      <div className="dh-user-menu__section dh-user-menu__appearance">
        <AppearanceSelector value={appearance} variant="menu" />
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
  ) : null;

  const trigger = (
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
      {compact ? null : (
        <span className="dh-user-menu__trigger-name">{displayName}</span>
      )}
      <span className="dh-user-menu__chevron" aria-hidden="true">
        <ChevronDownIcon />
      </span>
      {compact ? (
        <span className="dh-visually-hidden">Account — {displayName}</span>
      ) : null}
    </button>
  );

  return (
    <div
      className={`dh-user-menu dh-user-menu--${placement}${
        compact ? " dh-user-menu--compact" : ""
      }`}
      ref={containerRef}
    >
      {placement === "above" ? panel : null}
      {trigger}
      {placement === "below" ? panel : null}
    </div>
  );
}
