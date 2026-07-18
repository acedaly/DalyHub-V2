/**
 * FND-06/FND-09 Module Registry kernel — authoritative route composition.
 *
 * This is the SINGLE source of truth for turning a set of per-module route
 * contributions into a validated, ownership-carrying flat route list. Both paths
 * that need a validated route list share it, so there is exactly one set of route
 * rules and no drifting second validator (ADR-013 §16, ADR-016 §5.10):
 *
 *   - runtime module registration (`createModuleRegistry`), and
 *   - build-time React Router composition (`composeModuleRouteConfig`, driving
 *     the real `app/routes.ts`).
 *
 * It is pure and storage-independent: it reads the raw, declarative descriptors,
 * validates the owning module id (`parseModuleId`) and every descriptor
 * (`validateRouteContribution`), rejects duplicate route ids, and validates the
 * whole route graph (parent resolution, cross-module/self/cyclic parents and
 * path conflicts). It throws a typed `ModuleRegistryError` on any violation and
 * never loads a route module's page component.
 */

import {
  DuplicateContributionError,
  RoutePathConflictError,
  RouteParentError,
} from "./module-errors";
import type { RouteContribution } from "./module-capabilities";
import type { RegisteredRoute } from "./module-definition";
import { parseModuleId, validateRouteContribution } from "./module-validation";

/**
 * A module's raw route descriptors together with the module folder / id that owns
 * them. `moduleId` is an untrusted token (a manifest folder name at build time,
 * the declared module id at runtime); it is validated with `parseModuleId`, so a
 * malformed module folder/id fails loudly here rather than being cast through.
 */
export type ModuleRouteSource = {
  /** The owning module folder / declared id (validated via `parseModuleId`). */
  readonly moduleId: string;
  /** The module's authored route descriptors (a manifest's default export). */
  readonly routes: readonly RouteContribution[] | undefined;
};

/**
 * Validate a set of per-module route sources into the flat, deterministic,
 * ownership-carrying route list the shell composes. Input order is preserved
 * (callers sort deterministically before calling), so duplicate detection and
 * every thrown error are deterministic too. This is the authoritative validator
 * reused by runtime registration and build-time React Router composition.
 */
export function validateModuleRoutes(
  sources: readonly ModuleRouteSource[],
): RegisteredRoute[] {
  const routeMap = new Map<string, RegisteredRoute>();
  const routes: RegisteredRoute[] = [];

  for (const source of sources) {
    const moduleId = parseModuleId(source.moduleId);
    const descriptors = source.routes ?? [];
    descriptors.forEach((descriptor, index) => {
      const validated = validateRouteContribution(descriptor, moduleId, index);
      const registered: RegisteredRoute = { ...validated, moduleId };
      const existing = routeMap.get(registered.id);
      if (existing !== undefined) {
        throw new DuplicateContributionError(
          "route",
          registered.id,
          existing.moduleId,
          moduleId,
        );
      }
      routeMap.set(registered.id, registered);
      routes.push(registered);
    });
  }

  validateRouteGraph(routes, routeMap);
  return routes;
}

/**
 * Validate the route graph: every `parentId` resolves to a known route, a route
 * is never its own parent, a parent is owned by the same module (the only
 * safely-supported case), no parent chain forms a cycle that never reaches a
 * root, and no two routes conflict on the same path (or two index routes) under
 * the same effective parent. Exported so both callers validate identically.
 */
export function validateRouteGraph(
  routes: readonly RegisteredRoute[],
  routeMap: ReadonlyMap<string, RegisteredRoute>,
): void {
  for (const route of routes) {
    if (route.parentId === undefined) {
      continue;
    }
    if (route.parentId === route.id) {
      throw new RouteParentError(route.id, route.parentId, "self");
    }
    const parent = routeMap.get(route.parentId);
    if (parent === undefined) {
      throw new RouteParentError(route.id, route.parentId, "unresolved");
    }
    if (parent.moduleId !== route.moduleId) {
      throw new RouteParentError(route.id, route.parentId, "cross_module");
    }
    if (parent.index === true) {
      // An index route renders at its parent's path and can never have children.
      throw new RouteParentError(route.id, route.parentId, "index_parent");
    }
  }

  // Every parent chain must terminate at a root. A cycle (e.g. A→B→A) passes the
  // per-route checks above — each reference resolves, is same-module and is not a
  // self-reference — yet leaves the routes un-composable: the tree builder would
  // give every route a parent and produce no root. Reject any cycle with a typed
  // error. All parents are known to resolve here, so walking the chain is bounded
  // by the route count.
  for (const route of routes) {
    if (route.parentId === undefined) {
      continue;
    }
    const seen = new Set<string>([route.id]);
    let current: string | undefined = route.parentId;
    while (current !== undefined) {
      if (seen.has(current)) {
        throw new RouteParentError(route.id, route.parentId, "cycle");
      }
      seen.add(current);
      current = routeMap.get(current)?.parentId;
    }
  }

  // Path conflicts are checked within each effective parent scope.
  const pathsByParent = new Map<string, Map<string, string>>();
  const indexByParent = new Map<string, string>();
  for (const route of routes) {
    const parentKey = route.parentId ?? " root";
    if (route.index === true) {
      const existing = indexByParent.get(parentKey);
      if (existing !== undefined) {
        throw new RoutePathConflictError(
          "(index)",
          route.parentId ?? null,
          existing,
          route.id,
        );
      }
      indexByParent.set(parentKey, route.id);
      continue;
    }
    const path = route.path as string;
    let paths = pathsByParent.get(parentKey);
    if (paths === undefined) {
      paths = new Map<string, string>();
      pathsByParent.set(parentKey, paths);
    }
    const existing = paths.get(path);
    if (existing !== undefined) {
      throw new RoutePathConflictError(
        path,
        route.parentId ?? null,
        existing,
        route.id,
      );
    }
    paths.set(path, route.id);
  }
}
