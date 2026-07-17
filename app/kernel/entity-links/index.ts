/**
 * FND-04 EntityLinks kernel — public surface.
 *
 * Modules import the EntityLink kernel from here. This barrel intentionally
 * exposes only the storage-independent contract (types, errors, the repository
 * interface, validation and cursor helpers). The D1 adapter is NOT re-exported:
 * code wanting persistence constructs the adapter from `app/platform/storage/d1`,
 * keeping the dependency direction pointing at the contract, not the store
 * (mirrors the entity kernel barrel, ADR-009/ADR-011).
 */

export type {
  EntityLinkType,
  EntityLinkRecord,
  EntityLinkDirection,
  EntityLinkDirectionFilter,
  EntityLinkView,
  CreateEntityLinkInput,
  CreateEntityLinkOutcome,
  CreateEntityLinkResult,
  GetEntityLinkOptions,
  ListEntityLinksInput,
  EntityLinkPage,
  EntityLinkLifecycleOutcome,
  EntityLinkLifecycleResult,
} from "./entity-link";

export {
  EntityLinkError,
  EntityLinkValidationError,
  EntityLinkEndpointNotFoundError,
  EntityLinkNotFoundError,
  InvalidEntityLinkCursorError,
  EntityLinkInvalidStateError,
  EntityLinkConflictError,
  EntityLinkStorageError,
  type EntityLinkErrorCode,
  type EntityLinkValidationField,
} from "./entity-link-errors";

export {
  ENTITY_LINK_ID_MAX_LENGTH,
  ENTITY_LINK_TYPE_MAX_LENGTH,
  ENTITY_LINK_TYPE_PATTERN,
  DEFAULT_LINK_PAGE_SIZE,
  MAX_LINK_PAGE_SIZE,
  parseEntityLinkType,
  isEntityLinkType,
} from "./entity-link-validation";

export type {
  EntityLinkCursorPosition,
  EntityLinkCursorScope,
} from "./entity-link-cursor";

export { ENTITY_LINK_CURSOR_VERSION } from "./entity-link-cursor";

export {
  type EntityLinkRepository,
  type Clock,
  type IdGenerator,
  systemClock,
  secureIdGenerator,
} from "./entity-link-repository";
