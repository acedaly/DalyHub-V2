/**
 * PX-03 — the nine navigation-shell placeholder modules wire into the
 * registry-driven sidebar with the intended grouping and ordering.
 *
 * Mirrors TODAY-01's `today-navigation.test.ts`: proves the manifest → registry →
 * navigation flow for each new module without editing any central list, and proves
 * the grouping the sidebar structure asks for is actually carried through to the
 * navigation model.
 *
 * The groups themselves were re-cut against the current visual references: a
 * DAILY block (Today, Inbox, Upcoming, Tasks), an ORGANISE block of the record
 * modules, a MORE block for the secondary surfaces, and SYSTEM last. The earlier
 * "capture" / "insight" cut split Notes from Projects and Analytics from Goals,
 * which is a reasonable taxonomy and not the one the references navigate by.
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
      "tasks.inbox",
      "tasks.upcoming",
      "tasks.index",
      "projects.index",
      "goals.index",
      "areas.index",
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

  it("opens with the DAILY destinations, in the references' order", () => {
    const nav = navigation();
    const daily = nav
      .filter((item) => item.group === "daily")
      .map((item) => item.label);
    expect(daily).toEqual(["Today", "Inbox", "Upcoming", "Tasks"]);
    // And it is genuinely the opening block, not merely present.
    expect(nav.slice(0, 4).map((item) => item.label)).toEqual(daily);
  });

  it("groups the record modules under 'organise'", () => {
    const nav = navigation();
    const organise = nav
      .filter((item) => item.group === "organise")
      .map((item) => item.label);
    expect(organise).toEqual([
      "Projects",
      "Goals",
      "Areas",
      "Notes",
      "Diary",
      "Meetings",
      "People",
    ]);
  });

  it("groups the secondary surfaces under 'more', below Organise", () => {
    // Preserved rather than promoted: these modules stay reachable without
    // contaminating the primary hierarchy the references establish.
    const nav = navigation();
    const more = nav
      .filter((item) => item.group === "more")
      .map((item) => item.label);
    expect(more).toEqual(["Assets", "Reviews", "AI"]);
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

  it("leaves no destination ungrouped", () => {
    // Every row belongs to a block now. An ungrouped row would render between
    // two dividers with no eyebrow, which reads as a rendering fault.
    const nav = navigation();
    for (const item of nav) {
      expect(item.group, item.label).toBeDefined();
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

  it("resolves every new module’s href to its expected path", () => {
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
