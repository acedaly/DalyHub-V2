/**
 * PEOPLE-01 People kernel — public surface.
 *
 * Modules and the composition boundary import the People kernel from here. This
 * barrel exposes only the storage-independent contract (identifiers, types,
 * errors, validation, the cursor helpers and the repository interface). The D1
 * adapter is NOT re-exported: code wanting persistence constructs it from
 * `app/platform/storage/d1`, keeping the dependency direction pointing at the
 * contract, not the store (mirrors the entity, diary and note barrels).
 */

export {
  PERSON_ENTITY_TYPE,
  RESERVED_PERSON_ENTITY_TYPES,
  isReservedPersonEntityType,
  PERSON_CREATED,
  PERSON_UPDATED,
  PERSON_ARCHIVED,
  PERSON_RESTORED,
  PERSON_ACTIVITY_TYPES,
  PERSON_LINKED_NOTE,
  PERSON_LINKED_PROJECT,
  PERSON_LINKED_GOAL,
  PERSON_LINKED_AREA,
  PERSON_LINKED_TASK,
  PERSON_LINKED_DIARY,
  PERSON_LINKED_MEETING,
  PERSON_LINK_TYPES,
} from "./person-identifiers";

export {
  PERSON_RELATIONSHIPS,
  CONTACT_METHODS,
  FOLLOW_UP_FREQUENCIES,
} from "./person";

export type {
  Person,
  PersonDetails,
  PersonDetailsInput,
  PersonRelationship,
  ContactMethod,
  FollowUpFrequency,
  CreatePersonInput,
  UpdatePersonInput,
  PersonChangeResult,
  PersonLifecycleOutcome,
  PersonLifecycleResult,
  GetPersonOptions,
  PersonListStatus,
  ListPeopleInput,
  PersonPage,
} from "./person";

export {
  PersonError,
  PersonValidationError,
  PersonNotFoundError,
  PersonConflictError,
  PersonStorageError,
  InvalidPersonCursorError,
  type PersonErrorCode,
  type PersonValidationField,
} from "./person-errors";

export {
  DEFAULT_PEOPLE_PAGE_SIZE,
  MAX_PEOPLE_PAGE_SIZE,
  NAME_MAX_LENGTH,
  PRONOUNS_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  ADDRESS_MAX_LENGTH,
  URL_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  TAG_MAX_LENGTH,
  MAX_TAGS,
  QUERY_MAX_LENGTH,
  PERSON_SCALAR_FIELDS,
  validatePersonTitle,
  validatePersonId,
  validateTags,
  validatePersonDetails,
  validatePeopleLimit,
  validatePersonStatus,
  normaliseQuery,
  type PersonScalarField,
  type ValidatedPersonDetails,
} from "./person-validation";

export {
  PERSON_CURSOR_VERSION,
  encodePersonCursor,
  decodePersonCursor,
  personCursorScopeMatches,
  decodePersonCursorForScope,
  type PersonCursorPosition,
  type PersonCursorScope,
  type DecodedPersonCursor,
} from "./person-cursor";

export type { PersonRepository } from "./person-repository";
