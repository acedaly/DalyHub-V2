/**
 * DS-10b Settings layout — small decorative glyphs.
 *
 * In-house inline SVGs (no icon dependency, consistent with the PX-02 in-house
 * icon set and the DS-10 feedback glyphs). All are `aria-hidden`: the dangerous
 * region's meaning is ALSO carried by its heading text and border, never by the
 * icon or colour alone, so a colour-blind or screen-reader user loses nothing.
 */

type GlyphProps = { readonly className?: string };

const BASE_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** A warning triangle used to badge the dangerous-settings region. */
export function DangerGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M10 2.6 18 16.4H2z" />
      <path d="M10 8v3.4" />
      <path d="M10 14h.01" />
    </svg>
  );
}
