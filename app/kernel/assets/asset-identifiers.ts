/**
 * ASSET-01 Assets kernel — the shared, stable domain identifiers.
 *
 * An Asset is a first-class DalyHub record — a thing of value, physical, digital
 * or financial. It is an ordinary `entities` row of type `asset` PLUS an
 * `asset_details` row owning the structured Asset fields; Assets are NOT part of
 * the Area → Goal → Project → Task spine (AGENTS.md §4) and add no `spine_records`
 * row. They attach across the spine through EntityLinks (ADR-002 / ADR-047).
 *
 * This module is intentionally dependency-light: plain string constants, readonly
 * sets and precise string-literal unions, importing no D1, Cloudflare, React or
 * storage types. Nothing here is a database enum — every identifier stays an
 * ordinary validated string (ADR-009/011/012). Assets simply RESERVES the `asset`
 * entity type for its own authoritative repository, exactly as Diary reserves
 * `diary` and People reserves `person`.
 */

/* -------------------------------------------------------------------------- */
/* Entity type                                                                */
/* -------------------------------------------------------------------------- */

/** The Asset entity type: a first-class record for a thing of value. */
export const ASSET_ENTITY_TYPE = "asset";

/**
 * The entity types RESERVED for the `AssetRepository`. The generic Entity
 * repository must refuse to CREATE a record of one of these types (an Asset can
 * never exist without its `asset_details` row); only the `AssetRepository`
 * creates one, atomically. Rename, soft-delete and restore of an `asset` entity
 * stay generic (mirrors People's / Diary's create-only reservation).
 */
export const RESERVED_ASSET_ENTITY_TYPES: ReadonlySet<string> = new Set([
  ASSET_ENTITY_TYPE,
]);

/** True when `type` is the reserved `asset` entity type. */
export function isReservedAssetEntityType(type: string): boolean {
  return RESERVED_ASSET_ENTITY_TYPES.has(type);
}

/* -------------------------------------------------------------------------- */
/* Activity event types                                                       */
/* -------------------------------------------------------------------------- */

/** Activity event appended when an Asset is created. */
export const ASSET_CREATED = "asset.created";
/** Activity event appended when an Asset's structured details change. */
export const ASSET_UPDATED = "asset.updated";
/** Activity event appended when an Asset's real-world status changes. */
export const ASSET_STATUS_CHANGED = "asset.status_changed";
/** Activity event appended when an Asset is archived (a reversible put-away). */
export const ASSET_ARCHIVED = "asset.archived";
/** Activity event appended when an archived Asset is restored to active. */
export const ASSET_RESTORED = "asset.restored";
/** Activity event appended when an Asset is marked disposed (status → disposed). */
export const ASSET_DISPOSED = "asset.disposed";

/** Every Asset-owned Activity event type, in a stable order. */
export const ASSET_ACTIVITY_TYPES = [
  ASSET_CREATED,
  ASSET_UPDATED,
  ASSET_STATUS_CHANGED,
  ASSET_ARCHIVED,
  ASSET_RESTORED,
  ASSET_DISPOSED,
] as const;

/* -------------------------------------------------------------------------- */
/* EntityLink types (Assets ↔ the rest of the system)                         */
/* -------------------------------------------------------------------------- */

/**
 * The structural relationship link types Assets owns. Direction is always
 * asset → related-record (the Asset is the link's `source`). These are open
 * validated strings — future modules add their own link types with no schema
 * migration. Registered on the module manifest so the Timeline/Links surfaces can
 * label them. Ad-hoc "relates to" links use the universal `link.related` type.
 */
export const ASSET_LINKED_AREA = "asset.linked_area";
export const ASSET_LINKED_GOAL = "asset.linked_goal";
export const ASSET_LINKED_PROJECT = "asset.linked_project";
export const ASSET_LINKED_TASK = "asset.linked_task";
export const ASSET_LINKED_NOTE = "asset.linked_note";
export const ASSET_LINKED_DIARY = "asset.linked_diary";
export const ASSET_LINKED_MEETING = "asset.linked_meeting";
export const ASSET_LINKED_PERSON = "asset.linked_person";
export const ASSET_LINKED_ASSET = "asset.linked_asset";

/** Every Asset-owned EntityLink type, in a stable order. */
export const ASSET_LINK_TYPES = [
  ASSET_LINKED_AREA,
  ASSET_LINKED_GOAL,
  ASSET_LINKED_PROJECT,
  ASSET_LINKED_TASK,
  ASSET_LINKED_NOTE,
  ASSET_LINKED_DIARY,
  ASSET_LINKED_MEETING,
  ASSET_LINKED_PERSON,
  ASSET_LINKED_ASSET,
] as const;
