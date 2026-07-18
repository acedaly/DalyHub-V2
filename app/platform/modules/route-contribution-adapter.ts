/**
 * FND-06 platform adapter — route contribution composition surface.
 *
 * FND-06 builds the module registry but NOT the app shell or router. This adapter
 * is the single, typed query surface FND-09 will consume to compose the actual
 * React Router route tree from module-owned route contributions (ADR-013 §8). It
 * lives in `app/platform` (not the kernel) because framework/router adaptation
 * belongs outside the storage-independent kernel — though it deliberately stays
 * framework-agnostic here, returning plain data that FND-09 maps onto React
 * Router primitives.
 *
 * It resolves the flat, validated route list into a parent→children tree using
 * each route's `parentId`. It passes every route's declarative `file` reference
 * through UNCHANGED, so composing (or querying) route structure is pure data
 * assembly that never eagerly loads a module's page component.
 */

// Value import via a RELATIVE path (not the `~` barrel): this adapter is on the
// build-time `app/routes.ts` composition path, whose bare config loader cannot
// resolve `~` for VALUE imports. `module-errors` is pure (no storage kernel), so
// it stays bundlable. Types below are erased, so a `~` type-only import is safe.
import { RouteParentError } from "../../kernel/modules/module-errors";
import type {
  ModuleId,
  RegisteredRoute,
  RouteMeta,
  RouteModuleFile,
} from "~/kernel/modules";

/**
 * A resolved route node: a module-owned route plus its nested children. This is
 * the framework-agnostic shape the React Router adapter maps onto
 * `route()`/`index()` calls with nesting; `file` is carried through untouched for
 * the adapter to resolve into a build-time route-module reference.
 */
export type RouteTreeNode = {
  readonly id: string;
  readonly moduleId: ModuleId;
  readonly path?: string;
  readonly index?: boolean;
  readonly file: RouteModuleFile;
  readonly meta?: RouteMeta;
  readonly children: readonly RouteTreeNode[];
};

/**
 * Build the module route tree from a flat, deterministic route list. Root routes
 * (no `parentId`) become top-level nodes; every other route nests under its
 * parent. Callers pass routes that the shared authoritative validator
 * (`validateModuleRoutes`) has already checked, so parents resolve, are
 * same-module and are acyclic. This builder nonetheless treats an unresolved
 * parent as an EXPLICIT error rather than silently dropping the route — a route
 * with a `parentId` that names no node in this list can never be composed, and
 * skipping it would hide a real composition fault. It is the last line of
 * defence even when called incorrectly.
 */
export function buildModuleRouteTree(
  routes: readonly RegisteredRoute[],
): readonly RouteTreeNode[] {
  const childrenByParent = new Map<string, RouteTreeNode[]>();
  const nodeById = new Map<string, RouteTreeNode>();
  const roots: RouteTreeNode[] = [];

  // First pass: create a node per route, preserving deterministic order.
  const nodes: { route: RegisteredRoute; node: RouteTreeNode }[] = routes.map(
    (route) => {
      const node: RouteTreeNode = {
        id: route.id,
        moduleId: route.moduleId,
        ...(route.path === undefined ? {} : { path: route.path }),
        ...(route.index === undefined ? {} : { index: route.index }),
        file: route.file,
        ...(route.meta === undefined ? {} : { meta: route.meta }),
        children: [],
      };
      nodeById.set(route.id, node);
      return { route, node };
    },
  );

  // Second pass: attach each node to its parent (or the roots).
  for (const { route, node } of nodes) {
    if (route.parentId === undefined) {
      roots.push(node);
      continue;
    }
    let siblings = childrenByParent.get(route.parentId);
    if (siblings === undefined) {
      siblings = [];
      childrenByParent.set(route.parentId, siblings);
    }
    siblings.push(node);
  }

  // Third pass: fold collected children into their (mutable-at-build) parents,
  // then freeze so the returned tree is immutable.
  for (const [parentId, children] of childrenByParent) {
    const parent = nodeById.get(parentId);
    if (parent === undefined) {
      // An unresolved parent means these children can never be composed. Fail
      // loudly (naming the first orphaned child) instead of silently dropping
      // them — this guards against being called with an unvalidated list.
      throw new RouteParentError(children[0].id, parentId, "unresolved");
    }
    (parent as { children: readonly RouteTreeNode[] }).children =
      Object.freeze(children);
  }

  for (const node of nodeById.values()) {
    Object.freeze(node.children);
    Object.freeze(node);
  }
  return Object.freeze(roots);
}
