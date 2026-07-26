/**
 * PEOPLE-01 — the Person avatar.
 *
 * Renders an uploaded photo when present, otherwise generated initials on the
 * Person entity accent. Purely presentational; the image is decorative (the
 * accessible name is always the Person's display name carried by the surrounding
 * heading/link), and initials never convey meaning by colour alone — the letters
 * are the identity. Future Gravatar support slots in by resolving a `photoUrl`
 * upstream; this component needs no change.
 */

import { entityAccent } from "~/shared/entity";

export interface PersonAvatarProps {
  readonly name: string;
  readonly initials: string;
  readonly photoUrl?: string | null;
  /** Visual size in pixels. Defaults to 40 (list) — pass 96 for the record. */
  readonly size?: number;
  readonly className?: string;
}

export function PersonAvatar({
  initials,
  photoUrl,
  size = 40,
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
      style={{ ...style, backgroundColor: entityAccent("person") }}
      data-has-photo="false"
      aria-hidden="true"
    >
      <span className="dh-person-avatar__initials">{initials}</span>
    </span>
  );
}
