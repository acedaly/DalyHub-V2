/**
 * PX-02 — the shared icon primitive.
 *
 * DalyHub uses ONE outline icon set (DESIGN_SYSTEM.md → Foundations, Iconography).
 * PRODUCT_EXPERIENCE #3 calls for a single tree-shakeable outline set (e.g. Lucide);
 * to preserve the project's zero-runtime-dependency posture (no new package, no
 * proxy/Workers-compat risk) we ship an in-house outline set drawn in the same
 * idiom — a 24×24 viewBox, `currentColor` strokes, 1.75px weight, round caps/joins —
 * exposed through this one primitive. The *set* is swappable; the entity-identity
 * MAPPING (one icon per entity type) is the durable contract.
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

/** Shared attributes every DalyHub icon renders with. */
const BASE_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

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
        {children}
      </svg>
    );
  }
  IconComponent.displayName = displayName;
  return IconComponent;
}
