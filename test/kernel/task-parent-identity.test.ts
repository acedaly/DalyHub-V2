/**
 * TODAY-TASK-01 / DEBT-144 — a task's PARENT has one identity, on every read.
 *
 * The debt's closing condition is that "the same task's parent is the same colour
 * on `/today`, `/tasks` and the Project record", and the honest way to assert
 * that is at the boundary all three go through: every task-LIST read on the
 * repository must return the parent's own stored colour, its own stored glyph and
 * its own derived rank — the exact three inputs `resolveIdentity` walks — and
 * they must be the same three whichever read produced them.
 *
 * The alternative implementations DEBT-144 refused are what these tests pin
 * down. A per-row identity lookup would satisfy a screenshot and cost an N+1; a
 * single surface resolving identity while the others do not would leave a list
 * where some rows carry it and some do not, which reads as a rendering fault.
 * So the assertions are made ACROSS the reads, not inside one of them.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  makeAreaSettingsRepository,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
  FakeClock,
} from "./support";

const WS = "test-default-workspace";

const nextEntityId = sequentialIds("pident");
const nextActivityId = sequentialIds("pidact");

function spineRepo() {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-17T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
  });
}

describe("DEBT-144 — the parent relation carries the parent's identity", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("returns the parent's OWN choices, on every list read, from one query", async () => {
    const spine = spineRepo();
    const area = await spine.createArea({ title: "Home" });
    const project = await spine.createProject({
      title: "Kitchen fit-out",
      parent: { kind: "area", id: area.id },
    });

    // The owner CHOOSES an identity for the Project — the first rung of the
    // resolver's ladder, and the one a derived rank must never override.
    await makeProjectSettingsRepository(makeContext(WS)).setIdentity(
      project.id,
      { iconKey: "target", colourSlot: "rose" },
    );

    const underProject = await spine.createTask({
      title: "Choose the tiles",
      parent: { kind: "project", id: project.id },
    });
    await spine.createTask({
      title: "Pay the deposit",
      parent: { kind: "area", id: area.id },
    });

    const tasks = taskRepo();
    await tasks.updateTask(underProject.id, { dueDate: "2026-08-17" });

    /*
     * The three reads the three surfaces use:
     *
     *   listPlanningTasks    → `/today`
     *   listWorkspaceTasks   → `/tasks`
     *   listProjectTasks     → a Project record's task list
     *
     * All three must agree, because they are all reading the same Project.
     */
    const fromToday = (
      await tasks.listPlanningTasks({ todayIso: "2026-08-17" })
    ).items.find((item) => item.id === underProject.id);
    const fromTasks = (
      await tasks.listWorkspaceTasks({
        todayIso: "2026-08-17",
        timezone: "UTC",
      })
    ).items.find((item) => item.id === underProject.id);
    const fromProject = (await tasks.listProjectTasks(project.id)).items.find(
      (item) => item.id === underProject.id,
    );

    const expected = {
      kind: "project",
      id: project.id,
      title: "Kitchen fit-out",
      colourSlot: "rose",
      iconKey: "target",
      // The Project's own rank — it is the first Project in this workspace —
      // carried even though a chosen slot outranks it, because the resolver
      // walks the ladder rather than the read deciding for it.
      colourRank: 0,
    };
    expect(fromToday?.parent).toEqual(expected);
    expect(fromTasks?.parent).toEqual(expected);
    expect(fromProject?.parent).toEqual(expected);
  });

  it("carries the DERIVED rank when the parent made no choice", async () => {
    const spine = spineRepo();
    const first = await spine.createArea({ title: "Health" });
    const second = await spine.createArea({ title: "Work" });
    const task = await spine.createTask({
      title: "Book the dentist",
      parent: { kind: "area", id: second.id },
    });

    const parent = (
      await taskRepo().listWorkspaceTasks({
        todayIso: "2026-08-17",
        timezone: "UTC",
      })
    ).items.find((item) => item.id === task.id)?.parent;

    // Ranks are 0-based within a TYPE and ordered by creation, which is what
    // makes the derived colour stable across renames, re-sorts and filters.
    expect(parent).toMatchObject({
      id: second.id,
      colourSlot: null,
      iconKey: null,
      colourRank: 1,
    });
    expect(first.id).not.toBe(second.id);
  });

  it("ranks Areas and Projects in SEPARATE sequences", async () => {
    /*
     * The two types are ranked independently — the first Area and the first
     * Project are both rank 0 — because `identityForRank` folds a rank inside
     * its own type. One shared sequence would silently repaint every Project the
     * moment an Area was created, which is the failure the separate
     * `PROJECT_RANKS_CTE` / `AREA_RANKS_CTE` in `d1-project-repository.ts` avoid
     * and which this read must not reintroduce.
     */
    const spine = spineRepo();
    const area = await spine.createArea({ title: "Career" });
    const project = await spine.createProject({
      title: "Ship V2",
      parent: { kind: "area", id: area.id },
    });
    const inArea = await spine.createTask({
      title: "Area task",
      parent: { kind: "area", id: area.id },
    });
    const inProject = await spine.createTask({
      title: "Project task",
      parent: { kind: "project", id: project.id },
    });

    const items = (
      await taskRepo().listWorkspaceTasks({
        todayIso: "2026-08-17",
        timezone: "UTC",
      })
    ).items;
    const rankOf = (id: string) =>
      items.find((item) => item.id === id)?.parent?.colourRank;

    expect(rankOf(inArea.id)).toBe(0);
    expect(rankOf(inProject.id)).toBe(0);
  });

  it("resolves an AREA parent's own stored identity too", async () => {
    const spine = spineRepo();
    const area = await spine.createArea({ title: "Finance" });
    await makeAreaSettingsRepository(makeContext(WS)).setIdentity(area.id, {
      iconKey: "savings",
      colourSlot: "teal",
    });
    const task = await spine.createTask({
      title: "Reconcile the accounts",
      parent: { kind: "area", id: area.id },
    });

    const parent = (
      await taskRepo().listPlanningTasks({ todayIso: "2026-08-17" })
    ).items.find((item) => item.id === task.id)?.parent;

    expect(parent).toMatchObject({
      kind: "area",
      colourSlot: "teal",
      iconKey: "savings",
    });
  });

  it("offers the SAME identity on a parent CANDIDATE as on the relation", async () => {
    /*
     * The inline project editor paints the chosen parent optimistically from the
     * candidate it was handed, so a candidate without identity makes the row's
     * mark flash neutral until the revalidation answers — half a second of
     * exactly the inconsistency this entry refused to ship. The candidate read
     * and the list read therefore resolve identity the same way.
     */
    const spine = spineRepo();
    const area = await spine.createArea({ title: "Home" });
    const project = await spine.createProject({
      title: "Garden",
      parent: { kind: "area", id: area.id },
    });
    await makeProjectSettingsRepository(makeContext(WS)).setIdentity(
      project.id,
      { iconKey: "leaf", colourSlot: "green" },
    );
    const task = await spine.createTask({
      title: "Order the seeds",
      parent: { kind: "project", id: project.id },
    });

    const tasks = taskRepo();
    const candidate = (await tasks.searchTaskParents({ limit: 50 })).find(
      (option) => option.id === project.id,
    );
    const relation = (
      await tasks.listWorkspaceTasks({
        todayIso: "2026-08-17",
        timezone: "UTC",
      })
    ).items.find((item) => item.id === task.id)?.parent;

    expect(candidate).toMatchObject({
      iconKey: "leaf",
      colourSlot: "green",
      colourRank: 0,
    });
    expect(candidate?.colourSlot).toBe(relation?.colourSlot);
    expect(candidate?.iconKey).toBe(relation?.iconKey);
    expect(candidate?.colourRank).toBe(relation?.colourRank);
  });
});
