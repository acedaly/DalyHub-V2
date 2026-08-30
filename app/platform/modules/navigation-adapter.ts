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

import type { ModuleId, NavIconName, RegisteredRoute } from "~/kernel/modules";

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
  /**
   * MOBILE-01 — the module-declared phone primary-placement order, when this
   * destination opts in to a bottom-navigation slot (`meta.mobilePrimaryOrder`).
   * The shell reads it; it never maintains a second list of phone destinations.
   * See `app/shared/shell/mobile-navigation.ts`.
   */
  readonly mobilePrimaryOrder?: number;
  /**
   * The owning module's primary entity-type slug (PX-02), if declared, so the
   * sidebar can render the type's identity icon + accent (app/shared/entity). It
   * is DERIVED from the module's own `entityTypes` manifest — the module declares
   * its identity, the shell reads it; there is no central icon switch.
   */
  readonly entityType?: string;
  /**
   * THEME-01 — the module-declared shell glyph name (`meta.navIcon`), for a module
   * that owns no entity type. The shell resolves it through `app/shared/shell/NavIcon`;
   * it never maps module ids to icons itself.
   */
  readonly navIcon?: NavIconName;
  /**
   * RECALL-00-E (DEBT-226) — the module's OWN route-path prefixes that live
   * OUTSIDE this destination's path nesting, derived from the routes the
   * registry already holds. People, Meetings and Assets register plural
   * collection hrefs (`/people`, `/meetings`, `/assets`) while their record and
   * create routes are singular (`person/:personId`, `new/person`, …) — so the
   * one navigation-active rule (`~/shared/shell/navigation-active`) consults
   * these prefixes and a record route keeps its module's destination current.
   * Present only when a module genuinely has such routes; path nesting under
   * `href` stays the default and is never restated here.
   */
  readonly activePathPrefixes?: readonly string[];
};

/**
 * Resolve a module's primary entity-type slug (its first declared entity type),
 * used only to pick the navigation icon. Returns undefined for a module that
 * declares no entity type — the shell falls back to a generic glyph.
 */
export type ModuleEntityTypeResolver = (
  moduleId: ModuleId,
) => string | undefined;

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
 * RECALL-00-E — a route's LEADING STATIC path prefix: the resolved segments up
 * to (never including) its first dynamic one. `person/:personId/activity`
 * yields `/person`; a fully-static route (`new/person`) yields its whole path;
 * a route whose first segment is dynamic yields null (it claims no prefix).
 */
function resolveStaticPrefix(
  route: RegisteredRoute,
  byId: ReadonlyMap<string, RegisteredRoute>,
): string | null {
  const segments: string[] = [];
  const seen = new Set<string>();
  let current: RegisteredRoute | undefined = route;
  while (current !== undefined) {
    if (seen.has(current.id)) {
      throw new Error(
        `navigation: route "${route.id}" has a cyclic parent chain`,
      );
    }
    seen.add(current.id);
    if (current.path !== undefined) {
      segments.unshift(...current.path.split("/"));
    }
    if (current.parentId === undefined) break;
    const parent: RegisteredRoute | undefined = byId.get(current.parentId);
    if (parent === undefined) {
      throw new Error(
        `navigation: route "${route.id}" references unresolved parent "${current.parentId}"`,
      );
    }
    current = parent;
  }
  const leading: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0) continue;
    if (isDynamicSegment(segment)) break;
    leading.push(segment);
  }
  if (leading.length === 0) return null;
  return `/${leading.join("/")}`;
}

/** Whether `path` sits at or nested under `href` (the adapter-side twin of the
 * shell's path-nesting primitive, used here only to derive DATA — the matching
 * AUTHORITY stays `~/shared/shell/navigation-active`). */
function isNestedUnder(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  const normalised = href.endsWith("/") ? href.slice(0, -1) : href;
  return path === normalised || path.startsWith(`${normalised}/`);
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
  resolveEntityType?: ModuleEntityTypeResolver,
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
    const entityType = resolveEntityType?.(route.moduleId);
    const item: NavigationItem = {
      id: route.id,
      moduleId: route.moduleId,
      label,
      href,
      order: route.meta?.navOrder ?? DEFAULT_NAV_ORDER,
      ...(route.meta?.navGroup === undefined
        ? {}
        : { group: route.meta.navGroup }),
      ...(route.meta?.mobilePrimaryOrder === undefined
        ? {}
        : { mobilePrimaryOrder: route.meta.mobilePrimaryOrder }),
      ...(entityType === undefined ? {} : { entityType }),
      ...(route.meta?.navIcon === undefined
        ? {}
        : { navIcon: route.meta.navIcon }),
    };
    items.push({ item, listIndex });
  });

  items.sort((a, b) => {
    if (a.item.order !== b.item.order) {
      return a.item.order - b.item.order;
    }
    return a.listIndex - b.listIndex;
  });

  /*
   * RECALL-00-E — teach each module's destination its own out-of-nesting route
   * prefixes, from the routes the registry already declares (never a hand-kept
   * list). A prefix is the leading static path of any of the module's routes
   * that does NOT nest under any of the module's navigable hrefs — with the
   * shipped manifests exactly `/person` + `/new/person` (People),
   * `/meeting` + `/new/meeting` (Meetings) and `/asset` + `/new/asset`
   * (Assets). They attach to the module's FIRST destination in nav order (its
   * collection root); every other module derives none and carries none.
   */
  const moduleHrefs = new Map<ModuleId, string[]>();
  for (const entry of items) {
    const hrefs = moduleHrefs.get(entry.item.moduleId) ?? [];
    hrefs.push(entry.item.href);
    moduleHrefs.set(entry.item.moduleId, hrefs);
  }
  const modulePrefixes = new Map<ModuleId, string[]>();
  for (const route of routes) {
    const hrefs = moduleHrefs.get(route.moduleId);
    if (hrefs === undefined) continue; // no destination to keep current
    const prefix = resolveStaticPrefix(route, byId);
    if (prefix === null || prefix === "/") continue;
    if (hrefs.some((href) => isNestedUnder(href, prefix))) continue;
    const prefixes = modulePrefixes.get(route.moduleId) ?? [];
    if (!prefixes.includes(prefix)) {
      prefixes.push(prefix);
      modulePrefixes.set(route.moduleId, prefixes);
    }
  }
  const attributed = new Set<ModuleId>();
  const model = items.map(({ item }) => {
    const prefixes = modulePrefixes.get(item.moduleId);
    if (prefixes === undefined || attributed.has(item.moduleId)) {
      return item;
    }
    attributed.add(item.moduleId);
    return { ...item, activePathPrefixes: Object.freeze([...prefixes]) };
  });

  // Fail composition on impossible navigation (duplicate id, duplicate target,
  // or a route prefix two modules both claim — which would make "which row is
  // current" ambiguous for every path beneath it).
  const seenIds = new Set<string>();
  const seenHrefs = new Set<string>();
  const seenPrefixes = new Map<string, ModuleId>();
  for (const item of model) {
    if (seenIds.has(item.id)) {
      throw new Error(`navigation: duplicate navigation id "${item.id}"`);
    }
    seenIds.add(item.id);
    if (seenHrefs.has(item.href)) {
      throw new Error(`navigation: duplicate navigation target "${item.href}"`);
    }
    seenHrefs.add(item.href);
    for (const prefix of item.activePathPrefixes ?? []) {
      const owner = seenPrefixes.get(prefix);
      if (owner !== undefined && owner !== item.moduleId) {
        throw new Error(
          `navigation: route prefix "${prefix}" is claimed by both "${owner}" and "${item.moduleId}"`,
        );
      }
      seenPrefixes.set(prefix, item.moduleId);
    }
  }

  return Object.freeze(model);
}
