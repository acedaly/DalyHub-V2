/**
 * DS-14 §4 — the density region.
 *
 * A region declares what KIND of surface it is. The preset stylesheet
 * (`app/styles/density.css`) turns that declaration into sizing tokens, and the
 * components inside the region consume those tokens. That indirection is the
 * whole point:
 *
 *   - density is a property of the SURFACE, so it is decided once per region
 *     rather than argued at every call site;
 *   - no component takes a density prop, so none of them can disagree;
 *   - no module branches on itself, so two lists in different modules cannot
 *     drift apart;
 *   - there is no owner-facing switch, because there is nothing to switch — the
 *     value is derived from what the surface is (brief §9).
 *
 * There are exactly TWO presets and there is no third. If a surface does not
 * obviously fall into one, classify it with the rule in `DESIGN_SYSTEM.md`
 * ("Surface type") and record the classification there — do not add a preset.
 *
 * Regions NEST, and the nearest one wins, because every preset value is a custom
 * property resolved by the cascade. A Note record is the canonical case: a
 * Reading region for the body, a Collection region for the metadata and the
 * linked items, on the same route.
 */

import type { ElementType, ReactNode } from "react";

/** The two presets. Deliberately not extensible — see the module comment. */
export type DensityPreset = "reading" | "collection";

export interface RegionProps {
  /**
   * What kind of surface this is. `reading` for prose the owner reads;
   * `collection` for anything the owner scans.
   */
  readonly density: DensityPreset;
  /**
   * The element to render. Defaults to a plain `div`; pass `section`, `article`
   * or `aside` where the surface has real document semantics, so the region
   * never costs a wrapper that means nothing.
   */
  readonly as?: ElementType;
  readonly className?: string;
  /** Applied to the same element, for regions that are also landmarks. */
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

/**
 * A region wrapper carrying `data-density`.
 *
 * The attribute is the contract: `density.css` selects on it, the theme
 * screenshots read it, and a reviewer can see a surface's classification in the
 * markup without following a prop through three components.
 */
export function Region({
  density,
  as: Element = "div",
  className,
  children,
  ...rest
}: RegionProps) {
  return (
    <Element data-density={density} className={className} {...rest}>
      {children}
    </Element>
  );
}
