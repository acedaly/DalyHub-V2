/**
 * FND-06 module discovery — the build-time Vite `import.meta.glob` surface.
 *
 * This is the ONE place the module manifest convention meets the toolchain.
 * Adding a module means adding an `app/modules/<module-id>/module.ts` file that
 * default-exports a `defineModule(...)` definition — NOT editing a central switch
 * statement or a manually-maintained module array (ADR-013 §4.3, §17). Vite
 * statically transforms the glob below at build time into a map of every matching
 * manifest, so discovery is deterministic, trusted, build-time-only code that
 * works under Vite, React Router and Cloudflare Workers with no Node filesystem
 * access in the deployed Worker.
 *
 * `eager: true` eagerly imports each small, declarative, side-effect-free
 * manifest. The heavy module UI a manifest references stays LAZY: route
 * components are referenced by a plain, declarative `file` string (ADR-016
 * §5.10) — never imported to build the registry. React Router resolves those
 * files at build time and code-splits each route module.
 *
 * The pure collection/validation lives in the kernel (`collectModuleDefinitions`,
 * `createModuleRegistry`); only the Vite-specific glob is here, keeping the
 * kernel free of Vite APIs.
 */

import {
  collectModuleDefinitions,
  createModuleRegistry,
  type ModuleDefinition,
  type ModuleRegistry,
} from "~/kernel/modules";

/**
 * Every `app/modules/<module-id>/module.ts` manifest, eagerly imported. There
 * are no product modules yet (FND-06 builds the registry, not the modules), so
 * this resolves to an empty map today — an empty registry is fully supported.
 */
const manifestModules: Record<string, unknown> = import.meta.glob(
  "./*/module.ts",
  { eager: true },
);

/** The discovered module definitions, in normalised (path-sorted) order. */
export function discoverModuleDefinitions(): ModuleDefinition[] {
  return collectModuleDefinitions(manifestModules);
}

/**
 * Discover every module manifest and assemble the immutable, validated module
 * registry. FND-09 calls this to build navigation, routes, the command palette,
 * global search and settings surfaces from a single source of truth.
 */
export function discoverModuleRegistry(): ModuleRegistry {
  return createModuleRegistry(discoverModuleDefinitions());
}
