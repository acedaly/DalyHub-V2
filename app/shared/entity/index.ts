/**
 * PX-02 — public entry for the Entity Identity system.
 *
 * One icon + one accent per entity type (DESIGN_SYSTEM.md → Foundations, Entity
 * identity). Consume `ENTITY_IDENTITY`/`getEntityIdentity` for the mapping and
 * `EntityIcon` to render an entity's identity glyph.
 */

export {
  ENTITY_TYPES,
  ENTITY_IDENTITY,
  entityAccentVar,
  entityAccent,
  isEntityType,
  getEntityIdentity,
  type EntityType,
  type EntityIdentity,
} from "./identity";

export { EntityIcon, type EntityIconProps } from "./EntityIcon";
