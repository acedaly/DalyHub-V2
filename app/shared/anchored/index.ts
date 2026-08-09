/**
 * EDIT-03 — the shared anchored-overlay layer.
 *
 * ONE way to float a surface beside the control that opened it: portalled into
 * the overlay layer so no parent's `overflow` can clip it, placed by pure
 * geometry so it flips, clamps and slides to stay inside the viewport, and
 * dismissed by an outside press. Import from here.
 *
 * It carries no semantics. A menu, a listbox and a dialog are different things
 * and the host supplies the role, the ARIA and the keyboard contract; this layer
 * only answers "where does the box go, and when does it go away".
 */

export { AnchoredSurface } from "./AnchoredSurface";
export type { AnchoredSurfaceProps } from "./AnchoredSurface";
export {
  ANCHORED_MIN_CLAMP_PX,
  ANCHORED_VIEWPORT_MARGIN_PX,
  placeAnchoredBlock,
  placeAnchoredInline,
  placeAnchoredSurface,
} from "./anchored-placement";
export type {
  AnchoredAlign,
  AnchoredBlockInput,
  AnchoredBlockPlacement,
  AnchoredDirection,
  AnchoredInlineInput,
  AnchoredRect,
  AnchoredSurfaceInput,
  AnchoredSurfacePlacement,
} from "./anchored-placement";
