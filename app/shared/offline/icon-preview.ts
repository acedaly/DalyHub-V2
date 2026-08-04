/**
 * BRAND-01 — the icon review surface's data.
 *
 * Kept out of the dev-only route component so the sizes and mask shapes are
 * plain data a test can assert against, and so the review page cannot drift from
 * the sizes the icon system actually ships.
 *
 * Every `src` carries the icon generation (`-v2`), exactly as the manifest and
 * `root.tsx` do — `test/unit/pwa/manifest-and-icons.test.ts` fails if one of
 * these names is not a file the generator produces, so the review page cannot
 * quietly review a superseded asset.
 */

/** Every size the review page shows, in the order it shows them. */
export const PNG_SIZES: readonly {
  readonly label: string;
  readonly src: string;
  /** The rendered size in CSS pixels — the true size, never upscaled. */
  readonly display: number;
}[] = [
  { label: "16 px", src: "/icons/icon-16-v2.png", display: 16 },
  { label: "32 px", src: "/icons/icon-32-v2.png", display: 32 },
  { label: "48 px", src: "/icons/icon-48-v2.png", display: 48 },
  {
    label: "180 px (Apple touch)",
    src: "/icons/apple-touch-icon-v2.png",
    display: 180,
  },
  { label: "192 px", src: "/icons/icon-192-v2.png", display: 192 },
  { label: "512 px", src: "/icons/icon-512-v2.png", display: 256 },
];

/**
 * The mask shapes platforms apply to an adaptive icon. The radii are CSS
 * approximations of the real thing — close enough to judge whether the mark is
 * clipped, which is what the review is for.
 */
export const MASK_SHAPES: readonly {
  readonly label: string;
  readonly radius: string;
}[] = [
  { label: "Circle (Android)", radius: "50%" },
  { label: "Rounded square", radius: "22%" },
  { label: "Squircle (iOS-like)", radius: "42% / 42%" },
];

/** The maskable asset the mask review renders. */
export const MASKABLE_PREVIEW_SRC = "/icons/icon-maskable-512-v2.png";
