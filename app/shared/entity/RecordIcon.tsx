/**
 * A record's icon — the one it chose, or the one its type gives it.
 *
 * `EntityIcon` answers "what kind of thing is this?" and is right wherever a
 * type is the whole story. `RecordIcon` answers "what is THIS record?", which is
 * a different question the moment an Area or a Project can carry a chosen icon.
 *
 * The loader passes only the serialisable KEY; this resolves the component. That
 * split is what keeps the icon out of the wire format — a route payload carries
 * `iconKey: "travel"`, never a component, never markup.
 *
 * FALLBACK IS THE CONTRACT. A key this build does not recognise renders the
 * entity's default icon and nothing else happens: no throw, no empty box, no
 * broken SSR. That case is real rather than theoretical — an icon removed in a
 * later release, a record restored from an older export, a hand-edited row — and
 * a record that will not render is far worse than one wearing its default.
 */

import type { EntityType } from "./identity";
import { entityAccent } from "./identity";
import { EntityIcon } from "./EntityIcon";
import { entityIconOption } from "./entity-icon-catalogue";

export type RecordIconProps = {
  /** The record's entity type, which supplies both the fallback and the accent. */
  readonly entityType: EntityType;
  /** The record's chosen key, straight from the loader. */
  readonly iconKey?: string | null;
  /** `plain` renders the glyph; `badge` wraps it in the tinted container. */
  readonly variant?: "plain" | "badge";
  /** `accent` uses the entity identity colour; `inherit` takes the surrounding colour. */
  readonly tone?: "accent" | "inherit";
  readonly size?: number | string;
  /** An accessible name. Omit to keep the glyph decorative, which is the default. */
  readonly title?: string;
  readonly className?: string;
};

export function RecordIcon({
  entityType,
  iconKey,
  variant = "plain",
  tone = "accent",
  size,
  title,
  className,
}: RecordIconProps) {
  const chosen = entityIconOption(iconKey);

  // No choice, or a choice this build cannot resolve: the entity's own icon.
  if (!chosen) {
    return (
      <EntityIcon
        type={entityType}
        variant={variant}
        tone={tone}
        size={size}
        title={title}
        className={className}
      />
    );
  }

  // A chosen icon still wears its ENTITY's colours. The key says which glyph,
  // not which palette — an Area that picks "travel" is still an Area, and
  // letting the glyph carry its own colour would put a second, competing
  // identity system beside the generated accents.
  const { Icon } = chosen;
  const classes = ["dh-entity-icon", `dh-entity-icon--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      data-entity={entityType}
      data-icon-key={chosen.key}
      style={
        tone === "accent" ? { color: entityAccent(entityType) } : undefined
      }
    >
      <Icon size={size} title={title} />
    </span>
  );
}
