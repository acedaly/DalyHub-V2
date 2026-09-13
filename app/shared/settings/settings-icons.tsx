/**
 * DS-10b Settings layout — small decorative glyphs.
 *
 * UNTITLED-15 — this was a hand-drawn warning triangle, and it was the SAME
 * hand-drawn warning triangle as `feedback-icons.tsx`'s: two copies of one
 * shape, in two modules, because neither could reach a shared set that did not
 * have it. Both are `@untitledui/icons` `AlertTriangle` now, so the dangerous
 * region of a Settings page and a warning notification wear one mark.
 *
 * `aria-hidden`: the dangerous region's meaning is ALSO carried by its heading
 * text and border, never by the icon or colour alone.
 */

import { AlertTriangle } from "@untitledui/icons";

type GlyphProps = { readonly className?: string };

/** A warning triangle used to badge the dangerous-settings region. */
export function DangerGlyph({ className }: GlyphProps) {
  return (
    <AlertTriangle
      width={18}
      height={18}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
