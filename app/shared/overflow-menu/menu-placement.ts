/**
 * UIQ-021 — the shared menu's viewport placement, as PURE GEOMETRY.
 *
 * DS-12's panel always opened below its trigger with no maximum height, so a
 * long menu (a Tasks row carries ~12 items ≈ 600px) opened low on the screen
 * ran past the bottom of the viewport, and the page had to be scrolled merely
 * to reach the last item. This module is the decision logic for the fix,
 * separated from React and the DOM (the `swipe-model` precedent) so the
 * contract is unit-testable with plain numbers:
 *
 *   1. prefer the normal below-trigger placement when the whole menu fits;
 *   2. flip above the trigger when the whole menu fits there instead;
 *   3. when neither side can contain it, take the larger side and CLAMP the
 *      menu's height to it — the panel then scrolls internally.
 *
 * The philosophy is the shared Tooltip's (measure the trigger's viewport rect,
 * flip, clamp against the viewport with a small margin) applied to a surface
 * that has real height. No positioning dependency; the caller stays
 * absolutely-positioned against its trigger and only switches which edge it
 * anchors to.
 *
 * ── EDIT-03 — the block decision moved, the menu's use of it did not ─────────
 * Those three rules were never menu-specific: the DS-16 inline select and date
 * popover need exactly the same answer, and EDIT-03 gave them an overlay-layer
 * surface that asks it. Rather than a second copy, the decision now lives in
 * `~/shared/anchored/anchored-placement` and this module names it in the
 * overflow menu's own vocabulary. `clampMenuInline` stays here: it corrects an
 * ABSOLUTELY-positioned panel with a translation, which is this component's
 * anchoring strategy and not the overlay layer's.
 */

import {
  ANCHORED_MIN_CLAMP_PX,
  ANCHORED_VIEWPORT_MARGIN_PX,
  placeAnchoredBlock,
} from "~/shared/anchored/anchored-placement";

/** Minimum distance the menu keeps from the viewport edges (the Tooltip's 8). */
export const MENU_VIEWPORT_MARGIN_PX = ANCHORED_VIEWPORT_MARGIN_PX;

/**
 * The clamp's floor. A pathologically short viewport (a 200px embedded frame,
 * a phone with the keyboard up) could leave less room than a single item; a
 * menu clamped to nothing is a menu that cannot be used at all, so below this
 * the margin yields instead — the menu may then approach an edge, but it stays
 * operable and internally scrollable.
 */
export const MENU_MIN_CLAMP_PX = ANCHORED_MIN_CLAMP_PX;

export type MenuPlacementInput = {
  /** The trigger's viewport-relative top, from `getBoundingClientRect()`. */
  readonly triggerTop: number;
  /** The trigger's viewport-relative bottom. */
  readonly triggerBottom: number;
  /** The panel's natural content height (`scrollHeight` — clamp-independent). */
  readonly menuHeight: number;
  /** `document.documentElement.clientHeight` (excludes a classic scrollbar). */
  readonly viewportHeight: number;
  /** The gap between the trigger and the panel (the CSS anchor offset). */
  readonly offset: number;
};

export type MenuPlacement = {
  readonly side: "below" | "above";
  /** A pixel clamp when neither side holds the whole menu; null = unclamped. */
  readonly maxHeight: number | null;
};

export function placeMenu({
  triggerTop,
  triggerBottom,
  menuHeight,
  viewportHeight,
  offset,
}: MenuPlacementInput): MenuPlacement {
  return placeAnchoredBlock({
    triggerTop,
    triggerBottom,
    surfaceHeight: menuHeight,
    viewportHeight,
    offset,
  });
}

export type MenuInlineClampInput = {
  /** The panel's viewport-relative left, measured with no correction applied. */
  readonly panelLeft: number;
  /** The panel's viewport-relative right, measured with no correction applied. */
  readonly panelRight: number;
  /** `document.documentElement.clientWidth` (excludes a classic scrollbar). */
  readonly viewportWidth: number;
};

/**
 * The horizontal shift (px) that keeps the panel inside the viewport margins.
 * Zero when it already fits. When the panel cannot honour both edges (wider
 * than the viewport minus margins — the CSS max-inline-size makes this
 * effectively unreachable), the START edge wins so the labels stay readable.
 */
export function clampMenuInline({
  panelLeft,
  panelRight,
  viewportWidth,
}: MenuInlineClampInput): number {
  let shift = 0;
  if (panelRight > viewportWidth - MENU_VIEWPORT_MARGIN_PX) {
    shift = viewportWidth - MENU_VIEWPORT_MARGIN_PX - panelRight;
  }
  if (panelLeft + shift < MENU_VIEWPORT_MARGIN_PX) {
    shift = MENU_VIEWPORT_MARGIN_PX - panelLeft;
  }
  return shift;
}
