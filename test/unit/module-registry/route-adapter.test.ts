import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import { buildModuleRouteTree } from "~/platform/modules/route-contribution-adapter";
import {
  resolveRouteModuleFile,
  toReactRouterRoutes,
} from "~/platform/modules/react-router-route-adapter";

describe("route contribution adapter", () => {
  it("nests routes under their parents, preserving order and carrying files", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "projects",
        name: "Projects",
        routes: [
          { id: "projects.list", path: "projects", file: "routes/list.tsx" },
          {
            id: "projects.index",
            index: true,
            parentId: "projects.list",
            file: "routes/index.tsx",
          },
          {
            id: "projects.detail",
            path: ":projectId",
            parentId: "projects.list",
            file: "routes/detail.tsx",
          },
        ],
      }),
    ]);

    const tree = buildModuleRouteTree(registry.listRoutes());
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("projects.list");
    expect(tree[0].file).toBe("routes/list.tsx");
    expect(tree[0].children.map((c) => c.id)).toEqual([
      "projects.index",
      "projects.detail",
    ]);
    expect(tree[0].children[0].index).toBe(true);
  });

  it("returns an immutable, frozen tree", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "notes",
        name: "Notes",
        routes: [{ id: "notes.list", path: "notes", file: "routes/index.tsx" }],
      }),
    ]);
    const tree = buildModuleRouteTree(registry.listRoutes());
    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree[0])).toBe(true);
    expect(Object.isFrozen(tree[0].children)).toBe(true);
    expect(() => {
      (tree as unknown as { push: (v: unknown) => void }).push({});
    }).toThrow();
  });

  it("returns an empty tree for a registry with no routes", () => {
    const registry = createModuleRegistry([
      defineModule({ id: "notes", name: "Notes" }),
    ]);
    expect(buildModuleRouteTree(registry.listRoutes())).toEqual([]);
  });
});

describe("react router route adapter", () => {
  it("resolves a module-owned file to an app-relative path under its module", () => {
    expect(
      resolveRouteModuleFile({
        moduleId: "areas" as never,
        file: "routes/index.tsx",
      }),
    ).toBe("modules/areas/routes/index.tsx");
  });

  it("maps the tree to React Router entries with stable ids, paths and files", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "projects",
        name: "Projects",
        routes: [
          { id: "projects.list", path: "projects", file: "routes/list.tsx" },
          {
            id: "projects.index",
            index: true,
            parentId: "projects.list",
            file: "routes/index.tsx",
          },
        ],
      }),
    ]);

    const entries = toReactRouterRoutes(
      buildModuleRouteTree(registry.listRoutes()),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "projects.list",
      path: "projects",
      file: "modules/projects/routes/list.tsx",
    });
    expect(entries[0].children?.[0]).toMatchObject({
      id: "projects.index",
      index: true,
      file: "modules/projects/routes/index.tsx",
    });
  });
});
