/**
 * PX-02 — the entity identity glyph.
 *
 * Renders an entity type's icon, optionally in its accent and optionally inside a
 * calm tinted badge. This is the single component every surface uses to show
 * entity identity — the Pane Header, empty states, Search results, linked rows.
 * It is decorative by default (the icon is `aria-hidden`); a text label always
 * names the entity beside it (AGENTS.md §15), so identity is never carried by
 * colour or icon alone.
 *
 * `tone` exists because entity colour is not always the right answer. Spent on a
 * card, a chip or a chart series it distinguishes one kind of record from
 * another and earns its place. Spent on every row of permanent navigation it
 * produces a ten-colour rainbow that says only what each label already says, and
 * it devalues the accent everywhere else. Those callers pass `inherit` and the
 * glyph takes the colour of whatever it sits in.
 */

import type { EntityType } from "./identity";
import { ENTITY_IDENTITY, entityAccent } from "./identity";

export type EntityIconProps = {
  readonly type: EntityType;
  /** `plain` renders just the glyph; `badge` wraps it in a tinted square. */
  readonly variant?: "plain" | "badge";
  /**
   * `accent` paints the glyph in the entity's identity colour (the default);
   * `inherit` leaves it `currentColor`, for surfaces whose own state — a
   * selected navigation row, a hovered list row — owns the colour.
   */
  readonly tone?: "accent" | "inherit";
  /** Pixel size of the glyph; defaults follow the surrounding text (`1em`). */
  readonly size?: number | string;
  /** Optional accessible name; omit to keep the glyph decorative (default). */
  readonly title?: string;
  readonly className?: string;
};

export function EntityIcon({
  type,
  variant = "plain",
  tone = "accent",
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
      style={tone === "accent" ? { color: entityAccent(type) } : undefined}
    >
      <Icon size={size} title={title} />
    </span>
  );
}
