/**
 * MOBILE-01 — the phone bottom navigation bar.
 *
 * Replaces hamburger-ONLY phone navigation (PX-02 left the menu toggle as the sole
 * route to every destination). The bar is persistent at phone widths and carries
 * the product's most frequent daily moves within thumb reach:
 *
 *     Today · Tasks · Add · Projects · More
 *
 * CAPTURE-02 — the Capture slot is the SINGLE global capture affordance at these
 * widths. The floating action button is hidden below `md` (`shell.css`), so a
 * phone no longer carries two controls for the same action in the same corner
 * (DEBT-96). The slot opens the same shared Quick Capture surface the button
 * opens, through the same callback and with the same opener, so every capture
 * type, every route behaviour and the focus restoration on close are unchanged.
 *
 * Nothing in that list is hard-coded here. The destinations are DERIVED from the
 * registry-driven navigation model by `buildBottomNavigation` — a module earns a
 * slot by declaring `meta.mobilePrimaryOrder` in its own route manifest — and
 * "More" opens the SAME complete navigation sheet the hamburger opened, so every
 * module (including any future one) is still one tap away and nothing appears in a
 * second, drifting list.
 *
 * Accessibility contract:
 *   - a labelled `navigation` landmark, distinct from the sidebar's, so a screen
 *     reader user can jump straight to it;
 *   - the active destination carries `aria-current="page"` AND is marked visually
 *     by M3's active-indicator pill behind the glyph and a heavier label — never
 *     by colour alone (AGENTS.md §15);
 *   - every control is a real button/link with a permanently visible text label
 *     beneath its icon (no icon-only targets) and meets the 44px minimum;
 *   - the bar sits above the home indicator via `--app-safe-area-bottom` and
 *     hides itself while the on-screen keyboard is up (`--app-keyboard-inset`), so
 *     it can never cover a focused field or an error message;
 *   - it is `display: none` at `md` and above, so desktop is untouched.
 *
 * Browser Back is ordinary link navigation: destinations are real `Link`s, so Back
 * returns to the previous destination and the Capture/More sheets — which are not
 * routes — close without adding a history entry.
 */

import { useRef } from "react";
import { Link, useLocation, useNavigation } from "react-router";

import { MoreIcon, PlusIcon } from "~/shared/icons";

import { NavIcon } from "./NavIcon";
import { cx } from "~/shared/ui/untitled/utils/cx";

import { PRIMARY_NAV_PREFETCH } from "./navigation-prefetch";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import {
  activeDestinationHref,
  buildBottomNavigation,
  resolveMobilePrimaryDestinations,
} from "./mobile-navigation";
import { pendingNavigationHref } from "./navigation-pending";

export type BottomNavProps = {
  /** The registry-driven navigation model, already filtered by SET-01 preferences. */
  readonly navigation: readonly NavigationItem[];
  /** Open the shared Quick Capture sheet. */
  readonly onOpenCapture: (opener: HTMLElement) => void;
  /** Open the complete registry-driven navigation sheet. */
  readonly onOpenMore: (opener: HTMLElement) => void;
  /** Whether the More sheet is currently open (for `aria-expanded`). */
  readonly moreOpen: boolean;
};

/**
 * The destination glyph — the same shared resolver the sidebar uses, so a module
 * looks identical on the phone bar and on the desktop rail (THEME-01).
 */
function DestinationIcon({ item }: { readonly item: NavigationItem }) {
  return <NavIcon entityType={item.entityType} navIcon={item.navIcon} />;
}

export function BottomNav({
  navigation,
  onOpenCapture,
  onOpenMore,
  moreOpen,
}: BottomNavProps) {
  const location = useLocation();
  /*
   * Named for what it is, because this component's PROP is also called
   * `navigation` — that one is the registry-driven destination model, this one
   * is the router's in-flight state. Two different things, and the bar reads
   * both.
   */
  const routerNavigation = useNavigation();
  const captureRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const destinations = resolveMobilePrimaryDestinations(navigation);
  const slots = buildBottomNavigation(navigation);
  const activeHref = activeDestinationHref(destinations, location.pathname);
  // PERF-01 — the same acknowledgement the rail gives, from the same rule.
  const pendingHref = pendingNavigationHref(
    destinations,
    routerNavigation,
    location.pathname,
  );

  return (
    // Named DISTINCTLY from the sidebar's "Primary" navigation landmark: both are
    // in the DOM at once (each is `display:none` at the other's viewport), and two
    // same-named landmarks are ambiguous to a screen-reader user browsing by
    // landmark. "Quick navigation" is also honest — this bar is the frequent
    // destinations; the COMPLETE navigation lives behind More.
    <nav
      aria-label="Quick navigation"
      data-testid="bottom-nav"
      /*
       * UNTITLED-02 — fixed to the bottom of the phone viewport, above the home
       * indicator and BELOW the software keyboard.
       *
       * `--dh-safe-bottom` clears the home indicator; `--app-keyboard-inset`
       * (published by the ONE shared Visual Viewport observer) translates the bar
       * off-screen exactly while the keyboard covers that space, so it can never
       * cover a focused field, a validation message or a sticky Save. The token
       * is `0px` unless a real keyboard was measured, so the transform is a no-op
       * the rest of the time.
       */
      className="fixed inset-x-0 bottom-0 z-20 border-t border-secondary bg-primary pb-[var(--dh-safe-bottom)] transition-transform duration-100 ease-linear translate-y-[var(--app-keyboard-inset,0px)] md:hidden"
    >
      <ul className="flex items-stretch">
        {slots.map((slot) => {
          if (slot.kind === "capture") {
            return (
              <li key="capture" className="min-w-0 flex-1">
                <button
                  type="button"
                  ref={captureRef}
                  className="flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2"
                  onClick={() => {
                    if (captureRef.current) {
                      onOpenCapture(captureRef.current);
                    }
                  }}
                >
                  {/* Capture is the ONE filled control in the bar — the same
                    * primary emphasis the rail gives it, so the defining action
                    * looks the same on both shells. */}
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-12 items-center justify-center rounded-full bg-brand-solid text-white *:size-5"
                  >
                    <PlusIcon />
                  </span>
                  <span className="text-xs font-semibold text-secondary">
                    Add
                  </span>
                </button>
              </li>
            );
          }

          if (slot.kind === "more") {
            return (
              <li key="more" className="min-w-0 flex-1">
                <button
                  type="button"
                  ref={moreRef}
                  className="flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2"
                  aria-expanded={moreOpen}
                  aria-controls="primary-navigation-mobile"
                  onClick={() => {
                    if (moreRef.current) {
                      onOpenMore(moreRef.current);
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex h-7 w-12 items-center justify-center rounded-full transition duration-100 ease-linear *:size-5",
                      moreOpen
                        ? "bg-brand-primary text-fg-brand-primary"
                        : "text-fg-quaternary",
                    )}
                  >
                    <MoreIcon />
                  </span>
                  <span className="text-xs font-semibold text-secondary">
                    More
                  </span>
                </button>
              </li>
            );
          }

          const { item } = slot;
          const active = item.href === activeHref;
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <Link
                to={item.href}
                /*
                 * PERF-01 — the same intent policy the rail uses, and safe here
                 * for the reason `navigation-prefetch.ts` records: the intent
                 * trigger on touch is `touchstart`, which fires for the ONE
                 * destination the finger has landed on. A tap warms that route
                 * and no other; the bar never downloads five destinations
                 * because it painted.
                 */
                prefetch={PRIMARY_NAV_PREFETCH}
                className="flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2"
                aria-current={active ? "page" : undefined}
                aria-busy={item.href === pendingHref ? true : undefined}
                data-active={active ? "true" : "false"}
                data-pending={item.href === pendingHref ? "true" : undefined}
              >
                {/* M3's active-indicator PILL sits behind the glyph rather than
                    as a rule above it. It is a shape as well as a tint, so the
                    active destination is still obvious under forced colours and
                    to a colour-blind user. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex h-7 w-12 items-center justify-center rounded-full transition duration-100 ease-linear *:size-5",
                    active || item.href === pendingHref
                      ? "bg-brand-primary text-fg-brand-primary"
                      : "text-fg-quaternary",
                  )}
                >
                  <DestinationIcon item={item} />
                </span>
                <span
                  className={cx(
                    "text-xs transition duration-100 ease-linear",
                    active
                      ? "font-semibold text-brand-secondary"
                      : "font-medium text-tertiary",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
