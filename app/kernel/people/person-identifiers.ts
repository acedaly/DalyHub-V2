/**
 * PEOPLE-01 People kernel — the shared, stable domain identifiers.
 *
 * People are a first-class supporting entity (AGENTS.md §5) — real human
 * relationships, "care, not a CRM". A Person is an ordinary `entities` row of
 * type `person` PLUS a `person_details` row owning the structured relationship
 * fields; People are NOT part of the Area → Goal → Project → Task spine
 * (AGENTS.md §4) and add no `spine_records` row. They attach across the spine
 * through EntityLinks (ADR-002).
 *
 * This module is intentionally dependency-light: plain string constants, readonly
 * sets and precise string-literal unions, importing no D1, Cloudflare, React or
 * storage types. Nothing here is a database enum — every identifier stays an
 * ordinary validated string (ADR-009/011/012), so the open Entity / EntityLink /
 * Activity contracts are unchanged. People simply RESERVES the `person` entity
 * type for its own authoritative repository, exactly as Diary reserves `diary`.
 */

/* -------------------------------------------------------------------------- */
/* Entity type                                                                */
/* -------------------------------------------------------------------------- */

/** The Person entity type: a real human relationship. */
export const PERSON_ENTITY_TYPE = "person";

/**
 * The entity types RESERVED for the `PersonRepository`. The generic Entity
 * repository must refuse to CREATE a record of one of these types (a Person can
 * never exist without its `person_details` row); only the `PersonRepository`
 * creates one, atomically. Rename, soft-delete and restore of a `person` entity
 * stay generic (mirrors Diary's create-only reservation, ADR-041).
 */
export const RESERVED_PERSON_ENTITY_TYPES: ReadonlySet<string> = new Set([
  PERSON_ENTITY_TYPE,
]);

/** True when `type` is the reserved `person` entity type. */
export function isReservedPersonEntityType(type: string): boolean {
  return RESERVED_PERSON_ENTITY_TYPES.has(type);
}

/* -------------------------------------------------------------------------- */
/* Activity event types                                                       */
/* -------------------------------------------------------------------------- */

/** Activity event appended when a Person is created. */
export const PERSON_CREATED = "person.created";
/** Activity event appended when a Person's structured details change. */
export const PERSON_UPDATED = "person.updated";
/** Activity event appended when a Person is archived (a reversible put-away). */
export const PERSON_ARCHIVED = "person.archived";
/** Activity event appended when an archived Person is restored to active. */
export const PERSON_RESTORED = "person.restored";

/** Every People-owned Activity event type, in a stable order. */
export const PERSON_ACTIVITY_TYPES = [
  PERSON_CREATED,
  PERSON_UPDATED,
  PERSON_ARCHIVED,
  PERSON_RESTORED,
] as const;

/* -------------------------------------------------------------------------- */
/* EntityLink types (People ↔ the rest of the system)                         */
/* -------------------------------------------------------------------------- */

/**
 * The structural relationship link types People owns. Direction is always
 * person → related-record (the Person is the link's `source`). These are open
 * validated strings — future modules (Meetings, Organisations, Calls, Emails)
 * add their own link types with no schema migration. Registered on the module
 * manifest so the future Timeline/Links surfaces can label them.
 */
export const PERSON_LINKED_NOTE = "person.linked_note";
export const PERSON_LINKED_PROJECT = "person.linked_project";
export const PERSON_LINKED_GOAL = "person.linked_goal";
export const PERSON_LINKED_AREA = "person.linked_area";
export const PERSON_LINKED_TASK = "person.linked_task";
export const PERSON_LINKED_DIARY = "person.linked_diary";
export const PERSON_LINKED_MEETING = "person.linked_meeting";

/** Every People-owned EntityLink type, in a stable order. */
export const PERSON_LINK_TYPES = [
  PERSON_LINKED_NOTE,
  PERSON_LINKED_PROJECT,
  PERSON_LINKED_GOAL,
  PERSON_LINKED_AREA,
  PERSON_LINKED_TASK,
  PERSON_LINKED_DIARY,
  PERSON_LINKED_MEETING,
] as const;
