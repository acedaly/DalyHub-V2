/**
 * MOBILE-01 — the ONE Visual Viewport listener in DalyHub.
 *
 * Mounted exactly once, by the AppShell. It observes `window.visualViewport` and
 * publishes the resolved keyboard height as the `--dh-keyboard-inset` custom
 * property on `<html>`, so every keyboard-aware surface (the shared Sheet's
 * footer, the phone Drawer's sticky action region, the Meeting capture bar, the
 * bottom navigation) is styled purely in CSS against one token.
 *
 * Deliberately NOT a per-form hook: individual forms adding their own resize
 * listeners is exactly the layout-thrashing pattern the performance requirements
 * forbid. Forms opt in by using the token, never by measuring.
 *
 * Updates are coalesced into a single `requestAnimationFrame` and written only
 * when the value actually changes, so a keyboard opening costs one style write —
 * not one per resize event. It is SSR-safe (no `visualViewport`, no listener) and
 * degrades to a 0 inset on browsers without the API, where the layout viewport
 * really does resize and `100dvh` is already correct.
 */

import { useEffect } from "react";

import {
  KEYBOARD_INSET_PROPERTY,
  resolveKeyboardInset,
} from "./keyboard-inset";

export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const viewport = window.visualViewport;
    const root = document.documentElement;
    if (!viewport) {
      // No API: the layout viewport resizes for real, so `100dvh` is accurate and
      // a zero inset is the correct, honest answer.
      root.style.setProperty(KEYBOARD_INSET_PROPERTY, "0px");
      return;
    }

    let frame = 0;
    let published = -1;

    const publish = () => {
      frame = 0;
      const inset = resolveKeyboardInset({
        layoutHeight: window.innerHeight,
        visualHeight: viewport.height,
        offsetTop: viewport.offsetTop,
      });
      // Round to whole pixels and skip no-op writes so a scroll never restyles.
      const rounded = Math.round(inset);
      if (rounded === published) {
        return;
      }
      published = rounded;
      root.style.setProperty(KEYBOARD_INSET_PROPERTY, `${rounded}px`);
    };

    const schedule = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(publish);
    };

    publish();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      root.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    };
  }, []);
}
