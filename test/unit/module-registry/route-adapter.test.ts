import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import { buildModuleRouteTree } from "~/platform/modules/route-contribution-adapter";

describe("route contribution adapter", () => {
  it("nests routes under their parents, preserving order, without loading them", () => {
    let loads = 0;
    const lazy = () => {
      loads += 1;
      return Promise.resolve({ default: () => null });
    };

    const registry = createModuleRegistry([
      defineModule({
        id: "projects",
        name: "Projects",
        routes: [
          { id: "projects.list", path: "projects", lazy },
          {
            id: "projects.index",
            index: true,
            parentId: "projects.list",
            lazy,
          },
          {
            id: "projects.detail",
            path: ":projectId",
            parentId: "projects.list",
            lazy,
          },
        ],
      }),
    ]);

    const tree = buildModuleRouteTree(registry.listRoutes());
    expect(loads).toBe(0);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("projects.list");
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
        routes: [
          { id: "notes.list", path: "notes", lazy: () => Promise.resolve({}) },
        ],
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
