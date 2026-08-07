/**
 * DS-16 — one fact in a gallery card's metadata region.
 *
 * The audit's complaint about the old collection rows was not that they carried
 * counts, it was the SHAPE the counts took: `Goals: 2 · Projects: 4 · Tasks: 11`
 * — three label/value pairs at one weight, repeated on every row, more words
 * spent on the nouns than on the numbers. A card that looks like a database
 * record does not read like an entry into a part of someone's life.
 *
 * This is the compact form: a glyph, the number, and the noun beside it. The
 * glyph is decorative and the noun is right there — so this is never
 * "meaning behind an icon", which would be the opposite mistake. Two facts read
 * as a group; six would read as a table, which is why the cards pass few.
 */

import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "~/shared/icons";

export interface CardMetaFactProps {
  /** The glyph. Decorative — the text beside it carries the meaning. */
  readonly icon: ComponentType<IconProps>;
  /** The value, e.g. "4". */
  readonly value: ReactNode;
  /** The noun, already pluralised by the caller, e.g. "Projects". */
  readonly label: string;
  readonly className?: string;
}

export function CardMetaFact({
  icon: Glyph,
  value,
  label,
  className,
}: CardMetaFactProps) {
  return (
    <span
      className={["dh-ecard__fact", className].filter(Boolean).join(" ")}
      data-testid="entity-card-fact"
    >
      <Glyph className="dh-ecard__fact-icon" aria-hidden="true" />
      <span className="dh-ecard__fact-value">{value}</span>
      <span className="dh-ecard__fact-label">{label}</span>
    </span>
  );
}
