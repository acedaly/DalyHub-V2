/**
 * EDIT-03 — where an anchored overlay actually fits, as PURE GEOMETRY.
 *
 * Every floating surface in DalyHub answers the same three questions: which side
 * of its trigger can hold it, how tall it is allowed to be there, and how far it
 * has to slide along the inline axis to stay on screen. This module is those
 * answers, separated from React and the DOM (the `swipe-model` precedent) so the
 * contract is unit-testable with plain numbers.
 *
 * The block-axis rules arrived with UIQ-021 for the DS-12 overflow menu and are
 * unchanged, only re-homed — they were never menu-specific:
 *
 *   1. prefer the normal below-trigger placement when the whole surface fits;
 *   2. flip above the trigger when the whole surface fits there instead;
 *   3. when neither side can contain it, take the larger side and CLAMP the
 *      surface's height to it — the surface then scrolls internally.
 *
 * EDIT-03 added the rest of the solver, because a surface rendered in the
 * OVERLAY LAYER (`AnchoredSurface`) has no anchoring parent to inherit a
 * position from: it needs absolute viewport coordinates, not just a side. So
 * {@link placeAnchoredSurface} composes the block decision with an inline one
 * and returns the `top`/`left` a `position: fixed` box can be painted at.
 *
 * Nothing here reads the DOM, and nothing here knows about writing modes beyond
 * the `direction` it is told — resolving `start`/`end` into left/right is the
 * caller's measurement concern, and doing it in one pure place is what stops it
 * being done differently in each surface.
 */

/** Minimum distance an anchored surface keeps from the viewport edges. */
export const ANCHORED_VIEWPORT_MARGIN_PX = 8;

/**
 * The clamp's floor. A pathologically short viewport (a 200px embedded frame, a
 * phone with the keyboard up) could leave less room than a single item; a
 * surface clamped to nothing cannot be used at all, so below this the margin
 * yields instead — the surface may then approach an edge, but it stays operable
 * and internally scrollable.
 */
export const ANCHORED_MIN_CLAMP_PX = 96;

export type AnchoredBlockInput = {
  /** The trigger's viewport-relative top, from `getBoundingClientRect()`. */
  readonly triggerTop: number;
  /** The trigger's viewport-relative bottom. */
  readonly triggerBottom: number;
  /** The surface's natural content height (`scrollHeight` — clamp-independent). */
  readonly surfaceHeight: number;
  /** `document.documentElement.clientHeight` (excludes a classic scrollbar). */
  readonly viewportHeight: number;
  /** The gap between the trigger and the surface. */
  readonly offset: number;
};

export type AnchoredBlockPlacement = {
  readonly side: "below" | "above";
  /** A pixel clamp when neither side holds the whole surface; null = unclamped. */
  readonly maxHeight: number | null;
};

/** Which side of the trigger the surface takes, and how tall it may be there. */
export function placeAnchoredBlock({
  triggerTop,
  triggerBottom,
  surfaceHeight,
  viewportHeight,
  offset,
}: AnchoredBlockInput): AnchoredBlockPlacement {
  const spaceBelow =
    viewportHeight - ANCHORED_VIEWPORT_MARGIN_PX - (triggerBottom + offset);
  const spaceAbove = triggerTop - offset - ANCHORED_VIEWPORT_MARGIN_PX;

  if (surfaceHeight <= spaceBelow) {
    return { side: "below", maxHeight: null };
  }
  if (surfaceHeight <= spaceAbove) {
    return { side: "above", maxHeight: null };
  }
  const side = spaceAbove > spaceBelow ? "above" : "below";
  const room = side === "above" ? spaceAbove : spaceBelow;
  return { side, maxHeight: Math.max(room, ANCHORED_MIN_CLAMP_PX) };
}

export type AnchoredInlineInput = {
  /** The anchor's viewport-relative left. */
  readonly anchorLeft: number;
  /** The anchor's viewport-relative right. */
  readonly anchorRight: number;
  /** The surface's natural width. */
  readonly surfaceWidth: number;
  /** `document.documentElement.clientWidth` (excludes a classic scrollbar). */
  readonly viewportWidth: number;
  /** Which of the anchor's inline edges the surface prefers to line up with. */
  readonly align: AnchoredAlign;
  /** The writing direction the `start`/`end` above are expressed in. */
  readonly direction: AnchoredDirection;
};

export type AnchoredAlign = "start" | "end";
export type AnchoredDirection = "ltr" | "rtl";

/**
 * The surface's viewport-relative `left`, aligned to the requested anchor edge
 * and then clamped inside the viewport margins.
 *
 * When the surface cannot honour both edges (wider than the viewport minus the
 * margins) the START edge wins, because that is where the labels begin — the
 * same rule the DS-12 menu has always used.
 */
export function placeAnchoredInline({
  anchorLeft,
  anchorRight,
  surfaceWidth,
  viewportWidth,
  align,
  direction,
}: AnchoredInlineInput): number {
  // `start` is the anchor's leading edge in the document's own direction, so in
  // RTL "aligned to the start" means the two surfaces share their RIGHT edge.
  const leading = direction === "rtl" ? "right" : "left";
  const alignToLeft =
    align === "start" ? leading === "left" : leading !== "left";
  let left = alignToLeft ? anchorLeft : anchorRight - surfaceWidth;

  if (left + surfaceWidth > viewportWidth - ANCHORED_VIEWPORT_MARGIN_PX) {
    left = viewportWidth - ANCHORED_VIEWPORT_MARGIN_PX - surfaceWidth;
  }
  if (left < ANCHORED_VIEWPORT_MARGIN_PX) {
    left = ANCHORED_VIEWPORT_MARGIN_PX;
  }
  return left;
}

export type AnchoredRect = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export type AnchoredSurfaceInput = {
  /** The trigger's viewport rect. */
  readonly anchor: AnchoredRect;
  /** The surface's NATURAL size, measured with no clamp applied. */
  readonly surface: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** The gap between the trigger and the surface. */
  readonly offset: number;
  readonly align: AnchoredAlign;
  readonly direction: AnchoredDirection;
};

export type AnchoredSurfacePlacement = {
  /** Viewport-relative `top` for a `position: fixed` surface. */
  readonly top: number;
  /** Viewport-relative `left` for a `position: fixed` surface. */
  readonly left: number;
  readonly side: "below" | "above";
  /** A pixel clamp when neither side holds the whole surface; null = unclamped. */
  readonly maxHeight: number | null;
};

/**
 * The complete placement of a surface rendered in the overlay layer.
 *
 * The returned `top` accounts for the clamp: a surface flipped ABOVE its trigger
 * and then shortened has to start lower, or its bottom edge would no longer meet
 * the trigger. Both coordinates are finally held inside the viewport margins, so
 * a trigger that is itself partly off-screen (mid-scroll, or in a horizontally
 * scrolling row) still gets a fully visible surface.
 */
export function placeAnchoredSurface({
  anchor,
  surface,
  viewport,
  offset,
  align,
  direction,
}: AnchoredSurfaceInput): AnchoredSurfacePlacement {
  const block = placeAnchoredBlock({
    triggerTop: anchor.top,
    triggerBottom: anchor.bottom,
    surfaceHeight: surface.height,
    viewportHeight: viewport.height,
    offset,
  });

  const height = Math.min(surface.height, block.maxHeight ?? surface.height);
  const unclampedTop =
    block.side === "below"
      ? anchor.bottom + offset
      : anchor.top - offset - height;
  const lowest = Math.max(
    ANCHORED_VIEWPORT_MARGIN_PX,
    viewport.height - ANCHORED_VIEWPORT_MARGIN_PX - height,
  );
  const top = Math.min(
    Math.max(unclampedTop, ANCHORED_VIEWPORT_MARGIN_PX),
    lowest,
  );

  const left = placeAnchoredInline({
    anchorLeft: anchor.left,
    anchorRight: anchor.right,
    surfaceWidth: surface.width,
    viewportWidth: viewport.width,
    align,
    direction,
  });

  return { top, left, side: block.side, maxHeight: block.maxHeight };
}
