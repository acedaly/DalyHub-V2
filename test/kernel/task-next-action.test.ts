/**
 * STEER-04 — the ONE next-action rule, against real D1.
 *
 * ADR-111 decision 4 says there is one rule in the product; these tests are what
 * makes that enforceable rather than aspirational:
 *
 *   - **Parity.** The repository's ranked statement and the pure kernel rule
 *     (`selectNextAction`) are driven over the SAME seeded fact matrix and must
 *     agree, Project by Project — the `GOAL_ALIGNMENT_DISPLAY_RANK` precedent
 *     applied to "next".
 *   - **Parity with the collection.** The answer equals the FIRST row the
 *     canonical `/tasks` read returns for the same Project under the same view,
 *     sort and filters — so Today and `/tasks` cannot disagree about which Task
 *     is next.
 *   - **Exclusions.** Completed, cancelled, on-hold, Someday/Maybe, waiting and
 *     dependency-blocked Tasks are never "next".
 *   - **Flatness.** Six Projects cost what two do: ONE statement, whatever the
 *     workspace holds.
 *   - **Isolation.** Another workspace's Tasks never reach the answer.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  NEXT_ACTION_SORT,
  NEXT_ACTION_VIEW,
  compareNextActionCandidates,
  isNextActionEligible,
  nextActionSortKey,
  selectGoalNextAction,
  selectNextAction,
  type NextActionFacts,
  type TaskRepository,
} from "~/kernel/tasks";
import type {
  D1SpineRepositoryOptions,
  D1TaskRepositoryOptions,
} from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { env } from "cloudflare:test";
import { createTaskRepository } from "~/platform/storage/d1";

const WS = "ws_next_action";
const OTHER = "ws_next_action_other";
const TODAY = "2026-07-25";
const ZONE = "Australia/Brisbane";

const nextEntityId = sequentialIds("na-e");
const nextActivityId = sequentialIds("na-a");

function spineRepo(ws: string, options: D1SpineRepositoryOptions = {}) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

function taskRepo(ws: string, options: D1TaskRepositoryOptions = {}) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
    ...options,
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* The fact matrix                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A workspace whose Projects between them exercise every branch of the rule:
 * priority order, overdue-before-not, due-date order, the absent-priority and
 * absent-due sentinels, every excluded state, and a Project with nothing at all.
 */
async function seedMatrix(ws = WS) {
  const spine = spineRepo(ws);
  const tasks = taskRepo(ws);
  const area = await spine.createArea({ title: `Area ${ws}` });
  const goal = await spine.createGoal({ title: `Goal ${ws}`, areaId: area.id });

  const project = async (title: string, underGoal: boolean) =>
    spine.createProject({
      title,
      parent: underGoal
        ? { kind: "goal", id: goal.id }
        : { kind: "area", id: area.id },
    });

  const make = async (
    projectId: string,
    title: string,
    patch: Record<string, unknown> = {},
  ) => {
    const task = await tasks.createTask({
      title,
      parent: { kind: "project", id: projectId },
    });
    if (Object.keys(patch).length > 0) {
      await tasks.updateTask(task.id, patch);
    }
    return task;
  };

  // 1. Priority decides between two undated Tasks.
  const priorities = await project("Priorities", true);
  await make(priorities.id, "P3 undated", { priority: "p3" });
  await make(priorities.id, "P1 undated", { priority: "p1" });
  await make(priorities.id, "No priority undated", {});

  // 2. Overdue beats a higher priority that is not overdue.
  const overdue = await project("Overdue first", true);
  await make(overdue.id, "P1 due next month", {
    priority: "p1",
    dueDate: "2026-08-30",
  });
  await make(overdue.id, "P4 overdue", {
    priority: "p4",
    dueDate: "2026-07-01",
  });

  // 3. Due-today is NOT overdue; the earlier due date wins inside a priority.
  const dated = await project("Dated", false);
  await make(dated.id, "P2 due today", { priority: "p2", dueDate: TODAY });
  await make(dated.id, "P2 due later", {
    priority: "p2",
    dueDate: "2026-08-02",
  });

  // 4. Every open Task parked or blocked — the honest absence.
  const parked = await project("All parked", true);
  const waiting = await make(parked.id, "Waiting on Sam", { priority: "p1" });
  await tasks.setWaiting(waiting.id, {
    target: { kind: "text", note: "Sam" },
  });
  await make(parked.id, "On hold", { priority: "p1", status: "on_hold" });
  await make(parked.id, "Cancelled", { priority: "p1", status: "cancelled" });
  await make(parked.id, "Someday", {
    priority: "p1",
    commitmentState: "someday",
  });
  const done = await make(parked.id, "Finished", { priority: "p1" });
  await tasks.completeTask(done.id);

  // 5. Dependency-blocked work is never "next".
  const blockedProject = await project("Blocked", true);
  const blocker = await make(blockedProject.id, "Do this first", {
    priority: "p4",
  });
  const blocked = await make(blockedProject.id, "Blocked P1", {
    priority: "p1",
  });
  await tasks.addTaskDependency(blocked.id, blocker.id);

  // 6. A Project with no Tasks at all.
  const empty = await project("Empty", true);

  return {
    tasks,
    goalId: goal.id,
    projectIds: [
      priorities.id,
      overdue.id,
      dated.id,
      parked.id,
      blockedProject.id,
      empty.id,
    ],
    goalProjectIds: [
      priorities.id,
      overdue.id,
      parked.id,
      blockedProject.id,
      empty.id,
    ],
  };
}

/**
 * Every one of a Project's Tasks as the PURE rule's facts, read through the
 * ordinary collection (`view: "all"`, which excludes nothing) plus the blocked
 * summary — so the pure side is driven from the same stored truth the SQL is,
 * and a disagreement is a disagreement about the RULE.
 */
async function pureFacts(
  repo: TaskRepository,
  projectId: string,
): Promise<NextActionFacts[]> {
  const page = await repo.listProjectTasks(projectId, {
    state: "all",
    limit: 100,
  });
  const blocked = await repo.listBlockedSummaries(
    page.items.map((task) => task.id),
  );
  return page.items.map((task) => ({
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    status: task.status,
    commitmentState: task.commitmentState,
    priority: task.priority,
    dueDate: task.dueDate,
    waitingSince: task.waiting?.since ?? null,
    blocked: (blocked.get(task.id)?.blockerCount ?? 0) > 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Parity                                                                      */
/* -------------------------------------------------------------------------- */

describe("the repository and the pure rule cannot disagree", () => {
  it("selects the same next action for every Project in the fact matrix", async () => {
    const { tasks, projectIds } = await seedMatrix();

    const fromSql = await tasks.listProjectNextActions({
      projectIds,
      todayIso: TODAY,
      timezone: ZONE,
    });

    for (const projectId of projectIds) {
      const pure = selectNextAction(await pureFacts(tasks, projectId), TODAY);
      expect({
        projectId,
        next: fromSql.get(projectId)?.id ?? null,
      }).toEqual({ projectId, next: pure?.id ?? null });
    }
    // The matrix is only a proof if it exercises BOTH outcomes: four Projects
    // name a next action, and two honestly name none.
    expect([...fromSql.keys()].length).toBe(4);
    expect(projectIds.length - fromSql.size).toBe(2);
  });

  it("agrees with the canonical /tasks collection read for the same Project", async () => {
    const { tasks, projectIds } = await seedMatrix();
    const fromSql = await tasks.listProjectNextActions({
      projectIds,
      todayIso: TODAY,
      timezone: ZONE,
    });

    for (const projectId of projectIds) {
      const page = await tasks.listWorkspaceTasks({
        view: NEXT_ACTION_VIEW,
        sort: NEXT_ACTION_SORT,
        filters: { projectId, blocked: false },
        limit: 1,
        todayIso: TODAY,
        timezone: ZONE,
      });
      expect({
        projectId,
        next: fromSql.get(projectId)?.id ?? null,
      }).toEqual({ projectId, next: page.items[0]?.id ?? null });
    }
  });

  it("orders by the same smart key the collection sorts by", () => {
    const base = {
      id: "t",
      title: "t",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      completedAt: null,
      status: "todo" as const,
      commitmentState: "active" as const,
      waitingSince: null,
      blocked: false,
    };
    // open|not-overdue|p1|no due
    expect(
      nextActionSortKey({ ...base, priority: "p1", dueDate: null }, TODAY),
    ).toBe("0|1|p1|9999-99-99");
    // overdue leads its priority band
    expect(
      nextActionSortKey(
        { ...base, priority: "p4", dueDate: "2026-07-01" },
        TODAY,
      ),
    ).toBe("0|0|p4|2026-07-01");
    // due TODAY is not overdue
    expect(
      nextActionSortKey({ ...base, priority: "p2", dueDate: TODAY }, TODAY),
    ).toBe("0|1|p2|2026-07-25");
    // an absent priority sorts last, never first
    expect(
      nextActionSortKey({ ...base, priority: null, dueDate: null }, TODAY),
    ).toBe("0|1|p9|9999-99-99");
  });

  it("breaks a total tie deterministically, so 'next' does not move between reads", () => {
    const at = (iso: string) => new Date(iso);
    const shared = {
      title: "t",
      completedAt: null,
      status: "todo" as const,
      commitmentState: "active" as const,
      priority: "p2" as const,
      dueDate: null,
      waitingSince: null,
      blocked: false,
    };
    const earlier = {
      ...shared,
      id: "zzz",
      createdAt: at("2026-07-01T00:00:00.000Z"),
    };
    const later = {
      ...shared,
      id: "aaa",
      createdAt: at("2026-07-02T00:00:00.000Z"),
    };
    expect(compareNextActionCandidates(earlier, later, TODAY)).toBeLessThan(0);
    const sameInstant = { ...later, createdAt: earlier.createdAt };
    // Identical keys AND identical creation instants: the id decides.
    expect(
      compareNextActionCandidates(earlier, sameInstant, TODAY),
    ).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Exclusions                                                                  */
/* -------------------------------------------------------------------------- */

describe("ineligible work is never called 'next'", () => {
  it("excludes completed, cancelled, on-hold, Someday, waiting and blocked Tasks", async () => {
    const { tasks, projectIds } = await seedMatrix();
    const [, , , parked, blockedProject, empty] = projectIds;
    const answers = await tasks.listProjectNextActions({
      projectIds,
      todayIso: TODAY,
      timezone: ZONE,
    });
    // A Project whose every open Task is parked has NO next action.
    expect(answers.get(parked)).toBeUndefined();
    // A Project with no Tasks has none either — and says so the same way.
    expect(answers.get(empty)).toBeUndefined();
    // The blocked P1 loses to its own P4 blocker, which IS actionable.
    expect(answers.get(blockedProject)?.title).toBe("Do this first");
  });

  it("states the same exclusions in the pure rule", () => {
    const base: NextActionFacts = {
      id: "t",
      title: "t",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      completedAt: null,
      status: "todo",
      commitmentState: "active",
      priority: "p1",
      dueDate: null,
      waitingSince: null,
      blocked: false,
    };
    expect(isNextActionEligible(base)).toBe(true);
    expect(isNextActionEligible({ ...base, completedAt: new Date() })).toBe(
      false,
    );
    expect(isNextActionEligible({ ...base, status: "cancelled" })).toBe(false);
    expect(isNextActionEligible({ ...base, status: "on_hold" })).toBe(false);
    expect(isNextActionEligible({ ...base, commitmentState: "someday" })).toBe(
      false,
    );
    expect(isNextActionEligible({ ...base, waitingSince: new Date() })).toBe(
      false,
    );
    expect(isNextActionEligible({ ...base, blocked: true })).toBe(false);
    // Nothing eligible → null. Never a fabricated row.
    expect(selectNextAction([{ ...base, blocked: true }], TODAY)).toBeNull();
    expect(selectNextAction([], TODAY)).toBeNull();
  });

  it("picks the Goal's next step from its contributing Projects by the SAME rule", async () => {
    const { tasks, goalProjectIds } = await seedMatrix();
    const perProject = await tasks.listProjectNextActions({
      projectIds: goalProjectIds,
      todayIso: TODAY,
      timezone: ZONE,
    });
    const candidates: NextActionFacts[] = [];
    for (const projectId of goalProjectIds) {
      const task = perProject.get(projectId);
      if (!task) continue;
      candidates.push({
        id: task.id,
        title: task.title,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        status: task.status,
        commitmentState: task.commitmentState,
        priority: task.priority,
        dueDate: task.dueDate,
        waitingSince: task.waiting?.since ?? null,
        blocked: false,
      });
    }
    // "P4 overdue" beats "P1 undated": overdue is the more significant segment,
    // which is the canonical smart ordering and not a Goal-specific model.
    expect(selectGoalNextAction(candidates, TODAY)?.title).toBe("P4 overdue");
  });
});

/* -------------------------------------------------------------------------- */
/* Flatness and isolation                                                      */
/* -------------------------------------------------------------------------- */

describe("bounds", () => {
  it("costs ONE statement whatever the number of Projects", async () => {
    const { projectIds } = await seedMatrix();
    const counting = countingDb(env.DB);
    const repo = createTaskRepository(counting.db, makeContext(WS));

    counting.reset();
    await repo.listProjectNextActions({
      projectIds: projectIds.slice(0, 2),
      todayIso: TODAY,
      timezone: ZONE,
    });
    const few = counting.prepareCount();

    counting.reset();
    await repo.listProjectNextActions({
      projectIds,
      todayIso: TODAY,
      timezone: ZONE,
    });
    const many = counting.prepareCount();

    expect(few).toBe(1);
    expect(many).toBe(few);
  });

  it("never reaches another workspace's Tasks", async () => {
    const mine = await seedMatrix(WS);
    const theirs = await seedMatrix(OTHER);
    const answers = await mine.tasks.listProjectNextActions({
      // Every id from BOTH workspaces; only this workspace's may answer.
      projectIds: [...mine.projectIds, ...theirs.projectIds],
      todayIso: TODAY,
      timezone: ZONE,
    });
    for (const projectId of theirs.projectIds) {
      expect(answers.get(projectId)).toBeUndefined();
    }
    expect(answers.size).toBe(4);
  });
});
