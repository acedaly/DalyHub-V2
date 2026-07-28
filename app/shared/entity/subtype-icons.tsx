/**
 * PX-05 — the shared **subtype-icon registry**.
 *
 * A second identity layer, deliberately distinct from `ENTITY_IDENTITY`:
 *
 *   - **Entity identity** — one icon + one accent per entity TYPE (Area, Goal,
 *     Project, …). Frozen, product-wide, never re-picked at a call site.
 *   - **Module subtype** — one glyph per meaningful SUB-KIND *within* an entity
 *     (a Diary entry's type, an Asset's type). Visually subordinate to the entity
 *     icon, owned by the module that defines the vocabulary.
 *
 * Diary and Assets each grew their own private map for this (`diary-icons.tsx`,
 * `asset-icons.tsx`), which is how Diary's `meeting` subtype ended up reusing the
 * Meeting *entity* glyph — two different things wearing one icon. This registry
 * makes the pattern shared instead of forked: a module registers its subtype
 * glyphs once, everything else resolves them through one function with one safe
 * fallback (the entity glyph), and a subtype can never silently claim an entity's
 * identity because the fallback is the only bridge between the layers.
 *
 * Rules (DESIGN_SYSTEM.md → Entity Identity → Subtype icons): glyphs come from
 * the shared `app/shared/icons` set (never a one-off SVG), render in
 * `currentColor` so they are correct in both themes, are decorative
 * (`aria-hidden`) and always paired with the subtype's text label.
 */

import type { ComponentType } from "react";

import type { IconProps } from "~/shared/icons";

import { EntityIcon } from "./EntityIcon";
import type { EntityType } from "./identity";

/** A module's subtype → glyph mapping, keyed by the module's own vocabulary. */
export type SubtypeIconMap = Readonly<Record<string, ComponentType<IconProps>>>;

const REGISTRY = new Map<EntityType, SubtypeIconMap>();

/**
 * Register (or replace) an entity type's subtype glyphs. Called once, at module
 * load, by the module that OWNS the subtype vocabulary — never by a consumer.
 */
export function registerSubtypeIcons(
  entityType: EntityType,
  icons: SubtypeIconMap,
): void {
  REGISTRY.set(entityType, icons);
}

/**
 * The glyph for a subtype, or `null` when the module registered none for it.
 * A `null` is not a failure — it means "render the entity glyph", which
 * {@link SubtypeIcon} does for you.
 */
export function getSubtypeIcon(
  entityType: EntityType,
  subtype: string | null | undefined,
): ComponentType<IconProps> | null {
  if (!subtype) {
    return null;
  }
  return REGISTRY.get(entityType)?.[subtype] ?? null;
}

export interface SubtypeIconProps {
  /** The owning entity type — also the fallback identity. */
  readonly entityType: EntityType;
  /** The subtype slug from the module's own vocabulary. */
  readonly subtype: string | null | undefined;
  /** Pixel size; defaults to `1em` so the glyph follows the surrounding text. */
  readonly size?: number | string;
  /** Optional accessible name; omit to keep the glyph decorative (the default). */
  readonly title?: string;
  readonly className?: string;
}

/**
 * Render a subtype's glyph, falling back to the entity's identity glyph for an
 * unregistered or custom subtype — so a surface can always show *something*
 * recognisable and never a blank slot.
 *
 * The fallback deliberately renders the accented `EntityIcon` while a registered
 * subtype glyph renders in `currentColor`: the accent belongs to entity identity,
 * and a subtype is subordinate to it.
 */
export function SubtypeIcon({
  entityType,
  subtype,
  size,
  title,
  className,
}: SubtypeIconProps) {
  const Icon = getSubtypeIcon(entityType, subtype);
  if (!Icon) {
    return (
      <EntityIcon
        type={entityType}
        size={size}
        title={title}
        className={className}
      />
    );
  }
  return <Icon size={size} title={title} className={className} />;
}
