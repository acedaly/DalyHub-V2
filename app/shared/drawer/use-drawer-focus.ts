/**
 * DS-03 — deterministic focus management for a single drawer panel.
 *
 * Implements the WAI-ARIA modal-dialog focus contract for one drawer:
 *   - On open, focus moves INTO the drawer. Initial focus is deterministic: an
 *     explicitly supplied target, else the close button, else the first focusable
 *     control, else the panel itself.
 *   - While this drawer is the interactive top, Tab / Shift+Tab are trapped and
 *     wrap within the panel (belt-and-braces with the `inert` background, which
 *     already removes everything else from the tab order).
 *   - On close (unmount), focus returns to the control that opened the drawer when
 *     it still exists; when it does not (e.g. a directly deep-linked drawer), the
 *     provider's focus safety net places focus into the newly revealed drawer or
 *     the page's main region, so focus is never lost to `<body>`.
 *
 * The trap only runs while `active` (the top drawer), so a lower drawer that a
 * higher one has covered neither steals focus nor restores it until it truly
 * closes.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** Elements considered focusable for the trap and the initial-focus fallback. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  // Layout-independent visibility: exclude controls inside a `hidden` subtree
  // (e.g. an inactive tab panel) or an `inert` subtree. This is correct in a real
  // browser and in the layout-free test DOM alike — we never rely on `offset
  // Parent`, which is null without layout.
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.closest("[hidden]") === null &&
      element.closest("[inert]") === null &&
      // Exclude anything explicitly removed from the tab order. The selector
      // matches native controls (`button`, `a[href]`, `input`…) even when they
      // carry `tabindex="-1"`, but such elements are deliberately NOT tab stops
      // (e.g. DS-08/09 listbox options that render an inner `tabindex="-1"`
      // link/button driven by `aria-activedescendant`). Including them made the
      // trap's `last` a non-tabbable node, so Tab from the real last control
      // escaped to `<body>` instead of wrapping. `HTMLElement.tabIndex` reflects
      // the effective value (0 for a native control with no explicit tabindex).
      element.tabIndex >= 0,
  );
}

export interface DrawerFocusOptions {
  /** The drawer panel element that must contain focus. */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Whether this drawer is the interactive top (trap only runs when true). */
  readonly active: boolean;
  /** Preferred initial-focus target, taking precedence over the close button. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** The always-present close control, used as the default initial-focus target. */
  readonly closeButtonRef: RefObject<HTMLElement | null>;
  /** The element to restore focus to on close (captured when the drawer opened). */
  readonly opener: HTMLElement | null;
}

export function useDrawerFocus({
  containerRef,
  active,
  initialFocusRef,
  closeButtonRef,
  opener,
}: DrawerFocusOptions): void {
  // Keep the latest opener in a ref so the unmount-only restore effect always
  // sees the current value without re-running (which would restore too early).
  const openerRef = useRef<HTMLElement | null>(opener);
  openerRef.current = opener;

  // Move focus into the drawer once, when it mounts (it always mounts as the top).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof document === "undefined") {
      return;
    }
    const target =
      initialFocusRef?.current ??
      closeButtonRef.current ??
      focusableWithin(container)[0] ??
      container;
    // A microtask defer lets the panel finish mounting before focus moves.
    const id = window.requestAnimationFrame(() => {
      target.focus();
    });
    return () => window.cancelAnimationFrame(id);
    // Mount-only: initial focus is deterministic and must not re-fire on updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore focus to the opener when the drawer closes (unmount only).
  useEffect(() => {
    return () => {
      const restoreTarget = openerRef.current;
      if (
        restoreTarget &&
        restoreTarget.isConnected &&
        typeof restoreTarget.focus === "function"
      ) {
        restoreTarget.focus();
      }
    };
  }, []);

  // Trap Tab within the panel while this drawer is the top.
  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        // Nothing focusable inside: keep focus on the panel itself.
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!container.contains(activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, containerRef]);
}
