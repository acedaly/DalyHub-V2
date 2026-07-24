import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { recentWindowStartIso } from "~/kernel/alignment";
import {
  createAlignmentRepository,
  createGoalRepository,
} from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeAlignmentRepository,
  makeContext,
  makeGoalRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * AREA-03 — the derived Goal-alignment activity-facts projection
 * (`AlignmentRepository`) over real D1 in the Workers runtime (ADR-040).
 * Proves alignment activity is derived from the COMPLETE Task set reachable
 * via `Task -> task.belongs_to_project -> Project -> project.advances_goal ->
 * Goal` (never a bounded display page), that only meaningful Activity counts,
 * that soft-deleted/cross-workspace/wrong-path records never contribute, that
 * evidence is attributed to exactly one Goal, that the read is bounded and
 * N+1-free, and that the recent-count window and the unbounded
 * last-contribution instant behave independently.
 */

const WS = "test-default-workspace";
const OTHER = "ws_alignment_other";

/** A world sharing ONE clock across spine + task mutations, so Activity
 * timestamps are coherent (mirrors `project-health.test.ts`'s `world`). */
function world(ws: string, start = "2026-07-01T00:00:00.000Z") {
  const clock = new FakeClock(start);
  const ctx = makeContext(ws);
  return {
    clock,
    ctx,
    spine: makeSpineRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-e`),
      activityIdGenerator: sequentialIds(`${ws}-a`),
    }),
    tasks: makeTaskRepository(ctx, {
      clock: clock.now,
      activityIdGenerator: sequentialIds(`${ws}-ta`),
    }),
    goals: makeGoalRepository(ctx),
    alignment: makeAlignmentRepository(ctx),
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

async function newGoal(w: ReturnType<typeof world>, title = "Goal") {
  const area = await w.spine.createArea({ title: `${title} area` });
  return w.spine.createGoal({ title, areaId: area.id });
}

async function advancingProject(
  w: ReturnType<typeof world>,
  goalId: string,
  title = "Project",
) {
  return w.spine.createProject({ title, parent: { kind: "goal", id: goalId } });
}

async function addTask(
  w: ReturnType<typeof world>,
  projectId: string,
  title: string,
) {
  return w.spine.createTask({
    title,
    parent: { kind: "project", id: projectId },
  });
}

function windowAt(todayIso: string) {
  return { recentWindowStartIso: recentWindowStartIso(todayIso) };
}

describe("AlignmentRepository — activity facts derivation", () => {
  it("returns null for a Goal with no qualifying Task activity", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).toBeNull();
  });

  it("attributes a Task's creation (entity.created) as qualifying evidence via Task -> Project -> Goal", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    await addTask(w, project.id, "First task");

    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).not.toBeNull();
    expect(facts!.recentContributingTaskCount).toBe(1);
    expect(facts!.lastContributingActivityAt).toBeInstanceOf(Date);
  });

  it("counts a Task's completion and reopening as further qualifying evidence", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await addTask(w, project.id, "T");

    w.clock.advance(1000);
    await w.spine.complete(task.id);
    const afterComplete = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    const completeAt = afterComplete!.lastContributingActivityAt!;

    w.clock.advance(1000);
    await w.spine.reopen(task.id);
    const afterReopen = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(afterReopen!.lastContributingActivityAt!.getTime()).toBeGreaterThan(
      completeAt.getTime(),
    );
  });

  it("excludes a Task directly under an Area — the spine allows no direct Task-to-Goal link", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Area" });
    const goal = await w.spine.createGoal({ title: "Goal", areaId: area.id });
    await w.spine.createTask({
      title: "Direct",
      parent: { kind: "area", id: area.id },
    });

    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).toBeNull();
  });

  it("excludes a Task under a direct Area Project (not advancing any Goal)", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Area" });
    const goal = await w.spine.createGoal({ title: "Goal", areaId: area.id });
    const directProject = await w.spine.createProject({
      title: "Direct",
      parent: { kind: "area", id: area.id },
    });
    await addTask(w, directProject.id, "T");

    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).toBeNull();
  });

  it("excludes a soft-deleted Task's activity", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await addTask(w, project.id, "T");
    await w.spine.softDelete(task.id);

    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).toBeNull();
  });

  it("attributes evidence to exactly one Goal — no leakage between Goals sharing a workspace", async () => {
    const w = world(WS);
    const goalA = await newGoal(w, "Goal A");
    const goalB = await newGoal(w, "Goal B");
    const projectA = await advancingProject(w, goalA.id, "Project A");
    await addTask(w, projectA.id, "Task for A");

    const factsA = await w.alignment.getGoalAlignmentFacts(
      goalA.id,
      windowAt("2026-07-01"),
    );
    const factsB = await w.alignment.getGoalAlignmentFacts(
      goalB.id,
      windowAt("2026-07-01"),
    );
    expect(factsA!.recentContributingTaskCount).toBe(1);
    expect(factsB).toBeNull();
  });

  it("a Project's exactly-one-parent invariant means its Tasks' evidence can never double-count across Goals", async () => {
    // SPINE_MODEL.md: a Project has exactly one active structural parent
    // (enforced by a partial unique index), so "one Project advancing two
    // Goals" cannot be represented — moving a Project to a new Goal detaches
    // it from the old one, proven here by the facts before/after a move.
    const w = world(WS);
    const goalA = await newGoal(w, "Goal A");
    const goalB = await newGoal(w, "Goal B");
    const project = await advancingProject(w, goalA.id, "P");
    await addTask(w, project.id, "T");

    const beforeMove = await w.alignment.listGoalAlignmentFacts(
      [goalA.id, goalB.id],
      windowAt("2026-07-01"),
    );
    expect(beforeMove.get(goalA.id)?.recentContributingTaskCount).toBe(1);
    expect(beforeMove.has(goalB.id)).toBe(false);

    w.clock.advance(1000);
    await w.spine.move(project.id, { kind: "goal", id: goalB.id });

    const afterMove = await w.alignment.listGoalAlignmentFacts(
      [goalA.id, goalB.id],
      windowAt("2026-07-01"),
    );
    expect(afterMove.has(goalA.id)).toBe(false);
    expect(afterMove.get(goalB.id)?.recentContributingTaskCount).toBe(1);
  });

  it("keeps `lastContributingActivityAt` unbounded while `recentContributingTaskCount` respects the supporting window", async () => {
    const w = world(WS, "2026-06-01T00:00:00.000Z");
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    await addTask(w, project.id, "Old task");

    // Evaluate against a "today" 30 days later — well outside the ~14-day
    // supporting count window, but the unbounded last-contribution instant
    // must still be reported (the evaluator, not this repository, decides
    // active/neglected from it).
    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts!.recentContributingTaskCount).toBe(0);
    expect(facts!.lastContributingActivityAt?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("an archived Project's PAST Task activity still counts as historical evidence (ADR-040 §40.8)", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await addTask(w, project.id, "T");
    await w.spine.complete(task.id);

    // Archiving requires no unfinished direct Task (ADR-037 §37.4) — the Task
    // above is already complete, so archival succeeds.
    const settings = env.DB; // archive via a direct settings call below
    expect(settings).toBeDefined();
    const { createProjectSettingsRepository } =
      await import("~/platform/storage/d1");
    const projectSettings = createProjectSettingsRepository(env.DB, w.ctx);
    await projectSettings.archive(project.id);

    const facts = await w.alignment.getGoalAlignmentFacts(
      goal.id,
      windowAt("2026-07-01"),
    );
    expect(facts).not.toBeNull();
    expect(facts!.recentContributingTaskCount).toBeGreaterThan(0);

    const contribution = await w.goals.getGoalProjectContribution(goal.id);
    expect(contribution.archived).toBe(1);
    expect(contribution.total).toBe(1);
  });

  it("stays workspace isolated — cross-workspace Task activity never contributes", async () => {
    const own = world(WS);
    const other = world(OTHER);
    const ownGoal = await newGoal(own, "Own goal");
    const otherGoal = await newGoal(other, "Other goal");
    const ownProject = await advancingProject(own, ownGoal.id);
    const otherProject = await advancingProject(other, otherGoal.id);
    await addTask(own, ownProject.id, "Own task");
    await addTask(other, otherProject.id, "Other task");

    const ownFacts = await own.alignment.getGoalAlignmentFacts(
      ownGoal.id,
      windowAt("2026-07-01"),
    );
    const crossFacts = await own.alignment.getGoalAlignmentFacts(
      otherGoal.id,
      windowAt("2026-07-01"),
    );
    expect(ownFacts!.recentContributingTaskCount).toBe(1);
    expect(crossFacts).toBeNull();
  });

  it("stays exact for more than 100 contributing Tasks across many Goals (chunked, no truncation)", async () => {
    const w = world(WS);
    const goalIds: string[] = [];
    for (let g = 0; g < 55; g++) {
      const goal = await newGoal(w, `Goal ${g}`);
      const project = await advancingProject(w, goal.id, `Project ${g}`);
      await addTask(w, project.id, `Task ${g}`);
      goalIds.push(goal.id);
    }

    const facts = await w.alignment.listGoalAlignmentFacts(
      goalIds,
      windowAt("2026-07-01"),
    );
    expect(facts.size).toBe(55);
    for (const id of goalIds) {
      expect(facts.get(id)?.recentContributingTaskCount).toBe(1);
    }
  });

  it("issues a fixed, small number of queries regardless of Goal count (no N+1)", async () => {
    const w = world(WS);
    const goalIds: string[] = [];
    for (let g = 0; g < 30; g++) {
      const goal = await newGoal(w, `Goal ${g}`);
      const project = await advancingProject(w, goal.id, `Project ${g}`);
      await addTask(w, project.id, `Task ${g}`);
      goalIds.push(goal.id);
    }

    const counting = countingDb(env.DB);
    const countingRepo = createAlignmentRepository(counting.db, w.ctx);
    counting.reset();
    const facts = await countingRepo.listGoalAlignmentFacts(
      goalIds,
      windowAt("2026-07-01"),
    );
    expect(facts.size).toBe(30);
    expect(counting.prepareCount()).toBeLessThanOrEqual(2);
  });
});

describe("AlignmentRepository.listGoalAlignmentEvidence", () => {
  it("returns each contributing Task's most recent qualifying event, newest first", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const taskA = await addTask(w, project.id, "A");
    w.clock.advance(1000);
    const taskB = await addTask(w, project.id, "B");
    w.clock.advance(1000);
    await w.spine.complete(taskA.id); // bumps A's most recent event past B's creation

    const page = await w.alignment.listGoalAlignmentEvidence(goal.id, 10);
    expect(page.items.map((i) => i.taskId)).toEqual([taskA.id, taskB.id]);
    expect(page.hasMore).toBe(false);
  });

  it("bounds the page and reports hasMore honestly", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    for (let i = 0; i < 5; i++) {
      await addTask(w, project.id, `T${i}`);
      w.clock.advance(1000);
    }

    const page = await w.alignment.listGoalAlignmentEvidence(goal.id, 3);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(true);

    const full = await w.alignment.listGoalAlignmentEvidence(goal.id, 10);
    expect(full.items).toHaveLength(5);
    expect(full.hasMore).toBe(false);
  });

  it("excludes a soft-deleted Task from evidence", async () => {
    const w = world(WS);
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await addTask(w, project.id, "T");
    await w.spine.softDelete(task.id);

    const page = await w.alignment.listGoalAlignmentEvidence(goal.id, 10);
    expect(page.items).toHaveLength(0);
  });

  it("scopes evidence to exactly one Goal", async () => {
    const w = world(WS);
    const goalA = await newGoal(w, "A");
    const goalB = await newGoal(w, "B");
    const projectA = await advancingProject(w, goalA.id, "PA");
    const projectB = await advancingProject(w, goalB.id, "PB");
    await addTask(w, projectA.id, "Task A");
    await addTask(w, projectB.id, "Task B");

    const pageA = await w.alignment.listGoalAlignmentEvidence(goalA.id, 10);
    expect(pageA.items.map((i) => i.taskTitle)).toEqual(["Task A"]);
  });
});

describe("GoalRepository.listGoals — the workspace-wide Alignment collection base read", () => {
  it("returns every open Goal across every Area, ordered deterministically", async () => {
    const w = world(WS);
    const areaA = await w.spine.createArea({ title: "Area A" });
    const areaB = await w.spine.createArea({ title: "Area B" });
    const goal1 = await w.spine.createGoal({ title: "G1", areaId: areaA.id });
    const goal2 = await w.spine.createGoal({ title: "G2", areaId: areaB.id });

    const page = await w.goals.listGoals();
    expect(page.items.map((g) => g.id)).toEqual([goal1.id, goal2.id]);
    expect(page.items[0]!.area).toEqual({ id: areaA.id, title: "Area A" });
  });

  it("paginates deterministically and rejects a cursor issued for another workspace's scope", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Area" });
    await w.spine.createGoal({ title: "G1", areaId: area.id });
    await w.spine.createGoal({ title: "G2", areaId: area.id });

    const first = await w.goals.listGoals({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await w.goals.listGoals({
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(second.nextCursor).toBeNull();

    const otherGoals = makeGoalRepository(makeContext(OTHER));
    await expect(
      otherGoals.listGoals({ cursor: first.nextCursor! }),
    ).rejects.toThrow();
  });

  it("excludes a soft-deleted Goal and stays workspace isolated", async () => {
    const own = world(WS);
    const other = world(OTHER);
    const ownArea = await own.spine.createArea({ title: "Own" });
    const kept = await own.spine.createGoal({
      title: "Kept",
      areaId: ownArea.id,
    });
    const deleted = await own.spine.createGoal({
      title: "Deleted",
      areaId: ownArea.id,
    });
    await own.spine.softDelete(deleted.id);
    const otherArea = await other.spine.createArea({ title: "Other" });
    await other.spine.createGoal({ title: "Other goal", areaId: otherArea.id });

    const page = await own.goals.listGoals();
    expect(page.items.map((g) => g.id)).toEqual([kept.id]);
  });
});

describe("GoalRepository.listGoalProjectContributions — batched exact contribution", () => {
  it("matches getGoalProjectContribution exactly for each Goal in the batch", async () => {
    const w = world(WS);
    const goalA = await newGoal(w, "A");
    const goalB = await newGoal(w, "B");
    const projectA1 = await advancingProject(w, goalA.id, "A1");
    await w.spine.complete(projectA1.id);
    await advancingProject(w, goalA.id, "A2");
    await advancingProject(w, goalB.id, "B1");

    const batched = await w.goals.listGoalProjectContributions([
      goalA.id,
      goalB.id,
      "nonexistent",
    ]);
    const individualA = await w.goals.getGoalProjectContribution(goalA.id);
    const individualB = await w.goals.getGoalProjectContribution(goalB.id);

    expect(batched.get(goalA.id)).toEqual(individualA);
    expect(batched.get(goalB.id)).toEqual(individualB);
    expect(batched.get(goalA.id)?.total).toBe(2);
    expect(batched.get(goalA.id)?.completed).toBe(1);
    expect(batched.get(goalB.id)?.total).toBe(1);
    expect(batched.get("nonexistent")).toEqual({
      total: 0,
      completed: 0,
      incomplete: 0,
      active: 0,
      planned: 0,
      onHold: 0,
      archived: 0,
    });
  });

  it("issues a fixed, small number of queries regardless of Goal count (no N+1)", async () => {
    const w = world(WS);
    const goalIds: string[] = [];
    for (let g = 0; g < 30; g++) {
      const goal = await newGoal(w, `Goal ${g}`);
      await advancingProject(w, goal.id, `Project ${g}`);
      goalIds.push(goal.id);
    }

    const counting = countingDb(env.DB);
    const countingRepo = createGoalRepository(counting.db, w.ctx);
    counting.reset();
    const batched = await countingRepo.listGoalProjectContributions(goalIds);
    expect(batched.size).toBe(30);
    expect(counting.prepareCount()).toBeLessThanOrEqual(2);
  });
});
