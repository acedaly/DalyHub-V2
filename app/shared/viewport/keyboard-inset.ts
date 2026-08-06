/**
 * MOBILE-01 — the pure keyboard-inset model (React-free, unit-tested).
 *
 * On a phone the on-screen keyboard does NOT resize the layout viewport in most
 * browsers: it overlays it. Anything anchored to the bottom of the viewport — a
 * sheet's Save button, a Drawer's sticky action region, the Meeting capture bar,
 * the bottom navigation — therefore ends up UNDER the keyboard unless the app
 * knows how tall the keyboard is. The Visual Viewport API is the only reliable
 * source of that number.
 *
 * DalyHub reads it in exactly ONE place ({@link useKeyboardInset}) and publishes
 * the result as a single CSS custom property (`--app-keyboard-inset`) on the
 * document element. Every keyboard-aware surface then styles against that token —
 * no per-form listener, no per-component measurement, no layout thrashing from a
 * dozen competing `resize` handlers. This module holds the arithmetic so the
 * clamping and the noise threshold are testable without a browser.
 */

/** The published custom property every keyboard-aware surface reads. */
export const KEYBOARD_INSET_PROPERTY = "--app-keyboard-inset";

/**
 * Below this many pixels a visual/layout viewport difference is browser chrome
 * (a collapsing URL bar, a rubber-band scroll), not a keyboard. Treating that as
 * a keyboard would make sticky actions jitter while the user scrolls.
 */
export const KEYBOARD_INSET_NOISE_THRESHOLD = 96;

/** The inputs {@link resolveKeyboardInset} needs — trivially constructible in a test. */
export type KeyboardInsetInput = {
  /** `window.innerHeight` — the layout viewport height. */
  readonly layoutHeight: number;
  /** `visualViewport.height` — shrinks when the keyboard overlays the page. */
  readonly visualHeight: number;
  /** `visualViewport.offsetTop` — non-zero while the page is pinch-scrolled. */
  readonly offsetTop: number;
};

/**
 * The number of pixels at the bottom of the layout viewport currently covered by
 * the on-screen keyboard, or 0 when no keyboard is up.
 *
 * Clamped to `[0, layoutHeight]` so a bogus reading can never produce a negative
 * inset (which would pull controls off-screen) or one taller than the viewport
 * (which would collapse every sheet to nothing).
 */
export function resolveKeyboardInset(input: KeyboardInsetInput): number {
  const { layoutHeight, visualHeight, offsetTop } = input;
  if (
    !Number.isFinite(layoutHeight) ||
    !Number.isFinite(visualHeight) ||
    !Number.isFinite(offsetTop) ||
    layoutHeight <= 0
  ) {
    return 0;
  }
  const covered = layoutHeight - visualHeight - offsetTop;
  if (covered < KEYBOARD_INSET_NOISE_THRESHOLD) {
    return 0;
  }
  return Math.min(Math.max(covered, 0), layoutHeight);
}
