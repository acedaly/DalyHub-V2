import { describe, expect, it } from "vitest";

import {
  createModuleRegistry,
  defineModule,
  type ModuleDefinition,
} from "~/kernel/modules";

describe("registry behaviour", () => {
  it("supports an empty registry", () => {
    const registry = createModuleRegistry([]);
    expect(registry.listModules()).toEqual([]);
    expect(registry.listRoutes()).toEqual([]);
    expect(registry.listCommands()).toEqual([]);
    expect(registry.getModule("anything")).toBeNull();
  });

  it("orders modules deterministically regardless of input order", () => {
    const alpha = defineModule({ id: "alpha", name: "Alpha", order: 2 });
    const beta = defineModule({ id: "beta", name: "Beta", order: 1 });
    const gamma = defineModule({ id: "gamma", name: "Gamma" }); // no order → last
    const delta = defineModule({ id: "delta", name: "Delta" }); // no order → last

    const forward = createModuleRegistry([alpha, beta, gamma, delta]);
    const shuffled = createModuleRegistry([delta, gamma, beta, alpha]);

    const expected = ["beta", "alpha", "delta", "gamma"];
    expect(forward.listModules().map((m) => m.id)).toEqual(expected);
    expect(shuffled.listModules().map((m) => m.id)).toEqual(expected);
  });

  it("orders contributions by module order, then authored order", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "second",
        name: "Second",
        order: 2,
        commands: [{ id: "second.a", title: "A", run: () => {} }],
      }),
      defineModule({
        id: "first",
        name: "First",
        order: 1,
        commands: [
          { id: "first.b", title: "B", run: () => {} },
          { id: "first.a", title: "A", run: () => {} },
        ],
      }),
    ]);
    expect(registry.listCommands().map((c) => c.id)).toEqual([
      "first.b",
      "first.a",
      "second.a",
    ]);
  });

  it("looks up items by stable id and retains ownership", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "notes",
        name: "Notes",
        entityTypes: [{ type: "note", singular: "Note" }],
        commands: [{ id: "notes.capture", title: "Capture", run: () => {} }],
      }),
    ]);
    expect(registry.getEntityType("note")?.moduleId).toBe("notes");
    expect(registry.getCommand("notes.capture")?.moduleId).toBe("notes");
  });

  it("returns null for unknown lookups (consistent behaviour)", () => {
    const registry = createModuleRegistry([
      defineModule({ id: "notes", name: "Notes" }),
    ]);
    expect(registry.getModule("missing")).toBeNull();
    expect(registry.getRoute("missing")).toBeNull();
    expect(registry.getEntityType("missing")).toBeNull();
    expect(registry.getEntityLinkType("missing")).toBeNull();
    expect(registry.getActivityType("missing")).toBeNull();
    expect(registry.getCommand("missing")).toBeNull();
    expect(registry.getSearchProvider("missing")).toBeNull();
    expect(registry.getSetting("missing")).toBeNull();
  });

  it("fails deterministically on the same duplicate regardless of input order", () => {
    const a = defineModule({
      id: "alpha",
      name: "Alpha",
      entityTypes: [{ type: "thing", singular: "Thing" }],
    });
    const b = defineModule({
      id: "beta",
      name: "Beta",
      entityTypes: [{ type: "thing", singular: "Thing" }],
    });
    const message1 = messageOf(() => createModuleRegistry([a, b]));
    const message2 = messageOf(() => createModuleRegistry([b, a]));
    // Sorted-order collision detection makes alpha the "first" owner both times.
    expect(message1).toBe(message2);
    expect(message1).toContain("alpha");
  });

  describe("immutability", () => {
    it("freezes returned list arrays", () => {
      const registry = createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          entityTypes: [{ type: "note", singular: "Note" }],
        }),
      ]);
      const list = registry.listEntityTypes();
      expect(Object.isFrozen(list)).toBe(true);
      expect(() => {
        (list as unknown as { push: (v: unknown) => void }).push({});
      }).toThrow();
    });

    it("freezes nested contribution objects", () => {
      const registry = createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          entityTypes: [{ type: "note", singular: "Note" }],
        }),
      ]);
      const entityType = registry.getEntityType("note");
      expect(entityType).not.toBeNull();
      expect(() => {
        (entityType as unknown as { singular: string }).singular = "Hacked";
      }).toThrow();
    });

    it("is unaffected by mutating the source manifest after construction", () => {
      const routes: ModuleDefinition["routes"] = [
        { id: "notes.a", path: "a", file: "routes/index.tsx" },
      ];
      const definition: ModuleDefinition = {
        id: "notes",
        name: "Notes",
        entityTypes: [{ type: "note", singular: "Note" }],
        routes,
      };
      const registry = createModuleRegistry([definition]);

      // Mutate the original manifest every way a caller might try.
      (definition as { name: string }).name = "Hacked";
      (
        definition.entityTypes as unknown as { push: (v: unknown) => void }
      ).push({ type: "sneaky", singular: "Sneaky" });
      (
        definition.entityTypes as unknown as { singular: string }[]
      )[0].singular = "Hacked";
      (routes as unknown as { push: (v: unknown) => void }).push({
        id: "notes.b",
        path: "b",
        file: "routes/index.tsx",
      });

      expect(registry.getModule("notes")?.name).toBe("Notes");
      expect(registry.listEntityTypes()).toHaveLength(1);
      expect(registry.getEntityType("note")?.singular).toBe("Note");
      expect(registry.getEntityType("sneaky")).toBeNull();
      expect(registry.listRoutes()).toHaveLength(1);
    });

    it("returns the registry object itself frozen (no registration after sealing)", () => {
      const registry = createModuleRegistry([]);
      expect(Object.isFrozen(registry)).toBe(true);
      expect(() => {
        (registry as unknown as { listModules: unknown }).listModules =
          () => [];
      }).toThrow();
    });
  });
});

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the function to throw, but it did not");
}
