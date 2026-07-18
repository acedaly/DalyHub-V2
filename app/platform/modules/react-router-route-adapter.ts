/**
 * FND-09 platform adapter — React Router framework-mode route composition.
 *
 * This is the ONE place the framework-agnostic module route tree
 * (`buildModuleRouteTree`) meets React Router's build-time route configuration
 * (`app/routes.ts`). It maps each `RouteTreeNode` onto a `RouteConfigEntry`,
 * resolving the module-relative `file` reference to an app-directory-relative
 * path (`modules/<module-id>/<file>`) that React Router's toolchain uses for
 * per-route type generation, SSR and production code splitting (ADR-016 §5.10).
 *
 * It imports React Router's `route`/`index` helpers, so it lives in
 * `app/platform` — never in the storage-independent kernel. It resolves the
 * `file` reference exactly as the kernel validated it (`validateRouteFile`):
 * module-relative, no traversal, no absolute path, so a route file always
 * resolves INSIDE its owning module directory and can never reference another
 * module or escape the app.
 */

import { index, route, type RouteConfigEntry } from "@react-router/dev/routes";

// Value import via a RELATIVE path (not the `~` barrel): `app/routes.ts` is
// evaluated by React Router's bare config loader, which cannot resolve `~` for
// VALUE imports. `route-composition` is the storage-kernel-free authoritative
// route validator, so this stays bundlable at build time. Types below are
// erased, so a `~` type-only import is safe.
import { validateModuleRoutes } from "../../kernel/modules/route-composition";
import type { ModuleId, RouteContribution } from "~/kernel/modules";

import {
  buildModuleRouteTree,
  type RouteTreeNode,
} from "./route-contribution-adapter";

/**
 * App-directory-relative base under which every module's source (including its
 * route modules) lives: `app/modules/`. React Router `file` references are
 * resolved relative to the app directory, so the resolved reference is
 * `modules/<module-id>/<file>`.
 */
export const MODULE_SOURCE_BASE = "modules";

/**
 * Resolve a module-owned route's declarative `file` to the app-directory-relative
 * path React Router expects. The module id and file are already validated
 * (`parseModuleId`, `validateRouteFile`) to safe, traversal-free tokens, so this
 * is a plain, safe join.
 */
export function resolveRouteModuleFile(node: {
  readonly moduleId: ModuleId;
  readonly file: string;
}): string {
  // Defence in depth for the build-time projection: the kernel's
  // `validateRouteFile` is the authoritative validator (runtime + tests), but the
  // bare `routes.ts` config loader cannot run it, so reject an unsafe reference
  // here too rather than resolve a traversal/absolute path.
  const file = node.file;
  if (
    file.length === 0 ||
    file.startsWith("/") ||
    file.includes("\\") ||
    /(^|\/)\.\.(\/|$)/.test(file) ||
    /^[A-Za-z]:/.test(file)
  ) {
    throw new Error(
      `react-router route adapter: unsafe module route file "${file}"`,
    );
  }
  return `${MODULE_SOURCE_BASE}/${node.moduleId}/${file}`;
}

/** A route-manifest glob entry: the module's declarative route descriptors. */
type ModuleRouteManifestModule = {
  readonly default?: readonly RouteContribution[];
};

/** Extract the owning module id from a `modules/<id>/routes.manifest.*` path. */
const MODULE_MANIFEST_PATH = /\/modules\/([^/]+)\/routes\.manifest\.[tj]sx?$/;

/**
 * Compose the module route configuration for the real `app/routes.ts` from the
 * globbed, declarative route manifests. This is the build-time composition path,
 * and it runs the SAME pure authoritative validation the runtime module registry
 * runs: it does not cast raw folder names and descriptors into registered routes,
 * it validates them. Each manifest's folder name and its descriptors are passed
 * to `validateModuleRoutes` (`parseModuleId` + `validateRouteContribution` +
 * duplicate-id + full route-graph checks), so the build fails loudly on an
 * invalid module folder, an invalid descriptor, a route id outside the module
 * namespace, a duplicate id, a duplicate/conflicting path, or a missing/
 * cross-module/cyclic parent — exactly as runtime registration does. There is no
 * second, drifting validator (ADR-016 §5.10).
 *
 * It deliberately avoids the runtime registry object itself (which imports the
 * `~` alias the bare `routes.ts` config loader cannot resolve) but shares the
 * registry's route rules through the kernel's pure validator.
 */
export function composeModuleRouteConfig(
  manifests: Record<string, ModuleRouteManifestModule>,
): RouteConfigEntry[] {
  // Sort by manifest path so composition order is deterministic and not
  // filesystem- or enumeration-dependent (mirrors the registry's ordering).
  const sources = Object.entries(manifests)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, manifest]) => {
      const match = MODULE_MANIFEST_PATH.exec(path);
      if (match === null) {
        return [];
      }
      return [{ moduleId: match[1], routes: manifest.default }];
    });
  const registered = validateModuleRoutes(sources);
  return toReactRouterRoutes(buildModuleRouteTree(registered));
}

/**
 * Map the framework-agnostic module route tree onto React Router
 * `RouteConfigEntry`s for inclusion in `app/routes.ts`. Nesting, ordering and the
 * index/path distinction are preserved from the tree (which the registry already
 * validated). Every entry carries the route's stable, module-namespaced id.
 */
export function toReactRouterRoutes(
  nodes: readonly RouteTreeNode[],
): RouteConfigEntry[] {
  return nodes.map(nodeToRouteConfigEntry);
}

function nodeToRouteConfigEntry(node: RouteTreeNode): RouteConfigEntry {
  const file = resolveRouteModuleFile(node);

  if (node.index === true) {
    // An index route renders at its parent's path and cannot have children.
    return index(file, { id: node.id });
  }

  const children =
    node.children.length > 0 ? toReactRouterRoutes(node.children) : undefined;

  // A non-index route always has a validated `path` (registry invariant).
  return route(node.path ?? null, file, { id: node.id }, children);
}
