/**
 * DS-16 — keep an anchored inline popover inside the viewport.
 *
 * The select menu and the date popover are absolutely positioned from their
 * trigger's inline-start edge, which is right until the trigger sits near the
 * end of the viewport: a 20rem menu hanging off a value in the right-hand column
 * of a record, or off anything at all on a 320px phone, runs past the edge and
 * takes the page's horizontal scrollbar with it.
 *
 * CSS alone cannot decide this — it depends on where the trigger happens to be —
 * so the surface measures itself once it is on screen and flips its anchor to
 * the inline-END edge when the start-anchored box would not fit. One
 * measurement, one attribute, no scroll listener: the popovers are short-lived
 * and dismiss on outside pointer-down anyway.
 *
 * The attribute is `data-align="end"`; `inline-edit.css` owns what that means in
 * both writing directions.
 */

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

// `useLayoutEffect` warns during SSR; fall back to `useEffect` on the server,
// where there is no layout to measure anyway (the same guard the Drawer's
// scroll lock and the shared tooltip already use).
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** How close to the viewport edge the surface may sit before flipping. */
const EDGE_GUTTER_PX = 8;

export type AnchoredAlignment = "start" | "end";

/**
 * Report the alignment an anchored surface should use.
 *
 * `open` gates the measurement — a closed surface has no box to measure — and
 * re-running on it means a menu reopened after the page has scrolled or resized
 * is measured again rather than trusting a stale answer.
 */
export function useAnchoredAlignment(
  surfaceRef: RefObject<HTMLElement | null>,
  open: boolean,
): AnchoredAlignment {
  const [alignment, setAlignment] = useState<AnchoredAlignment>("start");

  // Layout effect, not effect: the flip must be applied before the browser
  // paints, otherwise the surface is visibly drawn in the wrong place first.
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setAlignment("start");
      return;
    }
    const node = surfaceRef.current;
    if (!node || typeof node.getBoundingClientRect !== "function") return;
    const rect = node.getBoundingClientRect();
    const viewport =
      typeof window === "undefined" ? 0 : window.innerWidth || rect.right;
    if (viewport === 0) return;
    // Only ever flips TOWARDS the start edge. A surface that overflows in both
    // directions (wider than the viewport) keeps the start anchor, because
    // flipping it would hide its beginning — the part that carries the labels.
    const overflowsEnd = rect.right > viewport - EDGE_GUTTER_PX;
    const wouldFitFlipped = rect.width <= viewport - EDGE_GUTTER_PX * 2;
    setAlignment(overflowsEnd && wouldFitFlipped ? "end" : "start");
  }, [surfaceRef, open]);

  return alignment;
}
