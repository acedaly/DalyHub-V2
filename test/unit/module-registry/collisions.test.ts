import { describe, expect, it } from "vitest";

import {
  createModuleRegistry,
  defineModule,
  DuplicateContributionError,
  DuplicateModuleError,
  RoutePathConflictError,
  RouteParentError,
  type ContributionKind,
} from "~/kernel/modules";

describe("registry collision detection", () => {
  it("rejects a duplicate module id", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({ id: "notes", name: "Notes" }),
        defineModule({ id: "notes", name: "Notes Again" }),
      ]),
    ).toThrow(DuplicateModuleError);
  });

  it("rejects a duplicate route id within one module", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.x", path: "x", file: "routes/index.tsx" },
            { id: "notes.x", path: "y", file: "routes/index.tsx" },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe<ContributionKind>(
      "route",
    );
  });

  it("rejects a conflicting route path under the same parent", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.a", path: "shared", file: "routes/index.tsx" },
            { id: "notes.b", path: "shared", file: "routes/index.tsx" },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(RoutePathConflictError);
  });

  it("allows the same path under different parents", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.p1", path: "p1", file: "routes/index.tsx" },
            { id: "notes.p2", path: "p2", file: "routes/index.tsx" },
            {
              id: "notes.c1",
              path: "child",
              parentId: "notes.p1",
              file: "routes/index.tsx",
            },
            {
              id: "notes.c2",
              path: "child",
              parentId: "notes.p2",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it("rejects two index routes under the same parent", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.i1", index: true, file: "routes/index.tsx" },
            { id: "notes.i2", index: true, file: "routes/index.tsx" },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(RoutePathConflictError);
  });

  it("rejects an unresolved route parent", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            {
              id: "notes.child",
              path: "child",
              parentId: "notes.missing",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("unresolved");
  });

  it("rejects a route parent cycle (A → B → A)", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            {
              id: "notes.a",
              path: "a",
              parentId: "notes.b",
              file: "routes/index.tsx",
            },
            {
              id: "notes.b",
              path: "b",
              parentId: "notes.a",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("cycle");
  });

  it("rejects a longer route parent cycle (A → B → C → A)", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            {
              id: "notes.a",
              path: "a",
              parentId: "notes.c",
              file: "routes/index.tsx",
            },
            {
              id: "notes.b",
              path: "b",
              parentId: "notes.a",
              file: "routes/index.tsx",
            },
            {
              id: "notes.c",
              path: "c",
              parentId: "notes.b",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(RouteParentError);
    expect((error as RouteParentError).reason).toBe("cycle");
  });

  it("accepts a valid deep same-module parent chain (no cycle)", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          routes: [
            { id: "notes.a", path: "a", file: "routes/index.tsx" },
            {
              id: "notes.b",
              path: "b",
              parentId: "notes.a",
              file: "routes/index.tsx",
            },
            {
              id: "notes.c",
              path: "c",
              parentId: "notes.b",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it("rejects a cross-module route parent", () => {
    // A parent id must be namespaced under the declaring module, so a
    // cross-module parent reference cannot even be authored — it is rejected at
    // qualified-id validation. This proves cross-module parenting is unsupported.
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({ id: "alpha", name: "Alpha" }),
        defineModule({
          id: "beta",
          name: "Beta",
          routes: [
            {
              id: "beta.child",
              path: "child",
              parentId: "alpha.root",
              file: "routes/index.tsx",
            },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(Error);
  });

  it("rejects a duplicate entity type across modules", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "alpha",
          name: "Alpha",
          entityTypes: [{ type: "thing", singular: "Thing" }],
        }),
        defineModule({
          id: "beta",
          name: "Beta",
          entityTypes: [{ type: "thing", singular: "Thing" }],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("entity_type");
    expect((error as DuplicateContributionError).firstModuleId).toBe("alpha");
    expect((error as DuplicateContributionError).secondModuleId).toBe("beta");
  });

  it("rejects a duplicate EntityLink type across modules", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "alpha",
          name: "Alpha",
          entityLinkTypes: [{ type: "a.rel", sourceLabel: "x" }],
        }),
        defineModule({
          id: "beta",
          name: "Beta",
          entityLinkTypes: [{ type: "a.rel", sourceLabel: "y" }],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("entity_link_type");
  });

  it("rejects a duplicate Activity type across modules", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "alpha",
          name: "Alpha",
          activityTypes: [{ type: "a.happened", label: "x" }],
        }),
        defineModule({
          id: "beta",
          name: "Beta",
          activityTypes: [{ type: "a.happened", label: "y" }],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("activity_type");
  });

  it("rejects a duplicate command id within a module", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          commands: [
            {
              id: "notes.go",
              title: "Go",
              kind: "navigate",
              target: { kind: "route", to: "/notes" },
            },
            {
              id: "notes.go",
              title: "Go again",
              kind: "navigate",
              target: { kind: "route", to: "/notes/again" },
            },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("command");
  });

  it("rejects a duplicate search-provider id within a module", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          searchProviders: [
            { id: "notes.s", label: "S", search: async () => [] },
            { id: "notes.s", label: "S2", search: async () => [] },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("search_provider");
  });

  it("rejects a duplicate setting key within a module", () => {
    const error = captureError(() =>
      createModuleRegistry([
        defineModule({
          id: "notes",
          name: "Notes",
          settings: [
            { key: "notes.k", label: "K", type: "boolean", default: true },
            { key: "notes.k", label: "K2", type: "boolean", default: false },
          ],
        }),
      ]),
    );
    expect(error).toBeInstanceOf(DuplicateContributionError);
    expect((error as DuplicateContributionError).kind).toBe("setting");
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
