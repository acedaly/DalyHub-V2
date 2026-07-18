/**
 * FND-06 Module Registry kernel — domain errors.
 *
 * Registry construction and manifest validation signal failure with these
 * explicit, typed errors rather than leaking internals. Every message is safe to
 * surface to a developer: it contains only trusted, developer-authored values
 * (module ids, capability ids, type identifiers, field names) and NEVER an
 * environment value, database path, secret or request datum (AGENTS.md §17). The
 * registry is assembled from trusted, compiled-in manifests, so there is no
 * untrusted input to leak in the first place — but the discipline is kept anyway.
 *
 * See ADR-013 (Module Registry Contract and Discovery), which concretises
 * ADR-007 (Module Registry).
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type ModuleRegistryErrorCode =
  | "invalid_definition"
  | "duplicate_module"
  | "duplicate_contribution"
  | "reserved_activity_type"
  | "route_path_conflict"
  | "route_parent"
  | "discovery_shape";

/** Base class for every module registry error. */
export abstract class ModuleRegistryError extends Error {
  abstract readonly code: ModuleRegistryErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * A module definition (or one of its capability descriptors) failed
 * validation: a malformed module id, an empty label, a capability id that does
 * not belong to the declaring module, an invalid route path, a setting default
 * that does not match its declared type, and so on. `moduleId` is the offending
 * module when known (it may be unknown if the id itself is what failed).
 */
export class ModuleDefinitionError extends ModuleRegistryError {
  readonly code = "invalid_definition" as const;
  readonly moduleId: string | null;
  readonly field: string;

  constructor(field: string, message: string, moduleId: string | null = null) {
    super(
      moduleId === null
        ? `Invalid module definition (${field}): ${message}`
        : `Invalid module "${moduleId}" (${field}): ${message}`,
    );
    this.moduleId = moduleId;
    this.field = field;
  }
}

/** Two modules declared the same module id. Registry construction fails fast. */
export class DuplicateModuleError extends ModuleRegistryError {
  readonly code = "duplicate_module" as const;
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(`Duplicate module id "${moduleId}"`);
    this.moduleId = moduleId;
  }
}

/** The kind of contribution a duplicate-id collision was found in. */
export type ContributionKind =
  | "route"
  | "entity_type"
  | "entity_link_type"
  | "activity_type"
  | "command"
  | "search_provider"
  | "setting";

/**
 * Two contributions claimed the same stable identifier — a route id, an entity
 * type, a link type, an activity type, a command id, a search-provider id or a
 * setting key — whether within one module or across two. The registry never
 * silently accepts the first or last; it fails and names both owners.
 */
export class DuplicateContributionError extends ModuleRegistryError {
  readonly code = "duplicate_contribution" as const;
  readonly kind: ContributionKind;
  readonly id: string;
  readonly firstModuleId: string;
  readonly secondModuleId: string;

  constructor(
    kind: ContributionKind,
    id: string,
    firstModuleId: string,
    secondModuleId: string,
  ) {
    super(
      `Duplicate ${kind} "${id}" declared by modules "${firstModuleId}" and "${secondModuleId}"`,
    );
    this.kind = kind;
    this.id = id;
    this.firstModuleId = firstModuleId;
    this.secondModuleId = secondModuleId;
  }
}

/**
 * A module tried to claim an Activity event type that the kernel reserves for
 * its own lifecycle events (e.g. `entity.created`, `entity_link.unlinked`).
 * Reserved types are kernel-owned; modules may not register them.
 */
export class ReservedActivityTypeError extends ModuleRegistryError {
  readonly code = "reserved_activity_type" as const;
  readonly moduleId: string;
  readonly type: string;

  constructor(moduleId: string, type: string) {
    super(
      `Module "${moduleId}" may not claim the kernel-reserved activity type "${type}"`,
    );
    this.moduleId = moduleId;
    this.type = type;
  }
}

/**
 * Two module-owned routes resolve to the same path under the same effective
 * parent — an ambiguous composition the shell could not resolve deterministically.
 */
export class RoutePathConflictError extends ModuleRegistryError {
  readonly code = "route_path_conflict" as const;
  readonly path: string;
  readonly parentId: string | null;
  readonly firstRouteId: string;
  readonly secondRouteId: string;

  constructor(
    path: string,
    parentId: string | null,
    firstRouteId: string,
    secondRouteId: string,
  ) {
    const where =
      parentId === null ? "at the root" : `under parent "${parentId}"`;
    super(
      `Conflicting route path "${path}" ${where}: declared by routes "${firstRouteId}" and "${secondRouteId}"`,
    );
    this.path = path;
    this.parentId = parentId;
    this.firstRouteId = firstRouteId;
    this.secondRouteId = secondRouteId;
  }
}

/** Why a route's parent reference is invalid. */
export type RouteParentReason =
  "unresolved" | "cross_module" | "self" | "cycle" | "index_parent";

/**
 * A route named a `parentId` that cannot be safely resolved: it references no
 * known route (`unresolved`), it points at a route owned by a different module
 * without that being explicitly supported (`cross_module`), a route named itself
 * as its own parent (`self`), its parent chain forms a cycle that never reaches a
 * root (`cycle`) — which would leave the routes un-composable (no root node) and
 * silently dropped from the tree — or it nests under an INDEX route
 * (`index_parent`), which renders at its parent's path and can never have
 * children.
 */
export class RouteParentError extends ModuleRegistryError {
  readonly code = "route_parent" as const;
  readonly routeId: string;
  readonly parentId: string;
  readonly reason: RouteParentReason;

  constructor(routeId: string, parentId: string, reason: RouteParentReason) {
    const detail =
      reason === "unresolved"
        ? `references unknown parent route "${parentId}"`
        : reason === "cross_module"
          ? `references parent route "${parentId}" owned by another module`
          : reason === "cycle"
            ? `is part of a parent cycle (via "${parentId}") that never reaches a root`
            : reason === "index_parent"
              ? `nests under index route "${parentId}", which cannot have children`
              : `cannot be its own parent`;
    super(`Route "${routeId}" ${detail}`);
    this.routeId = routeId;
    this.parentId = parentId;
    this.reason = reason;
  }
}

/**
 * A discovered manifest module did not expose its definition through the
 * documented export convention (a single default export whose value is a module
 * definition object). The module path is named so the author can find it.
 */
export class ModuleDiscoveryError extends ModuleRegistryError {
  readonly code = "discovery_shape" as const;
  readonly modulePath: string;

  constructor(modulePath: string, message: string) {
    super(`Malformed module manifest at "${modulePath}": ${message}`);
    this.modulePath = modulePath;
  }
}
