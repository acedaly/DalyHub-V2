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
    // four spine module manifests, TODAY-01 adds the Today view module, and
    // PX-03 adds nine navigation-shell placeholder modules (Notes, Diary,
    // Meetings, People, Assets, Reviews, AI, Settings, Help) — so it now resolves
    // to exactly those fourteen, discovered automatically, with NO central
    // module array to edit.
    it("transforms the production glob and discovers every module manifest", () => {
      expect(
        discoverModuleDefinitions()
          .map((d) => d.id)
          .sort(),
      ).toEqual([
        "about",
        "ai",
        "areas",
        "assets",
        "diary",
        "goals",
        "help",
        "meetings",
        "notes",
        "people",
        "projects",
        "reviews",
        "settings",
        "tasks",
        "today",
      ]);
    });

    it("assembles a valid registry with the spine capability metadata", () => {
      const registry = discoverModuleRegistry();
      // Today (order 5) sorts ahead of the four spine modules (order 10–40),
      // which sort ahead of PX-03's placeholder modules (order 100–310, grouped
      // capture/insight/system as declared in their manifests).
      expect(registry.listModules().map((m) => m.id)).toEqual([
        "today",
        "areas",
        "goals",
        "projects",
        "tasks",
        "notes",
        "diary",
        "meetings",
        "people",
        "assets",
        "reviews",
        "ai",
        "settings",
        "help",
        "about",
      ]);
      // Entity types are owned by exactly one module each.
      expect(registry.getEntityType("area")?.moduleId).toBe("areas");
      expect(registry.getEntityType("goal")?.moduleId).toBe("goals");
      expect(registry.getEntityType("project")?.moduleId).toBe("projects");
      expect(registry.getEntityType("task")?.moduleId).toBe("tasks");
      // PX-03's placeholder modules pre-register their future entity types too
      // (AI/Settings/Help declare none, like Today — see their manifests).
      expect(registry.getEntityType("note")?.moduleId).toBe("notes");
      expect(registry.getEntityType("diary")?.moduleId).toBe("diary");
      expect(registry.getEntityType("meeting")?.moduleId).toBe("meetings");
      expect(registry.getEntityType("person")?.moduleId).toBe("people");
      expect(registry.getEntityType("asset")?.moduleId).toBe("assets");
      expect(registry.getEntityType("review")?.moduleId).toBe("reviews");
      // Structural link + completion activity metadata is registered.
      expect(
        registry.getEntityLinkType("task.belongs_to_project")?.moduleId,
      ).toBe("tasks");
      expect(registry.getActivityType("project.completed")?.moduleId).toBe(
        "projects",
      );
      // NOTES-01A registers the Note-owned content Activity event.
      expect(registry.getActivityType("note.content_updated")?.moduleId).toBe(
        "notes",
      );
      // FND-09 adds one navigable placeholder route per spine module, and PX-03
      // adds one per navigation-shell module, all composed automatically from
      // the manifests (no central route list). DS-09 adds Today's two
      // navigation commands.
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
        // TODAY-08 adds the workspace-wide Recent Activity feed endpoint (no nav).
        {
          id: "today.activity",
          moduleId: "today",
          file: "routes/activity.tsx",
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
        // AREA-02 adds the canonical Goal record page and its create/mutate/
        // activity resource routes.
        { id: "goals.new", moduleId: "goals", file: "routes/new.tsx" },
        { id: "goals.detail", moduleId: "goals", file: "routes/detail.tsx" },
        // DEBT-22 adds the Goal contributing-Projects pagination resource route.
        {
          id: "goals.projects",
          moduleId: "goals",
          file: "routes/projects.tsx",
        },
        { id: "goals.mutate", moduleId: "goals", file: "routes/mutate.tsx" },
        {
          id: "goals.activity",
          moduleId: "goals",
          file: "routes/activity.tsx",
        },
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
        // PROJ-03 project Knowledge resource route (linked Notes).
        {
          id: "projects.knowledge",
          moduleId: "projects",
          file: "routes/knowledge.tsx",
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
        // TASKS-01 workspace resource routes (static segments before the dynamic id).
        { id: "tasks.new", moduleId: "tasks", file: "routes/new.tsx" },
        { id: "tasks.bulk", moduleId: "tasks", file: "routes/bulk.tsx" },
        {
          id: "tasks.parent_options",
          moduleId: "tasks",
          file: "routes/parent-options.tsx",
        },
        // TASKS-03 adds the saved-view mutation endpoint (no nav entry).
        { id: "tasks.views", moduleId: "tasks", file: "routes/views.tsx" },
        // TASKS-04 adds Review Inbox — the triage flow over the built-in Inbox query.
        { id: "tasks.review", moduleId: "tasks", file: "routes/review.tsx" },
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
        // PX-03 — one navigable Coming Soon placeholder route per shell module,
        // in module-registration order. NOTES-01B replaced the Notes
        // placeholder with the real collection/create/canonical-record/
        // mutation/activity routes.
        { id: "notes.index", moduleId: "notes", file: "routes/index.tsx" },
        { id: "notes.new", moduleId: "notes", file: "routes/new.tsx" },
        {
          id: "notes.resolve",
          moduleId: "notes",
          file: "routes/resolve.tsx",
        },
        {
          id: "notes.detail",
          moduleId: "notes",
          file: "routes/detail.tsx",
        },
        {
          id: "notes.mutate",
          moduleId: "notes",
          file: "routes/mutate.tsx",
        },
        {
          id: "notes.activity",
          moduleId: "notes",
          file: "routes/activity.tsx",
        },
        // NOTES-02 backlink/outgoing-link pagination resource route.
        {
          id: "notes.references",
          moduleId: "notes",
          file: "routes/references.tsx",
        },
        // NOTES-06 single-note export resource route.
        {
          id: "notes.export",
          moduleId: "notes",
          file: "routes/export.tsx",
        },
        { id: "diary.index", moduleId: "diary", file: "routes/index.tsx" },
        { id: "diary.new", moduleId: "diary", file: "routes/new.tsx" },
        { id: "diary.entry", moduleId: "diary", file: "routes/entry.tsx" },
        { id: "diary.mutate", moduleId: "diary", file: "routes/mutate.tsx" },
        {
          id: "meetings.index",
          moduleId: "meetings",
          file: "routes/index.tsx",
        },
        {
          id: "meetings.upcoming",
          moduleId: "meetings",
          file: "routes/upcoming.tsx",
        },
        {
          id: "meetings.recent",
          moduleId: "meetings",
          file: "routes/recent.tsx",
        },
        {
          id: "meetings.archived",
          moduleId: "meetings",
          file: "routes/archived.tsx",
        },
        { id: "meetings.new", moduleId: "meetings", file: "routes/new.tsx" },
        {
          id: "meetings.create",
          moduleId: "meetings",
          file: "routes/create.tsx",
        },
        {
          id: "meetings.attendee_options",
          moduleId: "meetings",
          file: "routes/attendee-options.tsx",
        },
        {
          id: "meetings.detail",
          moduleId: "meetings",
          file: "routes/detail.tsx",
        },
        {
          id: "meetings.mutate",
          moduleId: "meetings",
          file: "routes/mutate.tsx",
        },
        {
          id: "meetings.follow_up",
          moduleId: "meetings",
          file: "routes/follow-up.tsx",
        },
        {
          id: "meetings.activity",
          moduleId: "meetings",
          file: "routes/activity.tsx",
        },
        { id: "people.index", moduleId: "people", file: "routes/index.tsx" },
        {
          id: "people.recent",
          moduleId: "people",
          file: "routes/recent.tsx",
        },
        {
          id: "people.archived",
          moduleId: "people",
          file: "routes/archived.tsx",
        },
        { id: "people.new", moduleId: "people", file: "routes/new.tsx" },
        {
          id: "people.create",
          moduleId: "people",
          file: "routes/create.tsx",
        },
        {
          id: "people.detail",
          moduleId: "people",
          file: "routes/detail.tsx",
        },
        {
          id: "people.mutate",
          moduleId: "people",
          file: "routes/mutate.tsx",
        },
        {
          id: "people.activity",
          moduleId: "people",
          file: "routes/activity.tsx",
        },
        // ASSET-01 adds the collection + its date-driven sub-views, the create/
        // record/mutate/activity resource routes (only the index carries a nav
        // entry; the sub-views are reached from the collection's view switcher).
        { id: "assets.index", moduleId: "assets", file: "routes/index.tsx" },
        { id: "assets.recent", moduleId: "assets", file: "routes/recent.tsx" },
        {
          id: "assets.expiring",
          moduleId: "assets",
          file: "routes/expiring.tsx",
        },
        {
          id: "assets.service_due",
          moduleId: "assets",
          file: "routes/service-due.tsx",
        },
        {
          id: "assets.archived",
          moduleId: "assets",
          file: "routes/archived.tsx",
        },
        { id: "assets.new", moduleId: "assets", file: "routes/new.tsx" },
        { id: "assets.create", moduleId: "assets", file: "routes/create.tsx" },
        { id: "assets.detail", moduleId: "assets", file: "routes/detail.tsx" },
        { id: "assets.mutate", moduleId: "assets", file: "routes/mutate.tsx" },
        {
          id: "assets.activity",
          moduleId: "assets",
          file: "routes/activity.tsx",
        },
        // ASSET-02 adds the history + obligations resource route (no nav entry).
        {
          id: "assets.history",
          moduleId: "assets",
          file: "routes/history.tsx",
        },
        {
          id: "reviews.index",
          moduleId: "reviews",
          file: "routes/index.tsx",
        },
        {
          id: "reviews.new",
          moduleId: "reviews",
          file: "routes/new.tsx",
        },
        {
          id: "reviews.detail",
          moduleId: "reviews",
          file: "routes/detail.tsx",
        },
        // REVIEW-02: the guided weekly flow — a second presentation of the SAME
        // Review record at a stable sub-path, not a second record.
        {
          id: "reviews.guide",
          moduleId: "reviews",
          file: "routes/guide.tsx",
        },
        {
          id: "reviews.mutate",
          moduleId: "reviews",
          file: "routes/mutate.tsx",
        },
        {
          id: "reviews.activity",
          moduleId: "reviews",
          file: "routes/activity.tsx",
        },
        { id: "ai.index", moduleId: "ai", file: "routes/index.tsx" },
        // AI-01 — two resource routes with no navigation entry: the one place an
        // AI request is made, and the one place a reviewed proposal is applied.
        { id: "ai.assist", moduleId: "ai", file: "routes/assist.tsx" },
        { id: "ai.apply", moduleId: "ai", file: "routes/apply.tsx" },
        {
          id: "settings.index",
          moduleId: "settings",
          file: "routes/index.tsx",
        },
        // X-04 adds the two workspace-export downloads as one resource route
        // (`settings/export/:format`). It has no nav entry — it returns a file,
        // not a page — and is reached from Settings → Privacy & data.
        {
          id: "settings.export",
          moduleId: "settings",
          file: "routes/export.tsx",
        },
        { id: "help.index", moduleId: "help", file: "routes/index.tsx" },
        { id: "about.index", moduleId: "about", file: "routes/index.tsx" },
      ]);
      // DS-09: Today registers registry-discovered navigation commands; TODAY-03
      // adds "Open Waiting". TASKS-01 adds the Tasks module's navigation commands.
      // PEOPLE-01 adds the People module's navigation commands; REVIEWS-01 adds
      // Reviews navigation/create commands. V2.0.1 closes the palette gap for the
      // four modules that registered none: Areas, Goals, Projects and Diary.
      expect(registry.listCommands().map((c) => c.id)).toEqual([
        "today.open",
        "today.focus_quick_capture",
        "today.open_waiting",
        // V2.0.1 navigation commands, in module order (Areas 10 → Goals 20 →
        // Projects 30) ahead of Tasks at 40. Goals contributes NO create
        // command on purpose: a Goal is created from an Area record (the only
        // surface that hosts `NewGoalForm`), so a workspace-level "New Goal"
        // would be a command for something the product cannot do.
        "areas.open",
        "areas.new",
        "goals.open",
        "projects.open",
        "projects.new",
        "tasks.open",
        "tasks.new",
        // TASKS-04 adds the Inbox view and its triage flow to the palette.
        "tasks.inbox",
        "tasks.review_inbox",
        "tasks.this_week",
        "tasks.matrix",
        "tasks.sectors",
        "tasks.someday",
        // NOTES-03 navigation commands (open / new / recent / unlinked /
        // archived) — Notes sorts after Tasks by the module order.
        "notes.open",
        "notes.new",
        "notes.recent",
        "notes.unlinked",
        "notes.archived",
        // V2.0.1 Diary commands (module order 110, between Notes and Meetings):
        // the Timeline, today's day view, and Inspector-deep-linked capture.
        "diary.open",
        "diary.today",
        "diary.capture",
        "meetings.open",
        "meetings.new",
        "meetings.search",
        "people.open",
        "people.new",
        "people.search",
        "people.recent",
        "people.archived",
        // ASSET-01 navigation commands (open / new / expiring / service-due /
        // archived), ordered after People by the module order.
        "assets.open",
        "assets.new",
        "assets.expiring",
        "assets.service_due",
        "assets.archived",
        "reviews.open",
        "reviews.new",
        "settings.open",
        "settings.date_time",
      ]);
      expect(registry.listCommands().every((c) => c.kind === "navigate")).toBe(
        true,
      );
      expect(registry.getCommand("today.open")?.moduleId).toBe("today");
      expect(registry.listSettings()).toEqual([]);
      // Global Search is repository-backed across shipped record modules. Today is
      // a derived dashboard and intentionally registers no provider.
      const searchProviders = registry.listSearchProviders();
      expect(searchProviders.map((provider) => provider.id)).toEqual([
        "areas.search",
        "goals.search",
        "projects.search",
        "tasks.search",
        // NOTES-03 closes the DEBT-36 gap for Notes: full-content search over
        // title, Markdown body, headings and tags.
        "notes.search",
        "diary.search",
        "meetings.search",
        "people.search",
        "assets.search",
        "reviews.search",
      ]);
      expect(
        searchProviders.some((provider) => provider.moduleId === "today"),
      ).toBe(false);
    });
  });
});
