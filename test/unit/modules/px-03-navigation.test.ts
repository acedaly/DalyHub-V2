/**
 * PX-03 — the nine navigation-shell placeholder modules wire into the
 * registry-driven sidebar with the intended grouping and ordering.
 *
 * Mirrors TODAY-01's `today-navigation.test.ts`: proves the manifest → registry →
 * navigation flow for each new module without editing any central list, and proves
 * the "capture" / "insight" / "system" grouping the recommended sidebar structure
 * asks for is actually carried through to the navigation model.
 */

import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "~/kernel/modules";
import aiModule from "~/modules/ai/module";
import areasModule from "~/modules/areas/module";
import assetsModule from "~/modules/assets/module";
import diaryModule from "~/modules/diary/module";
import goalsModule from "~/modules/goals/module";
import helpModule from "~/modules/help/module";
import meetingsModule from "~/modules/meetings/module";
import notesModule from "~/modules/notes/module";
import peopleModule from "~/modules/people/module";
import projectsModule from "~/modules/projects/module";
import reviewsModule from "~/modules/reviews/module";
import settingsModule from "~/modules/settings/module";
import tasksModule from "~/modules/tasks/module";
import todayModule from "~/modules/today/module";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";

const ALL_MODULES = [
  todayModule,
  areasModule,
  goalsModule,
  projectsModule,
  tasksModule,
  notesModule,
  diaryModule,
  meetingsModule,
  peopleModule,
  assetsModule,
  reviewsModule,
  aiModule,
  settingsModule,
  helpModule,
];

function navigation() {
  const registry = createModuleRegistry(ALL_MODULES);
  return buildNavigationModel(
    registry.listRoutes(),
    (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
  );
}

describe("PX-03 navigation shells", () => {
  it("registers a navigable route for every new module, after the spine modules", () => {
    const nav = navigation();
    const ids = nav.map((item) => item.id);
    expect(ids).toEqual([
      "today.index",
      "areas.index",
      "goals.index",
      "projects.index",
      "tasks.index",
      "notes.index",
      "diary.index",
      "meetings.index",
      "people.index",
      "assets.index",
      "reviews.index",
      "ai.index",
      "settings.index",
      "help.index",
    ]);
  });

  it("groups Notes/Diary/Meetings/People/Assets under 'capture'", () => {
    const nav = navigation();
    const captureLabels = nav
      .filter((item) => item.group === "capture")
      .map((item) => item.label);
    expect(captureLabels).toEqual([
      "Notes",
      "Diary",
      "Meetings",
      "People",
      "Assets",
    ]);
  });

  it("groups Reviews/AI under 'insight'", () => {
    const nav = navigation();
    const insightLabels = nav
      .filter((item) => item.group === "insight")
      .map((item) => item.label);
    expect(insightLabels).toEqual(["Reviews", "AI"]);
  });

  it("groups Settings/Help under 'system', last", () => {
    const nav = navigation();
    const systemLabels = nav
      .filter((item) => item.group === "system")
      .map((item) => item.label);
    expect(systemLabels).toEqual(["Settings", "Help"]);
    // The system group is the final group in the sidebar.
    expect(nav[nav.length - 1]?.label).toBe("Help");
  });

  it("the existing spine + Today rows remain ungrouped (no visual change to them)", () => {
    const nav = navigation();
    for (const label of ["Today", "Areas", "Goals", "Projects", "Tasks"]) {
      const item = nav.find((entry) => entry.label === label);
      expect(item?.group).toBeUndefined();
    }
  });

  it("derives the real entity-identity icon for entity-bearing modules", () => {
    const nav = navigation();
    const byLabel = new Map(nav.map((item) => [item.label, item]));
    expect(byLabel.get("Notes")?.entityType).toBe("note");
    expect(byLabel.get("Diary")?.entityType).toBe("diary");
    expect(byLabel.get("Meetings")?.entityType).toBe("meeting");
    expect(byLabel.get("People")?.entityType).toBe("person");
    expect(byLabel.get("Assets")?.entityType).toBe("asset");
    expect(byLabel.get("Reviews")?.entityType).toBe("review");
  });

  it("falls back to the generic glyph for AI/Settings/Help (no entity type, like Today)", () => {
    const nav = navigation();
    const byLabel = new Map(nav.map((item) => [item.label, item]));
    expect(byLabel.get("AI")?.entityType).toBeUndefined();
    expect(byLabel.get("Settings")?.entityType).toBeUndefined();
    expect(byLabel.get("Help")?.entityType).toBeUndefined();
    expect(byLabel.get("Today")?.entityType).toBeUndefined();
  });

  it("resolves every new module's href to its expected path", () => {
    const nav = navigation();
    const byLabel = new Map(nav.map((item) => [item.label, item.href]));
    expect(byLabel.get("Notes")).toBe("/notes");
    expect(byLabel.get("Diary")).toBe("/diary");
    expect(byLabel.get("Meetings")).toBe("/meetings");
    expect(byLabel.get("People")).toBe("/people");
    expect(byLabel.get("Assets")).toBe("/assets");
    expect(byLabel.get("Reviews")).toBe("/reviews");
    expect(byLabel.get("AI")).toBe("/ai");
    expect(byLabel.get("Settings")).toBe("/settings");
    expect(byLabel.get("Help")).toBe("/help");
  });
});
