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
    // proving the mechanism works under the actual toolchain. FND-07 adds the
    // four spine module manifests and TODAY-01 adds the Today view module, so it
    // now resolves to exactly those five — discovered automatically, with NO
    // central module array to edit.
    it("transforms the production glob and discovers every module manifest", () => {
      expect(
        discoverModuleDefinitions()
          .map((d) => d.id)
          .sort(),
      ).toEqual(["areas", "goals", "projects", "tasks", "today"]);
    });

    it("assembles a valid registry with the spine capability metadata", () => {
      const registry = discoverModuleRegistry();
      // Today (order 5) sorts ahead of the four spine modules (order 10–40).
      expect(registry.listModules().map((m) => m.id)).toEqual([
        "today",
        "areas",
        "goals",
        "projects",
        "tasks",
      ]);
      // Entity types are owned by exactly one module each.
      expect(registry.getEntityType("area")?.moduleId).toBe("areas");
      expect(registry.getEntityType("goal")?.moduleId).toBe("goals");
      expect(registry.getEntityType("project")?.moduleId).toBe("projects");
      expect(registry.getEntityType("task")?.moduleId).toBe("tasks");
      // Structural link + completion activity metadata is registered.
      expect(
        registry.getEntityLinkType("task.belongs_to_project")?.moduleId,
      ).toBe("tasks");
      expect(registry.getActivityType("project.completed")?.moduleId).toBe(
        "projects",
      );
      // FND-09 adds one navigable placeholder route per spine module, composed
      // automatically from the manifests (no central route list). Settings remain
      // out of scope; DS-09 adds Today's two navigation commands.
      expect(
        registry
          .listRoutes()
          .map((r) => ({ id: r.id, moduleId: r.moduleId, file: r.file })),
      ).toEqual([
        { id: "today.index", moduleId: "today", file: "routes/index.tsx" },
        // TODAY-03 adds the Waiting sub-view (no nav entry — reached from Today).
        {
          id: "today.waiting",
          moduleId: "today",
          file: "routes/waiting.tsx",
        },
        // TODAY-04 adds the planning endpoint (bulk/quick plan action, no nav).
        {
          id: "today.plan",
          moduleId: "today",
          file: "routes/plan.tsx",
        },
        { id: "areas.index", moduleId: "areas", file: "routes/index.tsx" },
        { id: "areas.new", moduleId: "areas", file: "routes/new.tsx" },
        {
          id: "areas.detail",
          moduleId: "areas",
          file: "routes/detail.tsx",
        },
        {
          id: "areas.mutate",
          moduleId: "areas",
          file: "routes/mutate.tsx",
        },
        {
          id: "areas.activity",
          moduleId: "areas",
          file: "routes/activity.tsx",
        },
        { id: "goals.index", moduleId: "goals", file: "routes/index.tsx" },
        // PROJ-01 adds the collection + record page routes and the create/mutate/
        // link-target resource routes.
        {
          id: "projects.index",
          moduleId: "projects",
          file: "routes/index.tsx",
        },
        {
          id: "projects.new",
          moduleId: "projects",
          file: "routes/new.tsx",
        },
        {
          id: "projects.detail",
          moduleId: "projects",
          file: "routes/detail.tsx",
        },
        {
          id: "projects.mutate",
          moduleId: "projects",
          file: "routes/mutate.tsx",
        },
        {
          id: "projects.link_targets",
          moduleId: "projects",
          file: "routes/link-targets.tsx",
        },
        // PROJ-01 pagination + searchable parent picker resource routes.
        {
          id: "projects.tasks",
          moduleId: "projects",
          file: "routes/tasks.tsx",
        },
        // PROJ-04 project Activity Timeline resource route.
        {
          id: "projects.activity",
          moduleId: "projects",
          file: "routes/activity.tsx",
        },
        {
          id: "projects.parent_options",
          moduleId: "projects",
          file: "routes/parent-options.tsx",
        },
        { id: "tasks.index", moduleId: "tasks", file: "routes/index.tsx" },
        // PROJ-01 / ADR-033 re-homed the task record resource routes to the Tasks
        // module (previously `today.task*`): the task Drawer's data endpoint, its
        // Activity Timeline page, the link-target search and the waiting-target
        // search. The shared TaskRecordDrawer opens them from any surface.
        {
          id: "tasks.record",
          moduleId: "tasks",
          file: "routes/task-detail.tsx",
        },
        {
          id: "tasks.record.activity",
          moduleId: "tasks",
          file: "routes/task-activity.tsx",
        },
        {
          id: "tasks.record.link_targets",
          moduleId: "tasks",
          file: "routes/task-link-targets.tsx",
        },
        {
          id: "tasks.record.waiting_targets",
          moduleId: "tasks",
          file: "routes/task-waiting-targets.tsx",
        },
      ]);
      // DS-09: Today registers registry-discovered navigation commands; TODAY-03
      // adds "Open Waiting".
      expect(registry.listCommands().map((c) => c.id)).toEqual([
        "today.open",
        "today.focus_quick_capture",
        "today.open_waiting",
      ]);
      expect(registry.listCommands().every((c) => c.kind === "navigate")).toBe(
        true,
      );
      expect(registry.getCommand("today.open")?.moduleId).toBe("today");
      expect(registry.listSettings()).toEqual([]);
      // TODAY-01's fixture-backed search provider (DS-08) is the first
      // registry-discovered search contribution; ownership is retained.
      const searchProviders = registry.listSearchProviders();
      expect(searchProviders.map((provider) => provider.id)).toEqual([
        "today.search",
      ]);
      expect(searchProviders[0]?.moduleId).toBe("today");
    });
  });
});
