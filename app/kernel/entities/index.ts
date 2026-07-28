/**
 * FND-02 Data kernel — public entity surface.
 *
 * Modules import the entity kernel from here. This barrel intentionally exposes
 * only the storage-independent contract (types, errors, the repository
 * interface and its injectable seams). The D1 adapter is NOT re-exported: code
 * wanting persistence constructs the adapter from `app/platform/storage/d1`,
 * keeping the dependency direction pointing at the contract, not the store.
 */

export type {
  EntityType,
  EntityRecord,
  CreateEntityInput,
  UpdateEntityInput,
  GetEntityOptions,
  ScopedListEntitiesInput,
  EntityPage,
  LifecycleOutcome,
  LifecycleResult,
} from "./entity";

export {
  EntityError,
  EntityValidationError,
  EntityNotFoundError,
  InvalidCursorError,
  InvalidStateTransitionError,
  ReservedEntityTypeError,
  EntityStorageError,
  type EntityErrorCode,
  type EntityValidationField,
} from "./entity-errors";

export {
  TITLE_MAX_LENGTH,
  ENTITY_TYPE_MAX_LENGTH,
  ID_MAX_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ENTITY_TYPE_PATTERN,
  validateEntityType,
  // Exposed for read-only cross-module projections that take already-authorised
  // entity ids (e.g. the PEOPLE-03 relationship-facts repository) and must reject a
  // malformed id at the boundary rather than binding it into a query.
  validateEntityId,
} from "./entity-validation";

export type { CursorPosition } from "./entity-cursor";

export {
  type EntityRepository,
  type Clock,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "./entity-repository";
