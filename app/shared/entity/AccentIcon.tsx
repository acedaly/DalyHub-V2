/**
 * The entity IDENTITY container — a record's icon on its Area's accent.
 *
 * The audit found Area identity carried by an 8px coloured dot and Project
 * identity by a 16px monochrome glyph, which is why a page of either read as
 * one undifferentiated list. The reference answers this with a rounded, tinted
 * square holding the record's glyph, and that container is what makes a grid
 * scannable before a word of it is read.
 *
 * Two rules keep it from becoming decoration:
 *
 * 1. **The accent is inherited, never invented.** An Area supplies its own
 *    stable `colourRank` (ADR-068 decision 5); a Project supplies the rank of
 *    the Area it belongs to. A record with no Area gets the neutral container,
 *    not a random colour — a colour that means nothing is worse than none.
 * 2. **The glyph is resolved from the KEY.** `RecordIcon` decides which drawing
 *    the owner's chosen key names, and falls back to the entity default for a
 *    key this build cannot resolve. Nothing here knows what an icon looks like.
 *
 * It is deliberately not a status: the accent says WHICH Area, never how the
 * work is going, so it never competes with the one status chip beside it.
 * Meaning is never carried by the tint alone — the Area's name is always
 * present as text on the same card.
 */

import { areaAccentForRank } from "~/shared/pill";

import type { EntityType } from "./identity";
import { RecordIcon } from "./RecordIcon";

export type AccentIconProps = {
  /** The record's entity type — supplies the fallback glyph. */
  readonly entityType: EntityType;
  /** The record's chosen key, straight from the loader. */
  readonly iconKey?: string | null;
  /**
   * The Area's stable 0-based rank, or `null` for the neutral container. For
   * an Area this is its own rank; for a Project it is its Area's.
   */
  readonly colourRank?: number | null;
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
  iconKey,
  colourRank = null,
  size = "md",
  className,
}: AccentIconProps) {
  const accent =
    colourRank === null ? undefined : String(areaAccentForRank(colourRank));
  return (
    <span
      className={["dh-accent-icon", className].filter(Boolean).join(" ")}
      data-accent={accent}
      data-size={size}
      aria-hidden="true"
    >
      {/* `tone="inherit"` so the glyph takes the container's on-accent colour
       * rather than painting a second, competing entity accent inside it. */}
      <RecordIcon entityType={entityType} iconKey={iconKey} tone="inherit" />
    </span>
  );
}
