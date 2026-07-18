import { describe, expect, it } from "vitest";

import {
  collectModuleDefinitions,
  createModuleRegistry,
  ModuleDiscoveryError,
} from "~/kernel/modules";
import {
  discoverModuleDefinitions,
  discoverModuleRegistry,
} from "~/modules/discover-modules";

/**
 * Discovery proof (ADR-013 §17). These globs are the SAME `import.meta.glob`
 * mechanism the app uses in `app/modules/discover-modules.ts`, pointed at test
 * fixtures. Adding a correctly-shaped `module.ts` under the glob makes it
 * discoverable with NO change to the registry implementation and NO central
 * module list — the glob is a pattern, not an enumerated array.
 */
const validManifests = import.meta.glob("./fixtures/valid/*/module.ts", {
  eager: true,
});
const noDefaultManifest = import.meta.glob(
  "./fixtures/malformed/no-default/module.ts",
  { eager: true },
);
const badDefaultManifest = import.meta.glob(
  "./fixtures/malformed/bad-default/module.ts",
  { eager: true },
);

describe("module discovery", () => {
  it("discovers every fixture manifest automatically", () => {
    const definitions = collectModuleDefinitions(validManifests);
    expect(definitions.map((d) => d.id).sort()).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("normalises discovery order to be path-sorted (not filesystem-dependent)", () => {
    const definitions = collectModuleDefinitions(validManifests);
    // Paths sort alpha < beta < gamma regardless of enumeration order.
    expect(definitions.map((d) => d.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("builds a working registry from discovered fixtures, re-sorted by declared order", () => {
    const registry = createModuleRegistry(
      collectModuleDefinitions(validManifests),
    );
    // beta(order 1), alpha(order 2), gamma(no order → last).
    expect(registry.listModules().map((m) => m.id)).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
    expect(registry.getEntityType("alpha_thing")?.moduleId).toBe("alpha");
    expect(registry.getRoute("beta.home")?.index).toBe(true);
  });

  it("fails clearly when a manifest exposes no default export", () => {
    expect(() => collectModuleDefinitions(noDefaultManifest)).toThrow(
      ModuleDiscoveryError,
    );
  });

  it("fails clearly when a manifest default export is not an object", () => {
    expect(() => collectModuleDefinitions(badDefaultManifest)).toThrow(
      ModuleDiscoveryError,
    );
  });

  it("supports discovering an empty set (no manifests found)", () => {
    expect(collectModuleDefinitions({})).toEqual([]);
    expect(
      createModuleRegistry(collectModuleDefinitions({})).listModules(),
    ).toEqual([]);
  });

  describe("the production discovery surface (app/modules/discover-modules)", () => {
    // Importing the real discovery module forces Vite (via vitest) to transform
    // the SAME `import.meta.glob("./*/module.ts")` the production build uses,
    // proving the mechanism works under the actual toolchain. There are no
    // product modules yet, so it resolves to an empty, valid registry.
    it("transforms the production glob and yields an empty registry", () => {
      expect(discoverModuleDefinitions()).toEqual([]);
      expect(discoverModuleRegistry().listModules()).toEqual([]);
    });
  });
});
