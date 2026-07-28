/**
 * PEOPLE-03 Relationship intelligence kernel — public surface.
 *
 * Modules and the composition boundary import the derived relationship model and
 * its read-only facts contract from here. Like the other kernel barrels it exposes
 * only storage-independent shapes and pure functions; the D1 facts adapter is
 * constructed from `app/platform/storage/d1`.
 *
 * This kernel is deliberately named `relationships`, not `people-signals`: it is
 * the reusable relationship graph the roadmap's later modules (Email, Calendar,
 * Communications, CRM-shaped features) contribute to and read from. A new
 * interaction source joins by declaring its Activity types — see
 * `INTERACTION_ACTIVITY_TYPES`.
 */

export {
  RECENTLY_CONNECTED_WITHIN_DAYS,
  EXTENDED_ABSENCE_AFTER_DAYS,
  FOLLOW_UP_CADENCE_DAYS,
  OBSERVED_RHYTHM_MULTIPLIER,
  MIN_DAYS_FOR_OBSERVED_RHYTHM,
  INTERACTION_ACTIVITY_TYPES,
  RELATIONSHIP_STATES,
  RELATIONSHIP_REASON_CODES,
  EMPTY_RELATIONSHIP_RECORD_COUNTS,
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  relationshipStateLabel,
  relationshipDaysBetween,
} from "./person-relationship";

export type {
  RelationshipTone,
  RelationshipState,
  RelationshipReasonCode,
  ExpectedIntervalSource,
  RelationshipRecordCounts,
  PersonRelationshipFacts,
  RelationshipEvaluationContext,
  RelationshipReason,
  RelationshipCadence,
  RelationshipSummary,
  PersonRelationship,
} from "./person-relationship";

export {
  RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
  MAX_RELATIONSHIP_FACTS_BATCH,
} from "./relationship-repository";
export type { RelationshipRepository } from "./relationship-repository";
