import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";

function navFrom(definitions: Parameters<typeof createModuleRegistry>[0]) {
  return buildNavigationModel(createModuleRegistry(definitions).listRoutes());
}

describe("navigation adapter", () => {
  it("includes only routes that declare a navLabel", () => {
    const nav = navFrom([
      defineModule({
        id: "notes",
        name: "Notes",
        routes: [
          {
            id: "notes.list",
            path: "notes",
            file: "routes/index.tsx",
            meta: { navLabel: "Notes" },
          },
          // No navLabel → excluded from primary navigation.
          { id: "notes.detail", path: ":id", file: "routes/detail.tsx" },
        ],
      }),
    ]);
    expect(nav.map((item) => item.id)).toEqual(["notes.list"]);
    expect(nav[0]).toMatchObject({
      moduleId: "notes",
      label: "Notes",
      href: "/notes",
    });
  });

  it("orders deterministically by navOrder then registry order", () => {
    const nav = navFrom([
      defineModule({
        id: "beta",
        name: "Beta",
        order: 1,
        routes: [
          {
            id: "beta.i",
            path: "beta",
            file: "routes/index.tsx",
            meta: { navLabel: "Beta", navOrder: 20 },
          },
        ],
      }),
      defineModule({
        id: "alpha",
        name: "Alpha",
        order: 2,
        routes: [
          {
            id: "alpha.i",
            path: "alpha",
            file: "routes/index.tsx",
            meta: { navLabel: "Alpha", navOrder: 10 },
          },
        ],
      }),
    ]);
    // navOrder wins over module order: alpha(10) before beta(20).
    expect(nav.map((item) => item.label)).toEqual(["Alpha", "Beta"]);
  });

  it("resolves index routes to their parent path and skips dynamic targets", () => {
    const nav = navFrom([
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
            meta: { navLabel: "Projects" },
          },
          {
            id: "projects.detail",
            path: ":projectId",
            parentId: "projects.list",
            file: "routes/detail.tsx",
            meta: { navLabel: "Detail" },
          },
        ],
      }),
    ]);
    // Index resolves to /projects; the parameterised route is excluded.
    expect(nav.map((item) => ({ id: item.id, href: item.href }))).toEqual([
      { id: "projects.index", href: "/projects" },
    ]);
  });

  it("returns a frozen model", () => {
    const nav = navFrom([
      defineModule({
        id: "notes",
        name: "Notes",
        routes: [
          {
            id: "notes.list",
            path: "notes",
            file: "routes/index.tsx",
            meta: { navLabel: "Notes" },
          },
        ],
      }),
    ]);
    expect(Object.isFrozen(nav)).toBe(true);
  });
});
