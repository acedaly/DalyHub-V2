/**
 * V2.10 LIFE-01 Obligations kernel — the stable identifiers.
 *
 * The entity type, the Activity event types and the ONE reserved EntityLink
 * type. These are STORED VALUES: renaming one is a data migration, not a
 * refactor.
 *
 * The Activity vocabulary is generic (`obligation.*`) rather than
 * `asset.obligation_*`, and it had to become so in LIFE-01 rather than LIFE-03
 * as the roadmap first placed it: the repository that writes these events is
 * this release's, and an event named after an Asset cannot be written about an
 * obligation that has none. The historical `asset.obligation_*` events stay in
 * the stream and keep their descriptors — an append-only log is not rewritten
 * to match a new vocabulary (ADR-012).
 *
 * Every obligation event carries the OBLIGATION as a subject and, where there
 * is one, its SUBJECT ENTITY as a second — the multi-anchor shape
 * `asset.task_linked` already uses — so the Asset's timeline keeps showing what
 * happened to its obligations without a bespoke read.
 */

/** The entity type. `entities.type` is an open validated string. */
export const OBLIGATION_ENTITY_TYPE = "obligation";

/**
 * The obligation type is RESERVED from the generic entity repository, exactly
 * as `asset` is: an obligation can never exist without its detail row, so only
 * the authoritative repository may create one.
 */
export const RESERVED_OBLIGATION_ENTITY_TYPES: ReadonlySet<string> = new Set([
  OBLIGATION_ENTITY_TYPE,
]);

/** True when `type` is the reserved `obligation` entity type. */
export function isReservedObligationEntityType(type: string): boolean {
  return RESERVED_OBLIGATION_ENTITY_TYPES.has(type);
}

export const OBLIGATION_CREATED = "obligation.created";
export const OBLIGATION_RESCHEDULED = "obligation.rescheduled";
export const OBLIGATION_COMPLETED = "obligation.completed";
export const OBLIGATION_DISMISSED = "obligation.dismissed";
export const OBLIGATION_REOPENED = "obligation.reopened";
export const OBLIGATION_TASK_LINKED = "obligation.task_linked";
export const OBLIGATION_DELETED = "obligation.deleted";

export const OBLIGATION_ACTIVITY_TYPES: readonly string[] = [
  OBLIGATION_CREATED,
  OBLIGATION_RESCHEDULED,
  OBLIGATION_COMPLETED,
  OBLIGATION_DISMISSED,
  OBLIGATION_REOPENED,
  OBLIGATION_TASK_LINKED,
  OBLIGATION_DELETED,
];

/**
 * The obligation's subject, as the kernel's own relationship primitive.
 *
 * RESERVED: the generic link picker and the generic unlink path refuse it,
 * because the `obligation_details.subject_entity_id` foreign key is the
 * authority and this link is its projection (ADR-118 decision 1). A second
 * writer is exactly how two representations of one relationship come to
 * disagree.
 */
export const OBLIGATION_SUBJECT_LINK = "obligation.subject";

/**
 * The link id a subject relationship gets, derived from the obligation's own
 * id. Deterministic on purpose: migration 0050 writes the same ids this
 * function produces, so a migrated relationship and a newly created one are
 * indistinguishable, and a repair is idempotent.
 */
export function obligationSubjectLinkId(obligationId: string): string {
  return `obl-subject-${obligationId}`;
}
