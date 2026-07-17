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
} from "./entity-validation";

export type { CursorPosition } from "./entity-cursor";

export {
  type EntityRepository,
  type Clock,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "./entity-repository";
