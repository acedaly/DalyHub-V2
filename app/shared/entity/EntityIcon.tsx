/**
 * PX-02 — the entity identity glyph.
 *
 * Renders an entity type's icon in its accent, optionally inside a calm tinted
 * badge. This is the single component every surface uses to show entity identity —
 * the sidebar nav rows, the Pane Header, empty states, and (later) Search results.
 * It is decorative by default (the icon is `aria-hidden`); a text label always names
 * the entity beside it (AGENTS.md §15), so identity is never carried by colour or
 * icon alone.
 */

import type { EntityType } from "./identity";
import { ENTITY_IDENTITY, entityAccent } from "./identity";

export type EntityIconProps = {
  readonly type: EntityType;
  /** `plain` renders just the accented glyph; `badge` wraps it in a tinted square. */
  readonly variant?: "plain" | "badge";
  /** Pixel size of the glyph; defaults follow the surrounding text (`1em`). */
  readonly size?: number | string;
  /** Optional accessible name; omit to keep the glyph decorative (default). */
  readonly title?: string;
  readonly className?: string;
};

export function EntityIcon({
  type,
  variant = "plain",
  size,
  title,
  className,
}: EntityIconProps) {
  const { Icon } = ENTITY_IDENTITY[type];
  const classes = ["dh-entity-icon", `dh-entity-icon--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={classes}
      data-entity={type}
      style={{ color: entityAccent(type) }}
    >
      <Icon size={size} title={title} />
    </span>
  );
}
