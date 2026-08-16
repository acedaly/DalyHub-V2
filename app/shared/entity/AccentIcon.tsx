/**
 * The entity IDENTITY TILE — a record's glyph on its own colour.
 *
 * The audit found Area identity carried by an 8px coloured dot and Project
 * identity by a 16px monochrome glyph, which is why a page of either read as one
 * undifferentiated list. The reference answers this with a rounded, tinted
 * square holding the record's glyph, and that tile is what makes a grid
 * scannable before a word of it is read.
 *
 * Three rules keep it from becoming decoration:
 *
 * 1. **Nothing here decides what colour a record is.** The slot and the glyph
 *    key both come out of `resolveIdentity`, the one resolver every identity
 *    surface shares. Before IDENTITY-01 this component folded a rank itself and
 *    its docstring described Area inheritance while the Project card's bar used
 *    the Project's OWN rank — so a red flame could sit above a violet bar. That
 *    disagreement is not fixed here; it is fixed in the resolver, which is the
 *    only place it cannot come back.
 * 2. **The tile publishes the record's slot to the cascade.** `data-identity`
 *    resolves the four colour roles for everything inside it, and the same
 *    attribute on an owning card resolves them for that card's progress bar. A
 *    tile rendered on its own is therefore correct on its own, and a tile
 *    rendered inside a card agrees with the card by construction.
 * 3. **The glyph is resolved from the KEY.** `RecordIcon` decides which drawing
 *    the owner's chosen key names, and falls back to the entity default for a
 *    key this build cannot resolve. Nothing here knows what an icon looks like.
 *
 * It is deliberately not a status: the hue says WHICH record, never how the work
 * is going, so it never competes with the one status chip beside it. Meaning is
 * never carried by the tint alone — the record's name is always present as text
 * on the same card.
 */

import type { EntityType } from "./identity";
import {
  identityAttribute,
  resolveIdentity,
  type IdentitySource,
} from "./identity-resolution";
import { RecordIcon } from "./RecordIcon";

export type AccentIconProps = IdentitySource & {
  /** The record's entity type — supplies the fallback glyph. */
  readonly entityType: EntityType;
  /**
   * M3X-02 — the identity mark's SIZE HIERARCHY.
   *
   * The mark is the product's recognition-before-reading device, and one size
   * for every context is why a gallery card and a 44px list row previously
   * carried the same 36px square. Three rungs, and a surface picks the one that
   * matches its weight in the page — never a pixel value at the call site:
   *
   *   `lg` a desktop gallery card, where the mark leads the composition
   *   `md` the default — a record header, a supporting surface, a wide row
   *   `sm` a compact row, where the mark identifies without dominating
   */
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
};

export function AccentIcon({
  entityType,
  colourSlot = null,
  iconKey = null,
  colourRank = null,
  inherited = null,
  size = "md",
  className,
}: AccentIconProps) {
  const identity = resolveIdentity({
    colourSlot,
    iconKey,
    colourRank,
    inherited,
  });
  return (
    <span
      className={["dh-accent-icon", className].filter(Boolean).join(" ")}
      {...identityAttribute(identity.slot)}
      data-size={size}
      aria-hidden="true"
    >
      {/* `tone="inherit"` so the glyph takes the tile's resolved identity hue
       * rather than painting a second, competing entity accent inside it. */}
      <RecordIcon
        entityType={entityType}
        iconKey={identity.iconKey}
        tone="inherit"
      />
    </span>
  );
}
