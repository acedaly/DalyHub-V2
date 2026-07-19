import { describe, expect, it } from "vitest";

import {
  createModuleRegistry,
  defineModule,
  DuplicateContributionError,
  ModuleDefinitionError,
  ReservedActivityTypeError,
  parseModuleId,
  isModuleId,
  type ModuleDefinition,
} from "~/kernel/modules";

describe("module definition validation", () => {
  it("accepts a valid minimal module (identity only)", () => {
    const registry = createModuleRegistry([
      defineModule({ id: "notes", name: "Notes" }),
    ]);
    const module = registry.getModule("notes");
    expect(module?.id).toBe("notes");
    expect(module?.name).toBe("Notes");
    expect(module?.description).toBeNull();
    expect(module?.routes).toEqual([]);
    expect(module?.entityTypes).toEqual([]);
    expect(module?.commands).toEqual([]);
  });

  it("accepts a module with every contribution type", () => {
    const definition = defineModule({
      id: "projects",
      name: "Projects",
      description: "Finite bodies of work",
      order: 3,
      routes: [
        {
          id: "projects.list",
          path: "projects",
          file: "routes/index.tsx",
          meta: { navLabel: "Projects", navGroup: "work", navOrder: 1 },
        },
        {
          id: "projects.detail",
          path: "projects/:projectId",
          parentId: "projects.list",
          file: "routes/index.tsx",
        },
      ],
      entityTypes: [
        { type: "project", singular: "Project", plural: "Projects" },
      ],
      entityLinkTypes: [
        {
          type: "project.supporting_note",
          sourceLabel: "supported by",
          targetLabel: "supports",
          sourceEntityType: "project",
          targetEntityType: "note",
        },
      ],
      activityTypes: [
        {
          type: "project.completed",
          label: "Project completed",
          description: "A project reached its end.",
        },
      ],
      commands: [
        {
          id: "projects.create",
          title: "Create project",
          subtitle: "Start a finite body of work",
          keywords: ["new", "project"],
          shortcut: { key: "p", modifiers: ["mod", "shift"] },
          kind: "execute",
          run: () => ({ ok: true }),
        },
      ],
      searchProviders: [
        {
          id: "projects.search",
          label: "Projects",
          entityTypes: ["project"],
          search: async () => [],
        },
      ],
      settings: [
        {
          key: "projects.default_view",
          label: "Default view",
          type: "enum",
          options: [
            { value: "board", label: "Board" },
            { value: "list", label: "List" },
          ],
          default: "board",
        },
        {
          key: "projects.show_archived",
          label: "Show archived",
          type: "boolean",
          default: false,
        },
      ],
    });

    const registry = createModuleRegistry([definition]);
    expect(registry.listRoutes()).toHaveLength(2);
    expect(registry.getEntityType("project")?.moduleId).toBe("projects");
    expect(
      registry.getEntityLinkType("project.supporting_note")?.sourceLabel,
    ).toBe("supported by");
    expect(registry.getActivityType("project.completed")?.label).toBe(
      "Project completed",
    );
    expect(registry.getCommand("projects.create")?.shortcut?.modifiers).toEqual(
      ["mod", "shift"],
    );
    expect(registry.getSearchProvider("projects.search")?.entityTypes).toEqual([
      "project",
    ]);
    expect(registry.getSetting("projects.default_view")?.moduleId).toBe(
      "projects",
    );
  });

  describe("module ids", () => {
    it("accepts documented slug forms", () => {
      for (const id of [
        "projects",
        "notes",
        "meetings",
        "people",
        "day-diary",
      ]) {
        expect(isModuleId(id)).toBe(true);
      }
    });

    it.each([
      ["empty", ""],
      ["whitespace", "my module"],
      ["uppercase", "Projects"],
      ["leading digit", "1projects"],
      ["path traversal", "../notes"],
      ["slash", "a/b"],
      ["dot", "day.diary"],
      ["underscore", "day_diary"],
      ["trailing hyphen", "projects-"],
      ["double hyphen", "day--diary"],
    ])("rejects an invalid module id (%s)", (_label, id) => {
      expect(() => parseModuleId(id)).toThrow(ModuleDefinitionError);
      expect(() =>
        createModuleRegistry([
          defineModule({ id, name: "X" } as ModuleDefinition),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a module id that exceeds the maximum length", () => {
      expect(() => parseModuleId("a".repeat(65))).toThrow(
        ModuleDefinitionError,
      );
    });
  });

  describe("malformed capability descriptors", () => {
    it("rejects a command id not namespaced under the module", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            commands: [
              {
                id: "projects.create",
                title: "X",
                kind: "execute",
                run: () => ({ ok: true }),
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route with neither path nor index", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [{ id: "notes.x", file: "routes/index.tsx" } as never],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route path containing a query string", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [
              {
                id: "notes.x",
                path: "notes?q=1",
                file: "routes/index.tsx",
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route path with a traversal segment", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [
              {
                id: "notes.x",
                path: "notes/../secrets",
                file: "routes/index.tsx",
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route without a file reference", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [{ id: "notes.x", path: "x" } as never],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects an absolute route file reference", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [{ id: "notes.x", path: "x", file: "/etc/passwd.ts" }],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route file reference that traverses outside the module", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [
              { id: "notes.x", path: "x", file: "../areas/routes/index.tsx" },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a route file reference without a compilable extension", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            routes: [{ id: "notes.x", path: "x", file: "routes/index.md" }],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("accepts a nested, module-relative route file reference", () => {
      const registry = createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.x", path: "x", file: "routes/nested/detail.tsx" },
          ],
        }),
      ]);
      expect(registry.getRoute("notes.x")?.file).toBe(
        "routes/nested/detail.tsx",
      );
    });

    it("rejects a non-function command handler", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            commands: [
              { id: "notes.x", title: "X", kind: "execute", run: 5 as never },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });
  });

  describe("setting default/type matching", () => {
    it("rejects a boolean setting whose default is not a boolean", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            settings: [
              {
                key: "notes.flag",
                label: "Flag",
                type: "boolean",
                default: "yes" as never,
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects an enum default that is not one of the options", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            settings: [
              {
                key: "notes.view",
                label: "View",
                type: "enum",
                options: [{ value: "a", label: "A" }],
                default: "b",
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects a number default outside its bounds", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            settings: [
              {
                key: "notes.count",
                label: "Count",
                type: "number",
                default: 20,
                min: 0,
                max: 10,
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });
  });

  describe("reused kernel identifier validators", () => {
    it("rejects an invalid EntityLink type via the existing validator", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            entityLinkTypes: [
              { type: "Not A Link", sourceLabel: "x" } as never,
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects an invalid Activity type via the existing validator", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            activityTypes: [{ type: "NOPE", label: "x" } as never],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });

    it("rejects an invalid entity type via the existing validator", () => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            entityTypes: [{ type: "Bad Type", singular: "X" } as never],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    });
  });

  describe("kernel-reserved activity types", () => {
    it.each([
      "entity.created",
      "entity.updated",
      "entity.deleted",
      "entity.restored",
      "entity_link.created",
      "entity_link.unlinked",
      "entity_link.restored",
    ])("rejects a module claiming the reserved type %s", (type) => {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "notes",
            name: "Notes",
            activityTypes: [{ type, label: "Reserved" }],
          }),
        ]),
      ).toThrow(ReservedActivityTypeError);
    });
  });

  it("does not throw a duplicate error for a single valid module", () => {
    expect(() =>
      createModuleRegistry([defineModule({ id: "notes", name: "Notes" })]),
    ).not.toThrow(DuplicateContributionError);
  });
});
