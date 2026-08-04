/**
 * BRAND-01 — the full DalyHub lockup: the mark, the wordmark and the tagline.
 *
 * The wordmark and tagline are LIVE TEXT, styled by the application, never a
 * rasterised image. That is not a preference: baked text does not scale with the
 * owner's OS text size, does not reflow at a phone width, is invisible to a
 * screen reader and to search, cannot follow a theme, and costs bytes on a
 * connection that may not have them. The one thing that genuinely is artwork —
 * the gradient mark — is the one thing rendered as artwork.
 *
 * Light and dark are handled by the type, not by a second lockup: the mark's
 * gradient is a fixed brand value that clears 3:1 against every DalyHub page
 * canvas (both the near-white and the near-black ones), and the words use the
 * semantic text tokens, so they follow whatever theme is resolved.
 *
 * Where it belongs: About, installation guidance, and the branded surfaces that
 * have room for it. NOT the navigation rail — a tagline in a 240 px rail is
 * decoration competing with navigation, which is why `SidebarBrand` renders the
 * compact identity instead.
 */

// Imported from its own module rather than the `~/shared/icons` barrel: see the
// note in `index.ts`. Pulling ninety outline glyphs in to draw one brand mark is
// a real cost on the offline shell, which precaches whatever it imports.
import { BrandMark } from "~/shared/icons/BrandMark";

/** The product name. One spelling, one place. */
export const PRODUCT_NAME = "DalyHub";

/** The approved tagline. */
export const PRODUCT_TAGLINE = "Your life. Connected.";

export type BrandLockupProps = {
  /**
   * `full` shows the tagline; `wordmark` is the mark and name only, for a place
   * that already carries its own descriptive lead.
   */
  readonly variant?: "full" | "wordmark";
  /** `lg` is the About/onboarding hero size; `md` suits an inline surface. */
  readonly size?: "md" | "lg";
  /**
   * The element the product name renders as. Defaults to a `<span>`; pass a
   * heading level only where the lockup genuinely IS the surface's heading, so
   * the document outline stays honest.
   */
  readonly as?: "span" | "h1" | "h2";
};

export function BrandLockup({
  variant = "full",
  size = "lg",
  as: NameElement = "span",
}: BrandLockupProps) {
  return (
    <div className={`dh-brand-lockup dh-brand-lockup--${size}`}>
      {/* Decorative: the product name sits immediately beside it as real text,
       * so naming the mark as well would make a screen reader say "DalyHub
       * DalyHub". */}
      <span className="dh-brand-lockup__mark" aria-hidden="true">
        <BrandMark />
      </span>
      {/* A `div`, not a `span`: `as` may be a heading, and a heading is not
       * permitted inside phrasing content. */}
      <div className="dh-brand-lockup__words">
        <NameElement className="dh-brand-lockup__name">
          {PRODUCT_NAME}
        </NameElement>
        {variant === "full" ? (
          <span className="dh-brand-lockup__tagline">{PRODUCT_TAGLINE}</span>
        ) : null}
      </div>
    </div>
  );
}
