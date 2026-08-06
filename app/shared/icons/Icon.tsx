/**
 * M3-01 — the shared icon primitive.
 *
 * DalyHub uses ONE icon set (DESIGN_SYSTEM.md → Foundations, Iconography):
 * **Material Symbols Outlined**, weight 400, the icon library of the design
 * language the product now speaks (ADR-074 decision 7). PX-02 shipped an
 * in-house outline set and recorded that the *set* was swappable while the
 * entity-identity MAPPING was the durable contract; this is that swap, and the
 * public surface of this module — component names, props, sizing and
 * accessibility behaviour — is unchanged by it.
 *
 * Icons are decorative by default (`aria-hidden`), because DalyHub never conveys
 * meaning by icon alone — a text label always accompanies them (AGENTS.md §15). When
 * an icon must carry its own accessible name (rare), pass `title`, which promotes it
 * to `role="img"` with an accessible label.
 *
 * Size follows the surrounding text (`1em`) unless an explicit `size` is given, so an
 * icon scales with its label and honours OS text scaling.
 */

import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Pixel size; defaults to `1em` so the icon follows the surrounding font size. */
  readonly size?: number | string;
  /** When set, the icon carries its own accessible name (role="img"). */
  readonly title?: string;
};

/**
 * Shared attributes every DalyHub icon renders with.
 *
 * Material Symbols are FILLED paths — the outlined *style* is drawn as a closed
 * shape with a hole, not as a stroked skeleton — so there is no `stroke`,
 * `stroke-width` or line cap here. Painting them with a stroke would double
 * every edge.
 */
const BASE_PROPS = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

/**
 * The one place the upstream design space is mapped into ours.
 *
 * Material Symbols are authored at 960 units with a flipped origin
 * (`viewBox="0 -960 960 960"`, so the baseline is y=0 and the glyph extends
 * upward). DalyHub's icons have always been 24×24, and dozens of stylesheets
 * size and position against that. Rather than rewrite every path's coordinates
 * — which would break byte-exact provenance and make a re-copy a merge — the
 * conversion is expressed once, here, as the affine map it actually is:
 *
 *     (x, y)  ->  (x * 24/960, y * 24/960 + 24)
 *
 * `scale` is uniform, so nothing is distorted, and the glyphs are fills, so
 * there is no stroke width for the scale to shrink.
 */
const SYMBOLS_TO_24 = "translate(0 24) scale(0.025)";

/**
 * Build a named icon component from its inner SVG geometry. Keeps every icon a tiny,
 * tree-shakeable component with identical accessibility and sizing behaviour.
 */
export function createIcon(displayName: string, children: React.ReactNode) {
  function IconComponent({ size = "1em", title, ...rest }: IconProps) {
    const accessible = title !== undefined;
    return (
      <svg
        {...BASE_PROPS}
        width={size}
        height={size}
        className="dh-icon"
        role={accessible ? "img" : undefined}
        aria-hidden={accessible ? undefined : true}
        aria-label={accessible ? title : undefined}
        focusable="false"
        {...rest}
      >
        {title !== undefined ? <title>{title}</title> : null}
        <g transform={SYMBOLS_TO_24}>{children}</g>
      </svg>
    );
  }
  IconComponent.displayName = displayName;
  return IconComponent;
}
