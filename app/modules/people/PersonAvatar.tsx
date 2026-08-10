/**
 * PEOPLE-01 — the Person avatar.
 *
 * Renders an uploaded photo when present, otherwise generated initials. Purely
 * presentational; the image is decorative (the accessible name is always the
 * Person's display name carried by the surrounding heading/link), and initials
 * never convey meaning by colour alone — the letters are the identity. Future
 * Gravatar support slots in by resolving a `photoUrl` upstream; this component
 * needs no change.
 *
 * UIX-05 — the generated avatar takes the CIRCLE's accent.
 *
 * It used to paint every initials avatar with one colour (`entityAccent(
 * "person")`), so a list of twenty People was twenty identical violet discs and
 * the mark carried no information at all — the exact defect UIX-03 found on the
 * Goals gallery, where every Goal drew the same grey flag.
 *
 * The rank comes from the Person's CIRCLE (`person-circles.ts`), which is a pure
 * function of the relationship the owner already recorded. That satisfies the
 * rule the identity ramp is governed by (D21/D22, ADR-068 §5): identity is a
 * stable classification the owner made, never a hash of an id and never a
 * status. A Person with no relationship recorded gets the neutral disc, because
 * a colour that means nothing is worse than no colour.
 *
 * Photo avatars are unaffected — a photograph is the strongest identity a row
 * can carry, and tinting a ring around it would only compete with it.
 */

import { areaAccentForRank } from "~/shared/pill";

export interface PersonAvatarProps {
  readonly name: string;
  readonly initials: string;
  readonly photoUrl?: string | null;
  /** Visual size in pixels. Defaults to 40 (list) — pass 96 for the record. */
  readonly size?: number;
  /**
   * The Person's circle rank, from `personCircleRank`. `null` — no relationship
   * recorded — renders the neutral disc.
   */
  readonly colourRank?: number | null;
  readonly className?: string;
}

export function PersonAvatar({
  initials,
  photoUrl,
  size = 40,
  colourRank = null,
  className,
}: PersonAvatarProps) {
  const style = {
    inlineSize: `${size}px`,
    blockSize: `${size}px`,
    fontSize: `${Math.round(size * 0.38)}px`,
  } as const;

  if (photoUrl) {
    return (
      <span
        className={`dh-person-avatar${className ? ` ${className}` : ""}`}
        style={style}
        data-has-photo="true"
      >
        {/* Decorative: the accessible name is carried by the record heading/link. */}
        <img src={photoUrl} alt="" className="dh-person-avatar__img" />
      </span>
    );
  }

  return (
    <span
      className={`dh-person-avatar${className ? ` ${className}` : ""}`}
      style={style}
      data-has-photo="false"
      data-accent={
        colourRank === null ? undefined : String(areaAccentForRank(colourRank))
      }
      aria-hidden="true"
    >
      <span className="dh-person-avatar__initials">{initials}</span>
    </span>
  );
}
