/**
 * FND-05 Activity kernel — public surface.
 *
 * Modules import the Activity kernel from here. This barrel intentionally exposes
 * only the storage-independent contract (types, errors, validation, the cursor
 * helpers, the read repository interface and the storage-independent recording
 * seam). The D1 adapter and the atomic recording coordinator are NOT re-exported:
 * code wanting persistence constructs the read adapter from
 * `app/platform/storage/d1`, and only the D1 mutation repositories use the
 * recording coordinator — keeping the dependency direction pointing at the
 * contract, not the store (mirrors the entity and entity-link barrels).
 */

export type {
  ActivityActorType,
  ActivityActor,
  ActivityType,
  ActivitySubjectRole,
  ActivitySubject,
  JsonValue,
  ActivityPayload,
  ActivityRecord,
  ListWorkspaceActivityInput,
  ListEntityActivityInput,
  ActivityPage,
} from "./activity";

export {
  ActivityError,
  ActivityValidationError,
  ActivityNotFoundError,
  ActivitySubjectUnavailableError,
  InvalidActivityCursorError,
  ActivityPayloadError,
  ActivityConflictError,
  ActivityStorageError,
  type ActivityErrorCode,
  type ActivityValidationField,
} from "./activity-errors";

export {
  ACTIVITY_ID_MAX_LENGTH,
  ACTIVITY_TYPE_MAX_LENGTH,
  ACTOR_TYPE_MAX_LENGTH,
  ACTOR_ID_MAX_LENGTH,
  SUBJECT_ENTITY_ID_MAX_LENGTH,
  SUBJECT_ROLE_MAX_LENGTH,
  MIN_SUBJECTS,
  MAX_SUBJECTS,
  PAYLOAD_MAX_BYTES,
  PAYLOAD_MAX_DEPTH,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  MAX_ACTIVITY_PAGE_SIZE,
  ACTIVITY_IDENTIFIER_PATTERN,
  parseActivityType,
  isActivityType,
  parseActorType,
  validateActorId,
  validateActor,
  parseSubjectRole,
  validateSubjects,
  validateActivityId,
  validateSubjectEntityId,
  validateActivityPayload,
  serializeActivityPayload,
  parseActivityPayload,
  validateActivityLimit,
  validateOptionalActivityType,
} from "./activity-validation";

export type {
  ActivityCursorScope,
  ActivityCursorScopeKind,
  ActivityCursorPosition,
  DecodedActivityCursor,
} from "./activity-cursor";

export {
  ACTIVITY_CURSOR_VERSION,
  encodeActivityCursor,
  decodeActivityCursor,
  decodeActivityCursorForScope,
  activityCursorScopeMatches,
} from "./activity-cursor";

export {
  type ActivityRepository,
  type Clock,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "./activity-repository";

export {
  type ActivityActorContext,
  type NewActivityEvent,
  type ActivityWriteModel,
  SYSTEM_ACTOR,
  createActivityActorContext,
  createSystemActorContext,
  buildActivityWriteModel,
} from "./activity-recorder";
