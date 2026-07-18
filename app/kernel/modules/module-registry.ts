/**
 * FND-06 Module Registry kernel — assembly, validation, and the read-only API.
 *
 * `createModuleRegistry` takes the trusted, compiled-in module definitions,
 * validates every manifest and capability descriptor, fails fast on any
 * collision, prepares lookup indexes ONCE, and returns an immutable, read-only
 * registry (ADR-013 §4.4, §15, §16). There is no mutable global service locator,
 * no registration after construction, and no way for a caller to change registry
 * state by mutating a source manifest, a returned array, a nested contribution or
 * a lookup result — every exposed structure is a frozen defensive snapshot.
 *
 * Ordering is deterministic and independent of discovery/filesystem enumeration
 * order: modules are sorted by their optional `order` (those that specify one
 * first, ascending) then by id; each module's contributions keep their authored
 * order. Collision detection runs over that sorted order, so a duplicate failure
 * is deterministic too.
 *
 * Unknown-lookup behaviour is uniform: every `get*` returns `null` when there is
 * no match. Nothing throws for a miss.
 */

import {
  DuplicateContributionError,
  DuplicateModuleError,
  ModuleDefinitionError,
  type ContributionKind,
} from "./module-errors";
import {
  validateCommandContribution,
  validateOptionalOrder,
  validateSettingContribution,
  parseModuleId,
} from "./module-validation";
import {
  validateActivityTypeContribution,
  validateEntityLinkTypeContribution,
  validateEntityTypeContribution,
  validateSearchProviderContribution,
} from "./entity-contribution-validation";
import { validateModuleRoutes } from "./route-composition";
import type { RouteContribution } from "./module-capabilities";
import type {
  ModuleDefinition,
  ModuleId,
  Owned,
  RegisteredActivityType,
  RegisteredCommand,
  RegisteredEntityLinkType,
  RegisteredEntityType,
  RegisteredModule,
  RegisteredRoute,
  RegisteredSearchProvider,
  RegisteredSetting,
} from "./module-definition";

/**
 * The read-only registry API. Every list returns a frozen array in deterministic
 * order; every lookup returns the item or `null`. Nothing mutates registry state.
 */
export interface ModuleRegistry {
  /** All registered modules, in deterministic order. */
  listModules(): readonly RegisteredModule[];
  /** The module with `id`, or null. */
  getModule(id: string): RegisteredModule | null;

  /** All routes across all modules, in deterministic order. */
  listRoutes(): readonly RegisteredRoute[];
  /** The route with `id`, or null. */
  getRoute(id: string): RegisteredRoute | null;

  /** All owned entity types, in deterministic order. */
  listEntityTypes(): readonly RegisteredEntityType[];
  /** The entity type `type`, or null. */
  getEntityType(type: string): RegisteredEntityType | null;

  /** All owned EntityLink types, in deterministic order. */
  listEntityLinkTypes(): readonly RegisteredEntityLinkType[];
  /** The EntityLink type `type`, or null. */
  getEntityLinkType(type: string): RegisteredEntityLinkType | null;

  /** All owned custom Activity types, in deterministic order. */
  listActivityTypes(): readonly RegisteredActivityType[];
  /** The Activity type `type`, or null. */
  getActivityType(type: string): RegisteredActivityType | null;

  /** All commands, in deterministic order. */
  listCommands(): readonly RegisteredCommand[];
  /** The command with `id`, or null. */
  getCommand(id: string): RegisteredCommand | null;

  /** All search providers, in deterministic order. */
  listSearchProviders(): readonly RegisteredSearchProvider[];
  /** The search provider with `id`, or null. */
  getSearchProvider(id: string): RegisteredSearchProvider | null;

  /** All settings, in deterministic order. */
  listSettings(): readonly RegisteredSetting[];
  /** The setting with `key`, or null. */
  getSetting(key: string): RegisteredSetting | null;
}

/** Recursively freeze plain objects and arrays (leaving functions callable). */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/** A validated module before global collision checks and sorting. */
type ValidatedModule = {
  readonly id: ModuleId;
  readonly name: string;
  readonly description: string | null;
  readonly order: number | null;
  /**
   * The module's RAW route descriptors, carried through unchanged. Routes are
   * validated centrally after sorting by the shared authoritative validator
   * (`validateModuleRoutes`), so the runtime registry and the build-time React
   * Router composition apply exactly the same route rules.
   */
  readonly rawRoutes: readonly RouteContribution[] | undefined;
  readonly entityTypes: readonly RegisteredEntityType[];
  readonly entityLinkTypes: readonly RegisteredEntityLinkType[];
  readonly activityTypes: readonly RegisteredActivityType[];
  readonly commands: readonly RegisteredCommand[];
  readonly searchProviders: readonly RegisteredSearchProvider[];
  readonly settings: readonly RegisteredSetting[];
};

/** Validate one array of contributions, attaching the owning module id. */
function own<TIn, TOut extends object>(
  items: readonly TIn[] | undefined,
  moduleId: ModuleId,
  validate: (item: TIn, moduleId: string, index: number) => TOut,
): Owned<TOut>[] {
  if (items === undefined) {
    return [];
  }
  return items.map((item, index) => ({
    ...validate(item, moduleId, index),
    moduleId,
  }));
}

/** Validate a single module definition into an ownership-carrying intermediate. */
function validateDefinition(definition: ModuleDefinition): ValidatedModule {
  if (typeof definition !== "object" || definition === null) {
    throw new ModuleDefinitionError("definition", "must be an object");
  }
  const id = parseModuleId(definition.id);

  if (
    typeof definition.name !== "string" ||
    definition.name.trim().length === 0
  ) {
    throw new ModuleDefinitionError("name", "must be a non-empty string", id);
  }
  const name = definition.name.trim();
  let description: string | null = null;
  if (definition.description !== undefined) {
    if (
      typeof definition.description !== "string" ||
      definition.description.trim().length === 0
    ) {
      throw new ModuleDefinitionError(
        "description",
        "must be a non-empty string when provided",
        id,
      );
    }
    description = definition.description.trim();
  }
  const order = validateOptionalOrder(definition.order, "order", id) ?? null;

  return {
    id,
    name,
    description,
    order,
    // Routes are validated centrally (post-sort) by `validateModuleRoutes`, the
    // single authoritative route validator shared with build-time composition.
    rawRoutes: definition.routes,
    entityTypes: own(
      definition.entityTypes,
      id,
      validateEntityTypeContribution,
    ),
    entityLinkTypes: own(
      definition.entityLinkTypes,
      id,
      validateEntityLinkTypeContribution,
    ),
    activityTypes: own(
      definition.activityTypes,
      id,
      validateActivityTypeContribution,
    ),
    commands: own(definition.commands, id, validateCommandContribution),
    searchProviders: own(
      definition.searchProviders,
      id,
      validateSearchProviderContribution,
    ),
    settings: own(definition.settings, id, validateSettingContribution),
  };
}

/** Deterministic module comparator: ordered modules first (ascending), then by id. */
function compareModules(a: ValidatedModule, b: ValidatedModule): number {
  if (a.order !== null && b.order !== null) {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
  } else if (a.order !== null) {
    return -1;
  } else if (b.order !== null) {
    return 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Register a contribution into a lookup map, failing fast on a duplicate id. */
function indexUnique<T extends { readonly moduleId: ModuleId }>(
  map: Map<string, T>,
  key: string,
  value: T,
  kind: ContributionKind,
): void {
  const existing = map.get(key);
  if (existing !== undefined) {
    throw new DuplicateContributionError(
      kind,
      key,
      existing.moduleId,
      value.moduleId,
    );
  }
  map.set(key, value);
}

/** Assemble an immutable, validated module registry from trusted definitions. */
export function createModuleRegistry(
  definitions: readonly ModuleDefinition[],
): ModuleRegistry {
  // 1. Validate each definition and attach ownership.
  const validated = definitions.map(validateDefinition);

  // 2. Reject duplicate module ids.
  const moduleIds = new Set<string>();
  for (const module of validated) {
    if (moduleIds.has(module.id)) {
      throw new DuplicateModuleError(module.id);
    }
    moduleIds.add(module.id);
  }

  // 3. Sort modules deterministically (independent of discovery order).
  const sorted = [...validated].sort(compareModules);

  // 4a. Routes: validate through the SHARED authoritative validator (the same
  //     one build-time React Router composition uses). It validates every
  //     descriptor, rejects duplicate route ids, and validates the whole route
  //     graph (parents, cycles, path conflicts) in this deterministic order.
  const allRoutes = validateModuleRoutes(
    sorted.map((module) => ({ moduleId: module.id, routes: module.rawRoutes })),
  );
  const routeMap = new Map<string, RegisteredRoute>(
    allRoutes.map((route) => [route.id, route]),
  );
  const routesByModule = new Map<string, RegisteredRoute[]>();
  for (const route of allRoutes) {
    const list = routesByModule.get(route.moduleId);
    if (list === undefined) {
      routesByModule.set(route.moduleId, [route]);
    } else {
      list.push(route);
    }
  }

  // 4b. Flatten the other contributions in sorted order and detect id collisions
  //     across ALL modules.
  const entityTypeMap = new Map<string, RegisteredEntityType>();
  const linkTypeMap = new Map<string, RegisteredEntityLinkType>();
  const activityTypeMap = new Map<string, RegisteredActivityType>();
  const commandMap = new Map<string, RegisteredCommand>();
  const searchProviderMap = new Map<string, RegisteredSearchProvider>();
  const settingMap = new Map<string, RegisteredSetting>();

  const allEntityTypes: RegisteredEntityType[] = [];
  const allLinkTypes: RegisteredEntityLinkType[] = [];
  const allActivityTypes: RegisteredActivityType[] = [];
  const allCommands: RegisteredCommand[] = [];
  const allSearchProviders: RegisteredSearchProvider[] = [];
  const allSettings: RegisteredSetting[] = [];

  for (const module of sorted) {
    for (const entityType of module.entityTypes) {
      indexUnique(entityTypeMap, entityType.type, entityType, "entity_type");
      allEntityTypes.push(entityType);
    }
    for (const linkType of module.entityLinkTypes) {
      indexUnique(linkTypeMap, linkType.type, linkType, "entity_link_type");
      allLinkTypes.push(linkType);
    }
    for (const activityType of module.activityTypes) {
      indexUnique(
        activityTypeMap,
        activityType.type,
        activityType,
        "activity_type",
      );
      allActivityTypes.push(activityType);
    }
    for (const command of module.commands) {
      indexUnique(commandMap, command.id, command, "command");
      allCommands.push(command);
    }
    for (const provider of module.searchProviders) {
      indexUnique(searchProviderMap, provider.id, provider, "search_provider");
      allSearchProviders.push(provider);
    }
    for (const setting of module.settings) {
      indexUnique(settingMap, setting.key, setting, "setting");
      allSettings.push(setting);
    }
  }

  // 5. (Route parents and path conflicts were validated in step 4a by the shared
  //    authoritative validator.)

  // 6. Build frozen per-module snapshots and the module lookup.
  const moduleMap = new Map<string, RegisteredModule>();
  const allModules: RegisteredModule[] = sorted.map((module) => {
    const registered: RegisteredModule = deepFreeze({
      id: module.id,
      name: module.name,
      description: module.description,
      order: module.order,
      routes: Object.freeze([...(routesByModule.get(module.id) ?? [])]),
      entityTypes: Object.freeze([...module.entityTypes]),
      entityLinkTypes: Object.freeze([...module.entityLinkTypes]),
      activityTypes: Object.freeze([...module.activityTypes]),
      commands: Object.freeze([...module.commands]),
      searchProviders: Object.freeze([...module.searchProviders]),
      settings: Object.freeze([...module.settings]),
    });
    moduleMap.set(module.id, registered);
    return registered;
  });

  // 7. Freeze the flat snapshots exposed by list* (contribution objects were
  //    already fresh, per-descriptor copies from validation; freeze them so a
  //    caller cannot mutate a returned item).
  const frozenModules = Object.freeze(allModules);
  const frozenRoutes = deepFreeze(Object.freeze(allRoutes));
  const frozenEntityTypes = deepFreeze(Object.freeze(allEntityTypes));
  const frozenLinkTypes = deepFreeze(Object.freeze(allLinkTypes));
  const frozenActivityTypes = deepFreeze(Object.freeze(allActivityTypes));
  const frozenCommands = deepFreeze(Object.freeze(allCommands));
  const frozenSearchProviders = deepFreeze(Object.freeze(allSearchProviders));
  const frozenSettings = deepFreeze(Object.freeze(allSettings));

  const registry: ModuleRegistry = {
    listModules: () => frozenModules,
    getModule: (id) => moduleMap.get(id) ?? null,
    listRoutes: () => frozenRoutes,
    getRoute: (id) => routeMap.get(id) ?? null,
    listEntityTypes: () => frozenEntityTypes,
    getEntityType: (type) => entityTypeMap.get(type) ?? null,
    listEntityLinkTypes: () => frozenLinkTypes,
    getEntityLinkType: (type) => linkTypeMap.get(type) ?? null,
    listActivityTypes: () => frozenActivityTypes,
    getActivityType: (type) => activityTypeMap.get(type) ?? null,
    listCommands: () => frozenCommands,
    getCommand: (id) => commandMap.get(id) ?? null,
    listSearchProviders: () => frozenSearchProviders,
    getSearchProvider: (id) => searchProviderMap.get(id) ?? null,
    listSettings: () => frozenSettings,
    getSetting: (key) => settingMap.get(key) ?? null,
  };
  return Object.freeze(registry);
}
