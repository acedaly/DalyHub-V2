/**
 * PX-02 shell — the user menu.
 *
 * Relocates the identity + settings chrome behind an avatar-triggered menu
 * (PRODUCT_EXPERIENCE #4): the owner's name, their verified email, a Settings
 * link and Sign out.
 *
 * It renders in two places and they are the same shape: the bottom of the
 * DESKTOP RAIL and the bottom of the MOBILE navigation sheet. In both the
 * trigger is pinned to the end of a column and the panel opens upward from it,
 * so there is one implementation and no variant.
 *
 * DS-03 removed the `compact` variant and the downward `placement`. They existed
 * for the desktop top app bar, where the account was an avatar and a chevron in a
 * trailing cluster; DS-03 moved the account into the rail (identity belongs with
 * the frame's other identity — see `Sidebar`), which left both options with no
 * caller. An option nothing selects is a branch nobody tests. The COLLAPSED rail
 * is the case that looks like it wants `compact`, and it is handled where it
 * belongs — in CSS, by the media query that collapses everything else in the
 * column — so the component does not have to know how wide it currently is.
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
import { useSignOut } from "~/shared/account-security";
import { ChevronDownIcon, SettingsIcon, SignOutIcon } from "~/shared/icons";
import { Tooltip, composeRefs } from "~/shared/tooltip";

import { ACCESS_LOGOUT_PATH } from "./access-logout";
import { AppearanceSelector } from "./AppearanceSelector";
import { useCollapsedRail } from "./collapsed-rail";
import { displayNameFromEmail, initialsFromName } from "./identity-display";

export { ACCESS_LOGOUT_PATH } from "./access-logout";

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
   * Whether this instance is on the RAIL, which collapses to glyphs on a tablet.
   * When it does, CSS hides the trigger's name and chevron and only the initials
   * are left, so the shared tooltip has to supply the name to a pointer and a
   * sighted keyboard user. The phone's navigation sheet passes nothing: it is
   * full-width at every viewport it exists at.
   */
  readonly collapsible?: boolean;
};

export function UserMenu({
  email,
  name,
  appearance = "system",
  settingsHref,
  collapsible = false,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const displayName = name ?? displayNameFromEmail(email);
  const initials = initialsFromName(displayName);
  // Whether CSS is currently hiding this trigger's name (see the tooltip note).
  const collapsed = useCollapsedRail(collapsible);

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
   * The panel is rendered BEFORE the trigger, because it opens upward: the DOM
   * order then matches the visual order, and a keyboard user tabs through the
   * panel in the direction they see it. (The panel is positioned absolutely;
   * this is about reading order, not layout.)
   */
  const panel = open ? (
    <div
      /* DHDS-09 — the shared floating surface. This is a disclosure rather
         than a menu (see the note above), so it composes the appearance
         without adopting the menu's keyboard model. */
      className="dh-floating dh-user-menu__panel"
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
        {/* SET-03 — still an ANCHOR to Cloudflare's own logout endpoint, and
         * deliberately so. The click is intercepted to clear this device's
         * personal DalyHub data first (DEBT-68), but with scripting unavailable
         * the plain link still signs the owner out — a security control that
         * stops working when JavaScript does is not one. The href is the real
         * destination either way, so what the browser shows on hover is the
         * truth. */}
        <a
          className="dh-user-menu__link"
          href={ACCESS_LOGOUT_PATH}
          aria-disabled={signOut.state === "idle" ? undefined : true}
          onClick={(clickEvent) => {
            clickEvent.preventDefault();
            setOpen(false);
            void signOut.signOut();
          }}
        >
          <span className="dh-user-menu__link-icon" aria-hidden="true">
            <SignOutIcon />
          </span>
          {signOut.state === "idle" ? "Sign out" : "Signing out…"}
        </a>
      </div>
    </div>
  ) : null;

  /*
   * M3-TIP — the COMPACT trigger is two initials and a chevron: it has an
   * accessible name ("Account — …") and nothing a pointer or keyboard user can
   * read, which is exactly the shape the August 2026 audit's finding 2 named.
   * The full trigger already shows the name in text, so it gets no tooltip —
   * a tooltip that repeats visible text is noise. No tooltip while the panel is
   * open either: the panel says far more than the trigger could.
   *
   * DS-03 — the NAME is stated as an `aria-label`, where it used to be a
   * visually-hidden span in the compact variant only. It matters because the
   * trigger now lives at the bottom of the rail, where its visible text is the
   * owner's display name and nothing else: a control announced as "Owner,
   * button" says who but not what, in a landmark full of destinations. "Account
   * — Owner" says both, and it still CONTAINS the visible text, which is what
   * WCAG 2.5.3 (label in name) requires so a voice-control user can say what
   * they can see.
   *
   * The TOOLTIP is the other half, and it is scoped to the case that needs it.
   * At full width the trigger shows the name in text, and a tooltip repeating
   * visible text is noise. On the COLLAPSED rail the same CSS that hides the
   * fourteen destinations' labels hides this one, leaving two initials — so a
   * sighted pointer or keyboard user gets no explanation that they open the
   * account menu, which is the exact gap the collapsed-navigation contract in
   * `DESIGN_SYSTEM.md` requires the shared tooltip to close. The `aria-label`
   * above is unaffected and remains the NAME; the tooltip is the DESCRIPTION, so
   * anyone whose assistive technology skips descriptions still hears the name.
   *
   * It is suppressed while the panel is OPEN: the panel says far more than the
   * trigger could, and a tooltip over it would be noise on top of an answer.
   */
  const trigger = (
    <Tooltip
      label={`Account — ${displayName}`}
      placement="top"
      disabled={!collapsed || open}
    >
      {(tip) => (
        <button
          type="button"
          className="dh-user-menu__trigger"
          ref={composeRefs(triggerRef, tip.ref)}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={tip.describedBy}
          aria-label={`Account — ${displayName}`}
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
      )}
    </Tooltip>
  );

  return (
    <div className="dh-user-menu" ref={containerRef}>
      {panel}
      {trigger}
    </div>
  );
}
