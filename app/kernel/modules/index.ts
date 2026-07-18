/**
 * FND-06 Module Registry kernel — public surface.
 *
 * Modules author their manifest and the shell (FND-09) consumes the registry
 * through this barrel. It exposes only the storage-independent contract: the
 * module definition and capability types, the authoring helper, the validation
 * helpers, the typed errors, the immutable registry and its assembly function,
 * and the pure discovery collector. The Vite `import.meta.glob` discovery wrapper
 * lives in `app/modules/discover-modules.ts`, and the FND-09 route-composition
 * adapter in `app/platform/modules` — kept OUT of the kernel so the kernel stays
 * free of Vite, React Router and Cloudflare types (ADR-013 §5, §18).
 */

export type {
  ModuleId,
  ModuleIdentity,
  ModuleDefinition,
  Owned,
  RegisteredRoute,
  RegisteredEntityType,
  RegisteredEntityLinkType,
  RegisteredActivityType,
  RegisteredCommand,
  RegisteredSearchProvider,
  RegisteredSetting,
  RegisteredModule,
} from "./module-definition";

export type {
  ModuleRuntimeContext,
  RouteModuleFile,
  RouteMeta,
  RouteContribution,
  EntityTypeContribution,
  EntityLinkTypeContribution,
  ActivityTypeContribution,
  CommandShortcut,
  CommandHandler,
  CommandContribution,
  SearchQuery,
  SearchResultItem,
  SearchExecutor,
  SearchProviderContribution,
  SettingValueType,
  SettingEnumOption,
  BooleanSettingContribution,
  StringSettingContribution,
  NumberSettingContribution,
  EnumSettingContribution,
  SettingContribution,
} from "./module-capabilities";

export { defineModule } from "./define-module";

export {
  ModuleRegistryError,
  ModuleDefinitionError,
  DuplicateModuleError,
  DuplicateContributionError,
  ReservedActivityTypeError,
  RoutePathConflictError,
  RouteParentError,
  ModuleDiscoveryError,
  type ModuleRegistryErrorCode,
  type ContributionKind,
  type RouteParentReason,
} from "./module-errors";

export {
  MODULE_ID_MAX_LENGTH,
  MODULE_ID_PATTERN,
  QUALIFIED_ID_MAX_LENGTH,
  QUALIFIED_ID_LOCAL_PATTERN,
  ROUTE_PATH_MAX_LENGTH,
  ROUTE_FILE_MAX_LENGTH,
  ROUTE_FILE_EXTENSIONS,
  LABEL_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MAX_COMMAND_KEYWORDS,
  MAX_ENUM_OPTIONS,
  RESERVED_ACTIVITY_TYPES,
  parseModuleId,
  isModuleId,
  validateQualifiedId,
  validateRoutePath,
  validateRouteFile,
} from "./module-validation";

export { type ModuleRegistry, createModuleRegistry } from "./module-registry";

export {
  type ModuleRouteSource,
  validateModuleRoutes,
  validateRouteGraph,
} from "./route-composition";

export {
  type DiscoveredManifestModule,
  MODULE_MANIFEST_EXPORT,
  collectModuleDefinitions,
} from "./module-discovery";
