import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, it } from "vitest";

import {
  DuplicateContributionError,
  ModuleDefinitionError,
  RouteParentError,
  RoutePathConflictError,
  type RouteContribution,
} from "~/kernel/modules";
import routeConfig from "~/routes";
import {
  composeModuleRouteConfig,
  resolveRouteModuleFile,
} from "~/platform/modules/react-router-route-adapter";
import { buildModuleRouteTree } from "~/platform/modules/route-contribution-adapter";

function findById(
  entries: readonly RouteConfigEntry[],
  id: string,
): RouteConfigEntry | undefined {
  for (const entry of entries) {
    if (entry.id === id) {
      return entry;
    }
    const nested = entry.children ? findById(entry.children, id) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

describe("the real app/routes.ts composition", () => {
  const config = routeConfig as unknown as RouteConfigEntry[];

  it("keeps /health and the theme action outside the shell layout", () => {
    const paths = config.map((entry) => entry.path);
    expect(paths).toContain("health");
    expect(paths).toContain("preferences/theme");
  });

  it("nests the four spine module routes inside the app-shell layout", () => {
    const shell = config.find((entry) => entry.id === "app-shell");
    expect(shell).toBeDefined();
    const ids = (shell?.children ?? []).map((child) => child.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "areas.index",
        "goals.index",
        "projects.index",
        "tasks.index",
      ]),
    );
  });

  it("resolves each module route file under its owning module", () => {
    for (const moduleId of ["areas", "goals", "projects", "tasks"]) {
      const entry = findById(config, `${moduleId}.index`);
      expect(entry?.file).toBe(`modules/${moduleId}/routes/index.tsx`);
      expect(entry?.path).toBe(moduleId);
    }
  });

  it("includes an authenticated index (home) under the shell", () => {
    const shell = config.find((entry) => entry.id === "app-shell");
    const home = (shell?.children ?? []).find((child) => child.index === true);
    expect(home?.file).toBe("routes/home.tsx");
  });
});

describe("composeModuleRouteConfig", () => {
  it("adds a new module's routes with NO central list change (glob-driven)", () => {
    // Simulate the glob discovering an extra module manifest. No edit to any
    // central array is needed — a new manifest simply appears.
    const entries = composeModuleRouteConfig({
      "./modules/widgets/routes.manifest.ts": {
        default: [
          {
            id: "widgets.index",
            path: "widgets",
            file: "routes/index.tsx",
          },
        ],
      },
      "./modules/areas/routes.manifest.ts": {
        default: [
          { id: "areas.index", path: "areas", file: "routes/index.tsx" },
        ],
      },
    });
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    expect(byId["widgets.index"]?.file).toBe(
      "modules/widgets/routes/index.tsx",
    );
    expect(byId["areas.index"]?.file).toBe("modules/areas/routes/index.tsx");
  });

  it("composes in deterministic (path-sorted) order", () => {
    const entries = composeModuleRouteConfig({
      "./modules/zebra/routes.manifest.ts": {
        default: [
          { id: "zebra.index", path: "zebra", file: "routes/index.tsx" },
        ],
      },
      "./modules/apple/routes.manifest.ts": {
        default: [
          { id: "apple.index", path: "apple", file: "routes/index.tsx" },
        ],
      },
    });
    expect(entries.map((e) => e.id)).toEqual(["apple.index", "zebra.index"]);
  });
});

/**
 * The build-time composition path (`composeModuleRouteConfig`, which the real
 * `app/routes.ts` calls) must run the SAME authoritative validation the runtime
 * registry runs. Each case below builds a manifest map exactly as the
 * `import.meta.glob` surface would and asserts the real composition fails loudly.
 * A `manifest` helper keeps each case to the one rule under test.
 */
describe("composeModuleRouteConfig authoritative validation", () => {
  function manifest(
    moduleFolder: string,
    routes: readonly RouteContribution[],
  ): Record<string, { default: readonly RouteContribution[] }> {
    return {
      [`./modules/${moduleFolder}/routes.manifest.ts`]: { default: routes },
    };
  }

  it("composes a valid nested module route tree", () => {
    const entries = composeModuleRouteConfig(
      manifest("projects", [
        { id: "projects.list", path: "projects", file: "routes/list.tsx" },
        {
          id: "projects.detail",
          path: ":projectId",
          parentId: "projects.list",
          file: "routes/detail.tsx",
        },
      ]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "projects.list",
      file: "modules/projects/routes/list.tsx",
    });
    expect(entries[0].children?.[0]).toMatchObject({
      id: "projects.detail",
      file: "modules/projects/routes/detail.tsx",
    });
  });

  it("rejects an invalid module folder / module id", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("Not A Module", [
          { id: "x.index", index: true, file: "routes/index.tsx" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects an invalid route descriptor (non-string id)", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: 5 as never, path: "x", file: "routes/index.tsx" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a route id outside the module namespace", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "projects.index", path: "x", file: "routes/index.tsx" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a duplicate route id", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.x", path: "x", file: "routes/index.tsx" },
          { id: "notes.x", path: "y", file: "routes/other.tsx" },
        ]),
      ),
    ).toThrow(DuplicateContributionError);
  });

  it("rejects a duplicate / conflicting route path", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.a", path: "same", file: "routes/a.tsx" },
          { id: "notes.b", path: "same", file: "routes/b.tsx" },
        ]),
      ),
    ).toThrow(RoutePathConflictError);
  });

  it("rejects a missing parent", () => {
    const error = captureError(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          {
            id: "notes.child",
            path: "child",
            parentId: "notes.missing",
            file: "routes/index.tsx",
          },
        ]),
      ),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("unresolved");
  });

  it("rejects a cross-module parent", () => {
    // A parent id must be namespaced under its own module, so a cross-module
    // parent reference cannot even be authored: it fails qualified-id validation.
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          {
            id: "notes.child",
            path: "child",
            parentId: "projects.root",
            file: "routes/index.tsx",
          },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a two-node cycle", () => {
    const error = captureError(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          {
            id: "notes.a",
            path: "a",
            parentId: "notes.b",
            file: "routes/a.tsx",
          },
          {
            id: "notes.b",
            path: "b",
            parentId: "notes.a",
            file: "routes/b.tsx",
          },
        ]),
      ),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("cycle");
  });

  it("rejects a three-node cycle", () => {
    const error = captureError(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          {
            id: "notes.a",
            path: "a",
            parentId: "notes.c",
            file: "routes/a.tsx",
          },
          {
            id: "notes.b",
            path: "b",
            parentId: "notes.a",
            file: "routes/b.tsx",
          },
          {
            id: "notes.c",
            path: "c",
            parentId: "notes.b",
            file: "routes/c.tsx",
          },
        ]),
      ),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("cycle");
  });

  it("rejects an index route with a path", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          {
            id: "notes.x",
            index: true,
            path: "x",
            file: "routes/index.tsx",
          } as never,
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a non-index route without a path", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.x", file: "routes/index.tsx" } as never,
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects an index route with children", () => {
    // An index route renders at its parent's path and can never have children.
    // A non-index route naming an index route as its parent is exactly that
    // un-composable shape, and the authoritative validator rejects it.
    const error = captureError(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.idx", index: true, file: "routes/index.tsx" },
          {
            id: "notes.child",
            path: "child",
            parentId: "notes.idx",
            file: "routes/child.tsx",
          },
        ]),
      ),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("index_parent");
  });

  it("rejects an invalid route file extension", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.x", path: "x", file: "routes/index.md" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects an absolute route file", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.x", path: "x", file: "/etc/passwd.tsx" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a route file that traverses out of the module", () => {
    expect(() =>
      composeModuleRouteConfig(
        manifest("notes", [
          { id: "notes.x", path: "x", file: "../areas/routes/index.tsx" },
        ]),
      ),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a route file with query/hash/whitespace", () => {
    for (const file of [
      "routes/index.tsx?raw",
      "routes/index.tsx#frag",
      "routes/ index.tsx",
    ]) {
      expect(() =>
        composeModuleRouteConfig(
          manifest("notes", [{ id: "notes.x", path: "x", file }]),
        ),
      ).toThrow(ModuleDefinitionError);
    }
  });
});

describe("buildModuleRouteTree unresolved parent", () => {
  it("throws (not silently skips) when a parent node is absent", () => {
    // Called incorrectly with an unvalidated list whose parent is missing: the
    // builder must fail loudly rather than drop the orphaned child.
    const error = captureError(() =>
      buildModuleRouteTree([
        {
          id: "notes.child",
          moduleId: "notes" as never,
          path: "child",
          parentId: "notes.missing",
          file: "routes/child.tsx",
        },
      ]),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("unresolved");
  });
});

/** Run `fn`, returning the thrown error (or throwing if it did not throw). */
function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the function to throw, but it did not");
}

describe("resolveRouteModuleFile safety", () => {
  it("resolves a module-relative file under its module", () => {
    expect(
      resolveRouteModuleFile({
        moduleId: "areas" as never,
        file: "routes/index.tsx",
      }),
    ).toBe("modules/areas/routes/index.tsx");
  });

  it("rejects traversal, absolute and drive-letter file references", () => {
    for (const file of [
      "../areas/routes/index.tsx",
      "routes/../../secrets.tsx",
      "/etc/passwd.tsx",
      "C:/win.tsx",
    ]) {
      expect(() =>
        resolveRouteModuleFile({ moduleId: "notes" as never, file }),
      ).toThrow();
    }
  });
});
