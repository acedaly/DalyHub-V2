/**
 * FND-09 — the memoised primary-navigation model.
 *
 * Builds the registry-driven navigation model ONCE per Worker isolate and reuses
 * it, so no component or loader reconstructs the module registry per request
 * (AGENTS.md §16, ADR-016 §30). It depends only on the module discovery surface
 * and the pure navigation adapter — deliberately NOT on the React Router route
 * adapter (which imports build-time-only `@react-router/dev` helpers) — so it is
 * safe to import from a runtime loader.
 */

import { discoverModuleRegistry } from "~/modules/discover-modules";

import {
  buildNavigationModel,
  type NavigationItem,
} from "./navigation-adapter";

let cachedNavigation: readonly NavigationItem[] | undefined;

/** The deterministic primary-navigation model, built once and cached. */
export function getPrimaryNavigation(): readonly NavigationItem[] {
  if (cachedNavigation === undefined) {
    cachedNavigation = buildNavigationModel(
      discoverModuleRegistry().listRoutes(),
    );
  }
  return cachedNavigation;
}
