/**
 * FND-09 platform adapter — registry-driven primary navigation.
 *
 * Primary navigation is DERIVED, never hand-maintained: it is built entirely from
 * the route metadata modules already declare (`meta.navLabel`, `navOrder`,
 * `navGroup`). Adding a navigable module route means adding a manifest route with
 * a `navLabel` — no central navigation array is edited, and no module route
 * component is imported to build navigation (this operates purely on the
 * registry's declarative route list). See ADR-016 §5.9 and AGENTS.md §9.2.
 *
 * It resolves each navigable route's concrete href by walking its `parentId`
 * chain, so nested routes and index routes resolve correctly. Routes whose
 * resolved path contains a dynamic segment (`:param` or `*`) are excluded from
 * primary navigation — a parameterised route has no single concrete target.
 * Duplicate ids or hrefs, or an unresolved parent, fail composition (and
 * therefore the build) rather than producing broken navigation.
 */

import type { ModuleId, RegisteredRoute } from "~/kernel/modules";

/** A single primary-navigation entry the shell renders. Plain, safe data. */
export type NavigationItem = {
  /** The owning route's stable, module-namespaced id. */
  readonly id: string;
  /** The module that owns the route. */
  readonly moduleId: ModuleId;
  /** Plain-text navigation label (never HTML). */
  readonly label: string;
  /** The concrete in-app path this item navigates to (e.g. `/areas`). */
  readonly href: string;
  /** Deterministic ordering key (from `meta.navOrder`, else a large default). */
  readonly order: number;
  /** Optional grouping key the shell may use to cluster entries. */
  readonly group?: string;
};

/** Routes without an explicit `navOrder` sort after those that declare one. */
const DEFAULT_NAV_ORDER = Number.MAX_SAFE_INTEGER;

/** True if a resolved path segment is dynamic (a param or splat). */
function isDynamicSegment(segment: string): boolean {
  return segment.startsWith(":") || segment === "*" || segment.includes("*");
}

/**
 * Resolve a route's concrete href by walking its `parentId` chain and joining the
 * static path segments, root-first. Index routes contribute no segment of their
 * own (they render at their parent's path). Returns null if the resolved path is
 * dynamic (contains a param/splat) — such a route has no single concrete nav
 * target.
 */
function resolveHref(
  route: RegisteredRoute,
  byId: ReadonlyMap<string, RegisteredRoute>,
): string | null {
  const segments: string[] = [];
  const seen = new Set<string>();
  let current: RegisteredRoute | undefined = route;

  while (current !== undefined) {
    if (seen.has(current.id)) {
      // A cycle is impossible after registry validation; guard defensively.
      throw new Error(
        `navigation: route "${route.id}" has a cyclic parent chain`,
      );
    }
    seen.add(current.id);

    if (current.path !== undefined) {
      // Prepend this ancestor's segments (root-first order).
      segments.unshift(...current.path.split("/"));
    }

    if (current.parentId === undefined) {
      break;
    }
    const parent: RegisteredRoute | undefined = byId.get(current.parentId);
    if (parent === undefined) {
      throw new Error(
        `navigation: route "${route.id}" references unresolved parent "${current.parentId}"`,
      );
    }
    current = parent;
  }

  if (segments.some(isDynamicSegment)) {
    return null;
  }
  return `/${segments.join("/")}`.replace(/\/{2,}/g, "/");
}

/**
 * Build the deterministic primary-navigation model from the registry's flat,
 * ordered route list. Only routes that declare a `meta.navLabel` appear; each is
 * resolved to a concrete href. Ordering is by `navOrder` then the route's stable
 * position in the registry list, so navigation is fully deterministic. Throws if
 * two navigable routes would collide on id or href.
 */
export function buildNavigationModel(
  routes: readonly RegisteredRoute[],
): readonly NavigationItem[] {
  const byId = new Map<string, RegisteredRoute>();
  for (const route of routes) {
    byId.set(route.id, route);
  }

  const items: { item: NavigationItem; listIndex: number }[] = [];
  routes.forEach((route, listIndex) => {
    const label = route.meta?.navLabel;
    if (label === undefined) {
      return;
    }
    const href = resolveHref(route, byId);
    if (href === null) {
      // Parameterised route with a nav label but no concrete target — skip it
      // rather than emit a broken link.
      return;
    }
    const item: NavigationItem = {
      id: route.id,
      moduleId: route.moduleId,
      label,
      href,
      order: route.meta?.navOrder ?? DEFAULT_NAV_ORDER,
      ...(route.meta?.navGroup === undefined
        ? {}
        : { group: route.meta.navGroup }),
    };
    items.push({ item, listIndex });
  });

  items.sort((a, b) => {
    if (a.item.order !== b.item.order) {
      return a.item.order - b.item.order;
    }
    return a.listIndex - b.listIndex;
  });

  const model = items.map((entry) => entry.item);

  // Fail composition on impossible navigation (duplicate id or duplicate target).
  const seenIds = new Set<string>();
  const seenHrefs = new Set<string>();
  for (const item of model) {
    if (seenIds.has(item.id)) {
      throw new Error(`navigation: duplicate navigation id "${item.id}"`);
    }
    seenIds.add(item.id);
    if (seenHrefs.has(item.href)) {
      throw new Error(`navigation: duplicate navigation target "${item.href}"`);
    }
    seenHrefs.add(item.href);
  }

  return Object.freeze(model);
}
