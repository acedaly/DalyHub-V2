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

  it("attaches the module’s entity type when a resolver supplies one (PX-02)", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "projects",
        name: "Projects",
        entityTypes: [
          { type: "project", singular: "Project", plural: "Projects" },
        ],
        routes: [
          {
            id: "projects.list",
            path: "projects",
            file: "routes/index.tsx",
            meta: { navLabel: "Projects" },
          },
        ],
      }),
      defineModule({
        id: "settings",
        name: "Settings",
        routes: [
          {
            id: "settings.index",
            path: "settings",
            file: "routes/index.tsx",
            meta: { navLabel: "Settings" },
          },
        ],
      }),
    ]);
    const nav = buildNavigationModel(
      registry.listRoutes(),
      (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
    );
    const projects = nav.find((item) => item.id === "projects.list");
    const settings = nav.find((item) => item.id === "settings.index");
    // The icon is DERIVED from the module's own entity-type manifest.
    expect(projects?.entityType).toBe("project");
    // A module with no entity type carries none (the shell falls back to a glyph).
    expect(settings?.entityType).toBeUndefined();
  });

  /*
   * RECALL-00-E (DEBT-226) — each destination carries its module's
   * out-of-nesting route prefixes, DERIVED from the routes the registry
   * already holds, never a hand-kept list.
   */
  describe("module route prefixes (RECALL-00-E)", () => {
    it("derives the singular record and create prefixes from the module's own routes", () => {
      const nav = navFrom([
        defineModule({
          id: "people",
          name: "People",
          routes: [
            {
              id: "people.index",
              path: "people",
              file: "routes/index.tsx",
              meta: { navLabel: "People" },
            },
            // Nested sub-view: covered by nesting, contributes no prefix.
            {
              id: "people.recent",
              path: "people/recent",
              file: "routes/recent.tsx",
            },
            // Fully-static create route outside the nesting.
            { id: "people.new", path: "new/person", file: "routes/new.tsx" },
            // Singular record routes: one prefix, deduplicated.
            {
              id: "people.detail",
              path: "person/:personId",
              file: "routes/detail.tsx",
            },
            {
              id: "people.activity",
              path: "person/:personId/activity",
              file: "routes/activity.tsx",
            },
          ],
        }),
      ]);
      expect(nav[0]?.activePathPrefixes).toEqual(["/new/person", "/person"]);
    });

    it("derives none for a module whose routes all nest under its destinations", () => {
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
            {
              id: "notes.detail",
              path: "notes/:noteId",
              file: "routes/detail.tsx",
            },
          ],
        }),
      ]);
      expect(nav[0]?.activePathPrefixes).toBeUndefined();
    });

    it("attaches a module's prefixes to its FIRST destination only", () => {
      const nav = navFrom([
        defineModule({
          id: "tasks",
          name: "Tasks",
          routes: [
            {
              id: "tasks.inbox",
              path: "inbox",
              file: "routes/inbox.tsx",
              meta: { navLabel: "Inbox", navOrder: 10 },
            },
            {
              id: "tasks.index",
              path: "tasks",
              file: "routes/index.tsx",
              meta: { navLabel: "Tasks", navOrder: 20 },
            },
            // A record shape outside both destinations' nesting.
            { id: "tasks.detail", path: "task/:taskId", file: "routes/d.tsx" },
          ],
        }),
      ]);
      expect(nav.map((item) => item.id)).toEqual([
        "tasks.inbox",
        "tasks.index",
      ]);
      expect(nav[0]?.activePathPrefixes).toEqual(["/task"]);
      expect(nav[1]?.activePathPrefixes).toBeUndefined();
    });

    it("fails composition when two modules claim the same route prefix", () => {
      expect(() =>
        navFrom([
          defineModule({
            id: "people",
            name: "People",
            routes: [
              {
                id: "people.index",
                path: "people",
                file: "routes/index.tsx",
                meta: { navLabel: "People" },
              },
              {
                id: "people.detail",
                path: "record/:id",
                file: "routes/detail.tsx",
              },
            ],
          }),
          defineModule({
            id: "assets",
            name: "Assets",
            routes: [
              {
                id: "assets.index",
                path: "assets",
                file: "routes/index.tsx",
                meta: { navLabel: "Assets" },
              },
              {
                id: "assets.detail",
                path: "record/:id2",
                file: "routes/detail.tsx",
              },
            ],
          }),
        ]),
      ).toThrow(/route prefix "\/record" is claimed by both/);
    });
  });
});
