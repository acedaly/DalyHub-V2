/**
 * FND-06 Module Registry kernel — the manifest authoring helper.
 *
 * `defineModule` is the ONE supported way to author a module manifest. It is a
 * typed identity function: it preserves full inference on the definition (so the
 * capability descriptors are checked against their contracts as you write them)
 * and returns the value unchanged.
 *
 * Crucially it has NO side effects (ADR-013 §6): it does not register the module
 * anywhere, mutate any global, touch storage, or run any handler. There is
 * deliberately no `registerModule(...)`-style function that writes to a mutable
 * singleton at import time — a manifest becomes part of the application only when
 * it is discovered and passed to `createModuleRegistry`, which validates the
 * whole set once and returns an immutable registry.
 */

import type { ModuleDefinition } from "./module-definition";

/**
 * Author a module definition. Returns the definition unchanged, typed so editors
 * check every capability descriptor against its contract. Pure and side-effect
 * free — it performs no registration and no validation (validation happens once,
 * for the whole set, in `createModuleRegistry`).
 */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}
