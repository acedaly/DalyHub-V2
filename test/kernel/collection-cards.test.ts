import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  makeAreaRepository,
  makeAreaSettingsRepository,
  makeContext,
  makeProjectRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * Gate D — the facts the Area and Project ENTITY CARDS render, read from real D1.
 *
 * Two claims are under test, and both are claims the cards would otherwise make
 * dishonestly:
 *
 * 1. **The icon key reaches the COLLECTION.** PR #121 wired `icon_key` into the
 *    record loaders only, so a Project could show its chosen icon on its own page
 *    and a generic glyph in the grid it was listed in. The key now travels with
 *    the same grouped query that returns the row — no second read, no N+1 — and
 *    is normalised on the way OUT, so a stored key this build no longer knows
 *    degrades to the entity default instead of reaching a component that cannot
 *    draw it.
 *
 * 2. **Every count is EXACT, not page-derived.** The cards state active Projects,
 *    open Goals, open Tasks and a completion percentage. Each is a workspace-wide
 *    aggregate computed in SQL; none of them is a count of the rows the current
 *    page happened to load. The pagination cases below are the ones that would
 *    catch a regression to page-derived arithmetic, because that is exactly the
 *    mistake that reads correctly on page one.
 */

const WS = "test-default-workspace";
const OTHER = "ws_cards_other";

function spine(ws: string, prefix = "cc") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    activityIdGenerator: sequentialIds(`${prefix}act`),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Areas collection — icon keys", () => {
  it("returns the chosen key for one Area and null for its sibling", async () => {
    const s = spine(WS);
    const withIcon = await s.createArea({ title: "Health" });
    const plain = await s.createArea({ title: "Career" });
    await makeAreaSettingsRepository(makeContext(WS)).setIcon(
      withIcon.id,
      "shield",
    );

    const page = await makeAreaRepository(makeContext(WS)).listAreas();
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withIcon.id)?.iconKey).toBe("shield");
    // The FALLBACK path: an Area that never chose one carries `null`, which is
    // what makes `RecordIcon` render the Area default rather than nothing.
    expect(byId.get(plain.id)?.iconKey).toBeNull();
  });

  it("degrades a stored key this build does not recognise to null", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Legacy" });
    // Written under the repository, as a key removed from the vocabulary in a
    // later release (or restored from an older export) would be.
    await env.DB.prepare(
      `INSERT INTO area_details (workspace_id, entity_id, entity_type, icon_key, updated_at)
       VALUES (?, ?, 'area', 'unicorn', '2026-08-01T00:00:00.000Z')
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET icon_key = excluded.icon_key`,
    )
      .bind(WS, area.id)
      .run();

    const page = await makeAreaRepository(makeContext(WS)).listAreas();
    expect(page.items[0]?.iconKey).toBeNull();
  });

  it("never leaks another workspace's Area or its icon", async () => {
    const mine = spine(WS, "mine");
    const theirs = spine(OTHER, "theirs");
    const ours = await mine.createArea({ title: "Ours" });
    const hidden = await theirs.createArea({ title: "Theirs" });
    await makeAreaSettingsRepository(makeContext(WS)).setIcon(
      ours.id,
      "shield",
    );
    await makeAreaSettingsRepository(makeContext(OTHER)).setIcon(
      hidden.id,
      "travel",
    );

    const page = await makeAreaRepository(makeContext(WS)).listAreas();
    expect(page.items.map((item) => item.id)).toEqual([ours.id]);
    expect(page.items[0]?.iconKey).toBe("shield");
  });
});

describe("Areas collection — exact aggregates", () => {
  it("counts active Projects, open Goals and open Tasks exactly", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const openGoal = await s.createGoal({ title: "Ship v2", areaId: area.id });
    const doneGoal = await s.createGoal({ title: "Ship v1", areaId: area.id });
    const active = await s.createProject({
      title: "Active work",
      parent: { kind: "area", id: area.id },
    });
    const completed = await s.createProject({
      title: "Finished work",
      parent: { kind: "area", id: area.id },
    });
    const archived = await s.createProject({
      title: "Archived work",
      parent: { kind: "goal", id: openGoal.id },
    });
    await s.createTask({
      title: "Open direct task",
      parent: { kind: "area", id: area.id },
    });
    const doneTask = await s.createTask({
      title: "Done project task",
      parent: { kind: "project", id: active.id },
    });
    await s.createTask({
      title: "Open project task",
      parent: { kind: "project", id: active.id },
    });
    await s.complete(doneGoal.id);
    await s.complete(completed.id);
    await s.complete(doneTask.id);
    await makeProjectSettingsRepository(makeContext(WS)).archive(archived.id);

    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    // Active = neither complete nor archived: 3 Projects, one completed, one
    // archived, so exactly one is active.
    expect(item.activeProjectCount).toBe(1);
    expect(item.rollup.projects).toMatchObject({ total: 3, completed: 1 });
    // Open Goals = total minus completed.
    expect(item.rollup.goals).toMatchObject({ total: 2, completed: 1 });
    // Tasks roll up direct Area tasks AND Project tasks: 3 total, 1 complete.
    expect(item.rollup.tasks).toMatchObject({ total: 3, completed: 1 });
  });

  /*
   * ARCHIVED PROJECTS AND THE AREA TASK ROLL-UP.
   *
   * Archival is reversible and is NOT soft-deletion (ADR-037 §37.1), but it is
   * out of the ordinary active-work buckets everywhere else in the product:
   * `listProjects` excludes archived Projects from "all", and
   * `activeProjectCount` excludes them too. The Area TASK roll-up did not — it
   * swept in every task under every aligned Project regardless of archival.
   *
   * What that did and did not cause, established by probing the real domain
   * rather than assumed:
   *
   *   - It could NOT make an Area report OPEN tasks from an archived Project.
   *     Two independent guards stop that state existing at all, and both are
   *     asserted below: a Project with unfinished tasks cannot be archived
   *     (`ProjectArchiveBlockedError`), and a task under an archived Project
   *     cannot be reopened (`SpineParentUnavailableError`).
   *   - It DID keep an archived Project's COMPLETED tasks in the Area's
   *     total and completed counts, so an Area whose only Project had been
   *     put away still carried that Project's finished work in its roll-up.
   *
   * The semantics now, and what each case below pins down:
   *   - Tasks parented DIRECTLY to the Area always count.
   *   - Tasks under NON-archived Projects count, whatever their workflow
   *     status (planned, active, on-hold) and whether or not they are complete.
   *   - Tasks under archived Projects count for NOTHING, and they leave WHOLE
   *     — completed ones with open ones — so archival can never skew a ratio.
   *   - Archiving one Project touches nothing else.
   */
  it("refuses to archive a Project that still has unfinished tasks", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Guarded" });
    const project = await s.createProject({
      title: "Still going",
      parent: { kind: "area", id: area.id },
    });
    await s.createTask({
      title: "Unfinished",
      parent: { kind: "project", id: project.id },
    });

    // The FIRST guard: this is why an Area can never report open tasks that
    // live inside an archived Project.
    await expect(
      makeProjectSettingsRepository(makeContext(WS)).archive(project.id),
    ).rejects.toThrow(/unfinished tasks/i);

    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    expect(item.rollup.tasks).toMatchObject({ total: 1, completed: 0 });
    expect(item.activeProjectCount).toBe(1);
  });

  it("refuses to reopen a task inside an archived Project", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Guarded" });
    const project = await s.createProject({
      title: "Put away",
      parent: { kind: "area", id: area.id },
    });
    const task = await s.createTask({
      title: "Done",
      parent: { kind: "project", id: project.id },
    });
    await s.complete(task.id);
    await makeProjectSettingsRepository(makeContext(WS)).archive(project.id);

    // The SECOND guard: an archived Project is read-only, so a completed task
    // inside it cannot become open again while it is archived.
    await expect(s.reopen(task.id)).rejects.toThrow(/archived and read-only/i);
  });

  it("drops an archived Project's completed tasks out of the Area roll-up", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Wound down" });
    const project = await s.createProject({
      title: "Shelved work",
      parent: { kind: "area", id: area.id },
    });
    // Archiving REQUIRES every task to be finished, so this is the only shape
    // an archived Project can actually have.
    const done = await s.createTask({
      title: "Already done",
      parent: { kind: "project", id: project.id },
    });
    const alsoDone = await s.createTask({
      title: "Also done",
      parent: { kind: "project", id: project.id },
    });
    await s.complete(done.id);
    await s.complete(alsoDone.id);

    const repo = makeAreaRepository(makeContext(WS));
    const before = (await repo.listAreas()).items[0]!;
    expect(before.rollup.tasks).toMatchObject({ total: 2, completed: 2 });
    expect(before.activeProjectCount).toBe(1);

    await makeProjectSettingsRepository(makeContext(WS)).archive(project.id);

    const after = (await repo.listAreas()).items[0]!;
    // Both tasks leave together. A partial exclusion would have left
    // `total: 2, completed: 0` and reported an Area as 0% complete the moment
    // its finished work was put away.
    expect(after.rollup.tasks).toMatchObject({ total: 0, completed: 0 });
    expect(after.activeProjectCount).toBe(0);
    // The Project itself is still part of the Area's body of work, so the
    // PROJECT roll-up deliberately still counts it.
    expect(after.rollup.projects).toMatchObject({ total: 1, completed: 0 });
  });

  it("still reports a direct Area task when the Area's only Project is archived", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Home" });
    const project = await s.createProject({
      title: "Shelved work",
      parent: { kind: "area", id: area.id },
    });
    const projectTask = await s.createTask({
      title: "Hidden by archival",
      parent: { kind: "project", id: project.id },
    });
    await s.complete(projectTask.id);
    await s.createTask({
      title: "Loose task",
      parent: { kind: "area", id: area.id },
    });
    await makeProjectSettingsRepository(makeContext(WS)).archive(project.id);

    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    // A task attached to the AREA belongs to the Area, and no Project's
    // lifecycle can hide it. Exactly one task survives: the loose one.
    expect(item.rollup.tasks).toMatchObject({ total: 1, completed: 0 });
  });

  it("still reports tasks under active, planned and on-hold Projects", async () => {
    const s = spine(WS);
    const settings = makeProjectSettingsRepository(makeContext(WS));
    const area = await s.createArea({ title: "Career" });
    const planned = await s.createProject({
      title: "Planned",
      parent: { kind: "area", id: area.id },
    });
    const active = await s.createProject({
      title: "Active",
      parent: { kind: "area", id: area.id },
    });
    const onHold = await s.createProject({
      title: "On hold",
      parent: { kind: "area", id: area.id },
    });
    await settings.setStatus(active.id, "active");
    await settings.setStatus(onHold.id, "on_hold");
    for (const project of [planned, active, onHold]) {
      await s.createTask({
        title: `Task in ${project.id}`,
        parent: { kind: "project", id: project.id },
      });
    }

    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    // Only ARCHIVAL removes a Project's tasks — workflow status does not.
    expect(item.rollup.tasks).toMatchObject({ total: 3, completed: 0 });
    expect(item.activeProjectCount).toBe(3);
  });

  it("archiving one Project leaves every other Area and Project untouched", async () => {
    const s = spine(WS);
    const first = await s.createArea({ title: "First" });
    const second = await s.createArea({ title: "Second" });
    const archiveMe = await s.createProject({
      title: "Archive me",
      parent: { kind: "area", id: first.id },
    });
    const sibling = await s.createProject({
      title: "Sibling in the same Area",
      parent: { kind: "area", id: first.id },
    });
    const elsewhere = await s.createProject({
      title: "Different Area",
      parent: { kind: "area", id: second.id },
    });
    const doomed = await s.createTask({
      title: "Doomed",
      parent: { kind: "project", id: archiveMe.id },
    });
    // Archiving requires every task finished, so this one has to be completed
    // before the Project can be put away.
    await s.complete(doomed.id);
    await s.createTask({
      title: "Sibling task",
      parent: { kind: "project", id: sibling.id },
    });
    await s.createTask({
      title: "Other area task",
      parent: { kind: "project", id: elsewhere.id },
    });

    const areaRepo = makeAreaRepository(makeContext(WS));
    const projectRepo = makeProjectRepository(makeContext(WS));
    await makeProjectSettingsRepository(makeContext(WS)).archive(archiveMe.id);

    const areas = new Map(
      (await areaRepo.listAreas()).items.map((item) => [item.id, item]),
    );
    // The archived Project's own Area loses only ITS task.
    expect(areas.get(first.id)?.rollup.tasks).toMatchObject({
      total: 1,
      completed: 0,
    });
    expect(areas.get(first.id)?.activeProjectCount).toBe(1);
    // The unrelated Area is completely unaffected.
    expect(areas.get(second.id)?.rollup.tasks).toMatchObject({
      total: 1,
      completed: 0,
    });
    expect(areas.get(second.id)?.activeProjectCount).toBe(1);

    // And no other Project's own roll-up moved.
    const projects = new Map(
      (await projectRepo.listProjects({ state: "all" })).items.map((item) => [
        item.id,
        item,
      ]),
    );
    expect(projects.get(sibling.id)).toMatchObject({
      taskTotal: 1,
      taskCompleted: 0,
    });
    expect(projects.get(elsewhere.id)).toMatchObject({
      taskTotal: 1,
      taskCompleted: 0,
    });
    // The archived Project keeps its own task count on its own card.
    const archived = await projectRepo.listProjects({ state: "archived" });
    expect(archived.items[0]).toMatchObject({
      id: archiveMe.id,
      taskTotal: 1,
    });
  });

  it("reports zeroes for an Area with nothing in it", async () => {
    const s = spine(WS);
    await s.createArea({ title: "Empty" });
    const item = (await makeAreaRepository(makeContext(WS)).listAreas())
      .items[0]!;
    expect(item.activeProjectCount).toBe(0);
    expect(item.rollup.goals).toMatchObject({ total: 0, completed: 0 });
    expect(item.rollup.projects).toMatchObject({ total: 0, completed: 0 });
    expect(item.rollup.tasks).toMatchObject({ total: 0, completed: 0 });
  });

  it("keeps an Area's counts identical whichever page it arrives on", async () => {
    const s = spine(WS);
    // Two Areas, so the second only appears on page two at limit 1. Its counts
    // must be the same there as they are in an unpaginated read — the failure
    // this catches is arithmetic derived from the loaded page.
    await s.createArea({ title: "First" });
    const second = await s.createArea({ title: "Second" });
    const project = await s.createProject({
      title: "Work",
      parent: { kind: "area", id: second.id },
    });
    await s.createTask({
      title: "Task one",
      parent: { kind: "project", id: project.id },
    });
    await s.createTask({
      title: "Task two",
      parent: { kind: "project", id: project.id },
    });

    const repo = makeAreaRepository(makeContext(WS));
    const whole = await repo.listAreas();
    const firstPage = await repo.listAreas({ limit: 1 });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await repo.listAreas({
      limit: 1,
      cursor: firstPage.nextCursor!,
    });

    const paged = secondPage.items[0]!;
    const unpaged = whole.items.find((item) => item.id === second.id)!;
    expect(paged.rollup.tasks).toEqual(unpaged.rollup.tasks);
    expect(paged.activeProjectCount).toBe(unpaged.activeProjectCount);
    expect(paged.activeProjectCount).toBe(1);
    expect(paged.rollup.tasks).toMatchObject({ total: 2, completed: 0 });
  });
});

describe("Projects collection — icon keys and inherited Area accent", () => {
  it("returns the chosen key for one Project and null for its sibling", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const withIcon = await s.createProject({
      title: "Website relaunch",
      parent: { kind: "area", id: area.id },
    });
    const plain = await s.createProject({
      title: "Launch checklist",
      parent: { kind: "area", id: area.id },
    });
    await makeProjectSettingsRepository(makeContext(WS)).setIcon(
      withIcon.id,
      "travel",
    );

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withIcon.id)?.iconKey).toBe("travel");
    expect(byId.get(plain.id)?.iconKey).toBeNull();
  });

  it("degrades a stored key this build does not recognise to null", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Legacy",
      parent: { kind: "area", id: area.id },
    });
    await env.DB.prepare(
      `UPDATE project_details SET icon_key = 'unicorn'
       WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, project.id)
      .run();

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    expect(page.items[0]?.iconKey).toBeNull();
  });

  it("inherits the Area's rank directly and through a Goal, and null without one", async () => {
    const s = spine(WS);
    // Two Areas, so the ranks differ and a shared constant would not pass.
    const first = await s.createArea({ title: "First area" });
    const second = await s.createArea({ title: "Second area" });
    const goal = await s.createGoal({
      title: "Ship it",
      areaId: second.id,
    });
    const direct = await s.createProject({
      title: "Direct",
      parent: { kind: "area", id: first.id },
    });
    const viaGoal = await s.createProject({
      title: "Via goal",
      parent: { kind: "goal", id: goal.id },
    });

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    const byId = new Map(page.items.map((item) => [item.id, item]));
    // Ranks are 0-based over `(created_at, id)` across EVERY Area row.
    expect(byId.get(direct.id)?.areaColourRank).toBe(0);
    expect(byId.get(direct.id)?.area?.title).toBe("First area");
    // A goal-advancing Project resolves its Area THROUGH the Goal, and the
    // accent follows the same resolution — so the tint and the label beside it
    // can never name different Areas.
    expect(byId.get(viaGoal.id)?.areaColourRank).toBe(1);
    expect(byId.get(viaGoal.id)?.area?.title).toBe("Second area");
    expect(byId.get(viaGoal.id)?.goal?.title).toBe("Ship it");
  });

  it("never leaks another workspace's Project, icon or rank", async () => {
    const mine = spine(WS, "mine");
    const theirs = spine(OTHER, "theirs");
    const myArea = await mine.createArea({ title: "Ours" });
    const theirArea = await theirs.createArea({ title: "Theirs" });
    const ours = await mine.createProject({
      title: "Our project",
      parent: { kind: "area", id: myArea.id },
    });
    const hidden = await theirs.createProject({
      title: "Their project",
      parent: { kind: "area", id: theirArea.id },
    });
    await makeProjectSettingsRepository(makeContext(OTHER)).setIcon(
      hidden.id,
      "travel",
    );

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    expect(page.items.map((item) => item.id)).toEqual([ours.id]);
    // The rank window is workspace-scoped too: our only Area is rank 0, even
    // though another workspace has an older one.
    expect(page.items[0]?.areaColourRank).toBe(0);
  });
});

describe("Projects collection — exact progress", () => {
  it("reports zero, partial and complete roll-ups exactly", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const empty = await s.createProject({
      title: "Nothing planned",
      parent: { kind: "area", id: area.id },
    });
    const partial = await s.createProject({
      title: "Partly done",
      parent: { kind: "area", id: area.id },
    });
    const full = await s.createProject({
      title: "All done",
      parent: { kind: "area", id: area.id },
    });
    const partialDone = await s.createTask({
      title: "Done",
      parent: { kind: "project", id: partial.id },
    });
    await s.createTask({
      title: "Not done",
      parent: { kind: "project", id: partial.id },
    });
    const fullDone = await s.createTask({
      title: "Also done",
      parent: { kind: "project", id: full.id },
    });
    await s.complete(partialDone.id);
    await s.complete(fullDone.id);

    const page = await makeProjectRepository(makeContext(WS)).listProjects();
    const byId = new Map(page.items.map((item) => [item.id, item]));
    // Zero tasks is 0/0 — the view presents this as "No tasks yet", never 0%
    // (which would read as "nothing done" rather than "nothing planned") and
    // never 100% (which an empty denominator could otherwise produce).
    expect(byId.get(empty.id)).toMatchObject({
      taskTotal: 0,
      taskCompleted: 0,
    });
    expect(byId.get(partial.id)).toMatchObject({
      taskTotal: 2,
      taskCompleted: 1,
    });
    expect(byId.get(full.id)).toMatchObject({ taskTotal: 1, taskCompleted: 1 });
  });

  it("keeps a Project's task totals identical whichever page it arrives on", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    await s.createProject({
      title: "First",
      parent: { kind: "area", id: area.id },
    });
    const second = await s.createProject({
      title: "Second",
      parent: { kind: "area", id: area.id },
    });
    for (let i = 0; i < 3; i += 1) {
      const task = await s.createTask({
        title: `Task ${i}`,
        parent: { kind: "project", id: second.id },
      });
      if (i === 0) await s.complete(task.id);
    }

    const repo = makeProjectRepository(makeContext(WS));
    const firstPage = await repo.listProjects({ limit: 1 });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await repo.listProjects({
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    // 3 of 3 tasks are counted for a Project that arrived on page two of a
    // one-per-page read — the totals are the Project's, not the page's.
    expect(secondPage.items[0]).toMatchObject({
      id: second.id,
      taskTotal: 3,
      taskCompleted: 1,
    });
  });

  it("excludes archived Projects from the ordinary buckets and finds them in their own", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const open = await s.createProject({
      title: "Open one",
      parent: { kind: "area", id: area.id },
    });
    const archived = await s.createProject({
      title: "Archived one",
      parent: { kind: "area", id: area.id },
    });
    await makeProjectSettingsRepository(makeContext(WS)).archive(archived.id);

    const repo = makeProjectRepository(makeContext(WS));
    expect((await repo.listProjects({ state: "all" })).items.map((p) => p.id)) //
      .toEqual([open.id]);
    expect(
      (await repo.listProjects({ state: "open" })).items.map((p) => p.id),
    ).toEqual([open.id]);
    const archivedPage = await repo.listProjects({ state: "archived" });
    expect(archivedPage.items.map((p) => p.id)).toEqual([archived.id]);
    // The archived row still carries every card fact, so the Archived segment
    // renders real cards rather than degraded ones.
    expect(archivedPage.items[0]?.archivedAt).not.toBeNull();
    expect(archivedPage.items[0]?.area?.title).toBe("Career");
    expect(archivedPage.items[0]?.areaColourRank).toBe(0);
  });

  it("keeps a completed Project's roll-up and Area context intact", async () => {
    const s = spine(WS);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Shipped",
      parent: { kind: "area", id: area.id },
    });
    const task = await s.createTask({
      title: "The only task",
      parent: { kind: "project", id: project.id },
    });
    await s.complete(task.id);
    await s.complete(project.id);

    const page = await makeProjectRepository(makeContext(WS)).listProjects({
      state: "completed",
    });
    expect(page.items[0]).toMatchObject({
      id: project.id,
      taskTotal: 1,
      taskCompleted: 1,
      areaColourRank: 0,
    });
    expect(page.items[0]?.completedAt).not.toBeNull();
  });
});
