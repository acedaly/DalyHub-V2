import { describe, expect, it } from "vitest";

import { workspaceContextFromId } from "~/kernel/workspaces";
import type { SearchRuntimeContext } from "~/kernel/modules";
import { todaySearchProvider } from "~/modules/today/search";
import todayModule from "~/modules/today/module";
import { TODAY_FIXTURE } from "~/modules/today/fixtures";

const context: SearchRuntimeContext = {
  workspace: workspaceContextFromId("today-search-test"),
  signal: new AbortController().signal,
};

async function run(query: string, limit = 20) {
  return todaySearchProvider.search({ text: query, limit }, context);
}

describe("today search provider", () => {
  it("is registered in the Today module manifest", () => {
    expect(todayModule.searchProviders).toBeDefined();
    expect(todayModule.searchProviders?.[0]?.id).toBe("today.search");
  });

  it("finds a focus task and targets its existing Drawer key on /today", async () => {
    const results = await run("PX-02");
    const finish = results.find((r) => r.title === "Finish PX-02");
    expect(finish).toBeDefined();
    expect(finish?.entityType).toBe("task");
    expect(finish?.target).toEqual({
      kind: "drawer",
      drawerKey: "task:t-px02",
      canonicalPath: "/today",
    });
  });

  it("finds a project, a note and a meeting across the fixtures", async () => {
    const project = (await run("DalyHub")).find(
      (r) => r.entityType === "project",
    );
    expect(project?.target).toMatchObject({ drawerKey: "project:p-dalyhub" });

    const note = (await run("Standup notes")).find(
      (r) => r.entityType === "note",
    );
    expect(note?.target).toMatchObject({ drawerKey: "note:n-standup" });

    const meeting = (await run("Design standup")).find(
      (r) => r.entityType === "meeting",
    );
    expect(meeting?.target).toMatchObject({ drawerKey: "upcoming:u-standup" });
  });

  it("maps reminders and deadlines to the task identity (UPCOMING_KIND)", async () => {
    const reminder = (await run("Water the plants"))[0];
    expect(reminder?.entityType).toBe("task");
    expect(reminder?.target).toMatchObject({ drawerKey: "upcoming:u-water" });
  });

  it("does not duplicate fixture records and excludes non-openable timeline entries", async () => {
    const all = await run("", 100);
    // Empty query still returns all candidates here (the orchestrator gates empty
    // queries upstream); assert the candidate set has no timeline ids.
    const openable =
      TODAY_FIXTURE.focus.length +
      TODAY_FIXTURE.upcoming.length +
      TODAY_FIXTURE.projects.length +
      TODAY_FIXTURE.notes.length;
    const ids = new Set(all.map((r) => r.id));
    expect(ids.size).toBe(all.length); // no duplicates
    expect(all.length).toBeLessThanOrEqual(openable);
    expect(all.some((r) => r.id.startsWith("timeline"))).toBe(false);
  });

  it("honours the per-provider limit", async () => {
    const limited = await run("", 2);
    expect(limited.length).toBeLessThanOrEqual(2);
  });
});
