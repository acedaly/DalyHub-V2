/**
 * FND-06 Module Registry kernel — manifest export-shape collection.
 *
 * `collectModuleDefinitions` turns the raw map produced by a build-time discovery
 * mechanism (a Vite `import.meta.glob` in the app layer, or a fixture glob in
 * tests) into an ordered array of module definitions. It validates ONLY the
 * documented export shape here — each manifest module must expose its definition
 * through a single `default` export whose value is an object — and leaves the
 * deeper manifest validation to `createModuleRegistry`.
 *
 * It is intentionally PURE and storage-independent: it receives a plain record
 * and imports no Vite, filesystem or Cloudflare API. Keeping the Vite-specific
 * `import.meta.glob` out of the kernel (it lives in `app/modules`) preserves the
 * kernel's storage/tooling independence (ADR-013 §5, §17).
 *
 * Discovery order is normalised (manifest paths are sorted) so the result does
 * not depend on filesystem enumeration order; the registry then re-sorts modules
 * by their declared order, so this only guarantees stable, reproducible input.
 */

import { ModuleDiscoveryError } from "./module-errors";
import type { ModuleDefinition } from "./module-definition";

/** The shape a discovered manifest module is expected to have. */
export type DiscoveredManifestModule = {
  /** The module's definition, exposed through the documented `default` export. */
  readonly default?: unknown;
};

/** The documented export name a manifest must use for its definition. */
export const MODULE_MANIFEST_EXPORT = "default" as const;

/**
 * Collect module definitions from a map of `path → manifest module namespace`,
 * validating the export shape of each and returning them in path-sorted order.
 * Throws `ModuleDiscoveryError` naming the offending path if a manifest does not
 * expose exactly one default export that is an object.
 */
export function collectModuleDefinitions(
  manifestModules: Readonly<Record<string, unknown>>,
): ModuleDefinition[] {
  const paths = Object.keys(manifestModules).sort();
  const definitions: ModuleDefinition[] = [];
  for (const path of paths) {
    const namespace = manifestModules[path];
    if (typeof namespace !== "object" || namespace === null) {
      throw new ModuleDiscoveryError(
        path,
        "did not export a module namespace object",
      );
    }
    const exported = (namespace as DiscoveredManifestModule).default;
    if (exported === undefined) {
      throw new ModuleDiscoveryError(
        path,
        `must expose its module definition through a "${MODULE_MANIFEST_EXPORT}" export`,
      );
    }
    if (typeof exported !== "object" || exported === null) {
      throw new ModuleDiscoveryError(
        path,
        "default export must be a module definition object",
      );
    }
    definitions.push(exported as ModuleDefinition);
  }
  return definitions;
}
