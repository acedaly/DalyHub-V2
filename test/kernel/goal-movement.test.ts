/**
 * FOLLOW-02 — Goal movement against REAL D1, and the bounded read behind it.
 *
 * The unit matrix (`test/unit/alignment/goal-movement.test.ts`) proves the
 * RULES over synthetic facts. This file proves the other half, which is the half
 * only a database can prove: that the Activity the product's own paths actually
 * write, read back through the repository's three arms, produces those facts —
 * and, just as importantly, that the events which are NOT movement never reach
 * them.
 *
 * Every Goal, Project, Task and measurement here is created through the
 * CANONICAL repositories — `createGoal`, `createProject`, `createTask`,
 * `complete`, `createMeasurement` — so nothing is asserted against hand-written
 * Activity rows. If a future change alters what those paths record, this file
 * fails, which is exactly what it is for.
 *
 * Query counting uses the shared `countingDb`, following REVIEW-03's and
 * FOLLOW-01's precedent: every prepared statement is one unit, because what
 * costs a round trip is running a statement.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createActivityActorContext,
  type ActivityActorContext,
} from "~/kernel/activity";
import type { ActivityWindow } from "~/kernel/activity-window";
import { evaluateGoalMovement, type GoalMovement } from "~/kernel/alignment";
import {
  goalMovementWindow,
  readGoalMovement,
} from "~/platform/activity-window/goal-movement.server";
import {
  createActivityWindowRepository,
  createGoalRepository,
} from "~/platform/storage/d1";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import { recentBoundaryStartIso } from "~/shared/alignment/window";
import { ownerCalendarIso } from "~/shared/datetime";
import { loadGoalSummaries } from "~/shared/goal-progress";

import {
  countingDb,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-movement-workspace";
const OTHER = "test-movement-other";

/** No DST inside the window below, so a boundary that moves is a bug. */
const TZ = "Australia/Brisbane"; // UTC+10, fixed.

/** The week under test: Monday 4 May to Sunday 10 May 2026, owner-local. */
const MON = "2026-05-04";
const SUN = "2026-05-10";
/** A day AFTER the week, so the period is CLOSED for every default assertion. */
const TODAY = "2026-05-14";

const WEEK: ActivityWindow = goalMovementWindow({
  todayIso: MON,
  firstDayOfWeek: "monday",
  timezone: TZ,
});

/** An instant at `hour` owner-local on a wall-calendar day (UTC+10). */
function at(dayIso: string, hour: number): string {
  return new Date(
    Date.parse(`${dayIso}T00:00:00Z`) + (hour - 10) * 3_600_000,
  ).toISOString();
}

const ACTOR: ActivityActorContext = createActivityActorContext({
  type: "user",
  id: "owner-1",
});

/**
 * A world sharing ONE MOVABLE clock across spine, task and measurement
 * mutations, so every Activity instant is coherent and a fixture can place an
 * event on a chosen day.
 *
 * The clock is movable rather than merely advancing because this feature is
 * entirely about which side of a boundary an event falls on: several tests need
 * a record CREATED before the window and COMPLETED inside it, which an
 * advance-only clock cannot express without arithmetic that hides the dates the
 * assertions are about.
 */
function world(ws: string, start: string) {
  let current = start;
  const ctx = makeContext(ws);
  const clock = {
    now: () => new Date(current),
    set: (instantIso: string) => {
      current = instantIso;
    },
  };
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
    measurements: makeGoalMeasurementRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-m`),
    }),
  };
}

type World = ReturnType<typeof world>;

function scopeFor(db: D1Database = env.DB, ws = WS): WorkspaceScope {
  return bindWorkspaceRepositories({ DB: db }, makeContext(ws), ACTOR);
}

async function movementFor(
  goalIds: readonly string[],
  ws = WS,
  todayIso = TODAY,
): Promise<ReadonlyMap<string, GoalMovement>> {
  const read = await readGoalMovement(scopeFor(env.DB, ws), {
    goalIds,
    window: WEEK,
    timezone: TZ,
    todayIso,
  });
  return read.movements;
}

async function newGoal(w: World, title = "Goal") {
  const area = await w.spine.createArea({ title: `${title} area` });
  return w.spine.createGoal({ title, areaId: area.id });
}

async function advancingProject(w: World, goalId: string, title = "Project") {
  return w.spine.createProject({ title, parent: { kind: "goal", id: goalId } });
}

async function taskUnder(w: World, projectId: string, title: string) {
  return w.spine.createTask({
    title,
    parent: { kind: "project", id: projectId },
  });
}

/** STEER-02 — the owner sets a Goal aside, through the Goal-owned slice. */
async function setAside(w: World, goalId: string) {
  await makeGoalDetailsRepository(w.ctx, { clock: w.clock.now }).update(
    goalId,
    { condition: "set_aside" },
  );
}

/** Give a Goal a measurement CONFIGURATION and no readings at all. */
async function configureMeasurement(w: World, goalId: string) {
  await makeGoalDetailsRepository(w.ctx, { clock: w.clock.now }).update(
    goalId,
    {
      measurement: {
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
      },
    },
  );
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* What the stream actually says                                               */
/* -------------------------------------------------------------------------- */

describe("movement, read from the events the product writes", () => {
  it("counts a Task completed under a contributing Project", async () => {
    // Everything is CREATED before the week, so creation events cannot be
    // mistaken for movement inside it.
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Do the thing");

    w.clock.set(at("2026-05-06", 9));
    await w.spine.complete(task.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(true);
    expect(movement.key).toBe("moved");
    expect(movement.eventCount).toBe(1);
    expect(movement.movedProjectCount).toBe(1);
    expect(movement.contributingProjectCount).toBe(1);
    expect(movement.latestMovementDay).toBe("2026-05-06");
    expect(movement.evidence).toEqual([{ kind: "task_completed", count: 1 }]);
  });

  it("does NOT count the same completion BEFORE the window", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Early");

    // 23:59 owner-local on the day before the week opens.
    w.clock.set(at("2026-05-03", 23));
    await w.spine.complete(task.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(false);
    expect(movement.key).toBe("no_movement");
    expect(movement.contributingProjectCount).toBe(1);
  });

  it("does NOT count the same completion AFTER the window", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Late");

    // 00:30 owner-local on the day after the week closes.
    w.clock.set(at("2026-05-11", 0));
    await w.spine.complete(task.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(false);
  });

  it("includes the FIRST and the LAST owner-local instant of the window", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const first = await taskUnder(w, project.id, "First instant");
    const last = await taskUnder(w, project.id, "Last instant");

    // Owner-local 00:00 on Monday — the inclusive lower bound exactly.
    w.clock.set(WEEK.startInstantIso);
    await w.spine.complete(first.id);
    // One millisecond before the exclusive upper bound.
    w.clock.set(new Date(Date.parse(WEEK.endInstantIso) - 1).toISOString());
    await w.spine.complete(last.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.eventCount).toBe(2);
    expect(movement.latestMovementDay).toBe(SUN);
  });

  it("excludes the EXACT exclusive upper bound", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Boundary");

    w.clock.set(WEEK.endInstantIso);
    await w.spine.complete(task.id);

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
  });

  it("counts a contributing PROJECT's own completion", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);

    w.clock.set(at("2026-05-07", 9));
    await w.spine.complete(project.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.evidence).toEqual([
      { kind: "project_completed", count: 1 },
    ]);
    expect(movement.movedProjectCount).toBe(1);
  });

  it("counts a measurement recorded against the Goal itself", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Measured");

    w.clock.set(at("2026-05-05", 8));
    await w.measurements.createMeasurement(goal.id, {
      value: 77,
      measuredOn: "2026-05-05",
    });

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(true);
    expect(movement.directMeasurementMovement).toBe(true);
    expect(movement.evidence).toEqual([
      { kind: "measurement_logged", count: 1 },
    ]);
    // The reading came from the Goal, not from a Project.
    expect(movement.movedProjectCount).toBe(0);
  });

  it("counts a completed MILESTONE, and not the stage that created it", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Staged");
    const stage = await w.measurements.createMilestone(goal.id, {
      title: "Stage one",
    });

    w.clock.set(at("2026-05-08", 9));
    await w.measurements.updateMilestone(stage.id, { completed: true });

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.evidence).toEqual([
      { kind: "milestone_completed", count: 1 },
    ]);
  });

  it("counts the Goal's OWN completion", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Finished");

    w.clock.set(at("2026-05-09", 15));
    await w.spine.complete(goal.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.completedInWindow).toBe(true);
    expect(movement.evidence).toEqual([{ kind: "goal_completed", count: 1 }]);
  });
});

/* -------------------------------------------------------------------------- */
/* What is deliberately NOT movement                                           */
/* -------------------------------------------------------------------------- */

describe("activity that is not outcome movement", () => {
  it("does not count a metadata-only Project edit", async () => {
    /*
     * The rule this feature turns on. Renaming a Project is Activity — it is
     * counted by ADR-040's alignment, and correctly so — but it is not the Goal
     * moving, and a movement statement that said otherwise would be exactly the
     * "something happened" signal FOLLOW-02 exists to replace.
     */
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id, "Old name");

    w.clock.set(at("2026-05-06", 9));
    await w.spine.rename(project.id, "New name");

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(false);
    expect(movement.contributingProjectCount).toBe(1);
  });

  it("does not count a Task CREATED under a contributing Project", async () => {
    // Adding work is intent, not outcome. Alignment counts it; movement does not.
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);

    w.clock.set(at("2026-05-06", 9));
    await taskUnder(w, project.id, "Newly planned work");

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
  });

  it("does not count planning a Task inside the window", async () => {
    // FOLLOW-01's question, not this one.
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Planned work");

    w.clock.set(at("2026-05-05", 9));
    await w.tasks.planTask(task.id, { scheduledDate: "2026-05-07" });

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
  });

  it("does not count REOPENING a completed Task as forward movement", async () => {
    /*
     * An outcome being undone is not the Goal advancing. The completion that
     * preceded it is outside the window here, so a reopen counted as movement
     * would be the only reason this Goal reported one.
     */
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "Undone");

    w.clock.set(at("2026-05-01", 9));
    await w.spine.complete(task.id);
    w.clock.set(at("2026-05-06", 9));
    await w.spine.reopen(task.id);

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
  });

  it("does not count activity under a Project that advances no Goal", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const area = await w.spine.createArea({ title: "Elsewhere" });
    const unrelated = await w.spine.createProject({
      title: "Unrelated",
      parent: { kind: "area", id: area.id },
    });
    const task = await taskUnder(w, unrelated.id, "Something else");

    w.clock.set(at("2026-05-06", 9));
    await w.spine.complete(task.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.moved).toBe(false);
    expect(movement.contributingProjectCount).toBe(0);
  });

  it("does not count a correction to a measurement recorded earlier", async () => {
    // Repairing the record of the past is not new movement.
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Measured");
    const reading = await w.measurements.createMeasurement(goal.id, {
      value: 80,
      measuredOn: "2026-04-20",
    });

    w.clock.set(at("2026-05-06", 9));
    await w.measurements.updateMeasurement(reading.id, { value: 79 });

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Several Projects, and several kinds at once                                 */
/* -------------------------------------------------------------------------- */

describe("counts across a Goal's contributing structure", () => {
  it("reports how many of the contributing Projects moved", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const moved = await advancingProject(w, goal.id, "Moved");
    const alsoMoved = await advancingProject(w, goal.id, "Also moved");
    await advancingProject(w, goal.id, "Untouched");
    const a = await taskUnder(w, moved.id, "A");
    const b = await taskUnder(w, moved.id, "B");
    const c = await taskUnder(w, alsoMoved.id, "C");

    w.clock.set(at("2026-05-05", 9));
    await w.spine.complete(a.id);
    w.clock.set(at("2026-05-05", 10));
    await w.spine.complete(b.id);
    w.clock.set(at("2026-05-06", 11));
    await w.spine.complete(c.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.contributingProjectCount).toBe(3);
    expect(movement.movedProjectCount).toBe(2);
    expect(movement.eventCount).toBe(3);
    expect(movement.evidence).toEqual([{ kind: "task_completed", count: 3 }]);
  });

  it("keeps several kinds in ONE result with the counts intact", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Mixed");
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "A");

    w.clock.set(at("2026-05-05", 9));
    await w.spine.complete(task.id);
    w.clock.set(at("2026-05-06", 9));
    await w.measurements.createMeasurement(goal.id, {
      value: 5,
      measuredOn: "2026-05-06",
    });
    w.clock.set(at("2026-05-07", 9));
    await w.spine.complete(project.id);

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.eventCount).toBe(3);
    expect(movement.evidence).toEqual([
      { kind: "task_completed", count: 1 },
      { kind: "project_completed", count: 1 },
      { kind: "measurement_logged", count: 1 },
    ]);
    expect(movement.latestMovementDay).toBe("2026-05-07");
  });

  it("answers for a Goal with no structure at all, rather than omitting it", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Bare");

    const movement = (await movementFor([goal.id])).get(goal.id)!;
    expect(movement.available).toBe(true);
    expect(movement.moved).toBe(false);
    expect(movement.contributingProjectCount).toBe(0);
  });

  it("answers for an id that is not a Goal in this workspace", async () => {
    const movement = (await movementFor(["not-a-goal"])).get("not-a-goal")!;
    expect(movement.available).toBe(true);
    expect(movement.moved).toBe(false);
    expect(movement.contributingProjectCount).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                   */
/* -------------------------------------------------------------------------- */

describe("workspace isolation", () => {
  it("never lets another workspace's completion move a Goal", async () => {
    const mine = world(WS, at("2026-04-20", 9));
    const theirs = world(OTHER, at("2026-04-20", 9));
    const myGoal = await newGoal(mine, "Mine");
    const myProject = await advancingProject(mine, myGoal.id);
    const myTask = await taskUnder(mine, myProject.id, "Mine");
    const theirGoal = await newGoal(theirs, "Theirs");
    const theirProject = await advancingProject(theirs, theirGoal.id);
    const theirTask = await taskUnder(theirs, theirProject.id, "Theirs");

    theirs.clock.set(at("2026-05-06", 9));
    await theirs.spine.complete(theirTask.id);

    expect((await movementFor([myGoal.id], WS)).get(myGoal.id)!.moved).toBe(
      false,
    );
    expect(
      (await movementFor([theirGoal.id], OTHER)).get(theirGoal.id)!.moved,
    ).toBe(true);

    // And asking THIS workspace about the other's Goal answers about nothing.
    const crossed = (await movementFor([theirGoal.id], WS)).get(theirGoal.id)!;
    expect(crossed.moved).toBe(false);
    expect(crossed.contributingProjectCount).toBe(0);

    mine.clock.set(at("2026-05-06", 9));
    await mine.spine.complete(myTask.id);
  });
});

/* -------------------------------------------------------------------------- */
/* The budget, and its flatness                                                */
/* -------------------------------------------------------------------------- */

/**
 * The EXACT number of prepared D1 statements one movement read costs for a page
 * of up to `GOAL_MOVEMENT_CHUNK_SIZE` Goals.
 *
 * TWO, and it is a number rather than a claim: an edit that adds a per-Goal read
 * fails the build rather than the owner's Today page.
 */
const MOVEMENT_QUERY_BUDGET = 2;

describe("the query budget", () => {
  async function seedGoals(w: World, count: number, completions: number) {
    const goals: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const goal = await newGoal(w, `Budget goal ${index}`);
      const project = await advancingProject(w, goal.id, `P${index}`);
      for (let n = 0; n < completions; n += 1) {
        const task = await taskUnder(w, project.id, `T${index}-${n}`);
        w.clock.set(at("2026-05-05", 9));
        await w.spine.complete(task.id);
        w.clock.set(at("2026-04-20", 9));
      }
      goals.push(goal.id);
    }
    return goals;
  }

  it("costs exactly two statements for a whole page", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goals = await seedGoals(w, 6, 1);
    const counting = countingDb(env.DB);
    const repository = createActivityWindowRepository(
      counting.db,
      makeContext(WS),
    );
    counting.reset();
    await repository.readGoalMovementFacts(WEEK, goals);
    expect(counting.prepareCount()).toBe(MOVEMENT_QUERY_BUDGET);
  });

  it("is FLAT in the number of GOALS: six cost what two do", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const six = await seedGoals(w, 6, 1);
    const counting = countingDb(env.DB);
    const repository = createActivityWindowRepository(
      counting.db,
      makeContext(WS),
    );

    counting.reset();
    await repository.readGoalMovementFacts(WEEK, six.slice(0, 2));
    const small = counting.prepareCount();
    counting.reset();
    await repository.readGoalMovementFacts(WEEK, six);
    expect(counting.prepareCount()).toBe(small);
    expect(small).toBe(MOVEMENT_QUERY_BUDGET);
  });

  it("is FLAT in the number of EVENTS: a busy Goal costs what a quiet one does", async () => {
    /*
     * The property a row-limited event read could not have. The aggregation
     * happens in SQL, so a Goal with twelve completions and a Goal with one
     * cost the same read — and neither can silently drop the other's evidence.
     */
    const w = world(WS, at("2026-04-20", 9));
    const quiet = await seedGoals(w, 1, 1);
    const busy = await seedGoals(w, 1, 12);
    const counting = countingDb(env.DB);
    const repository = createActivityWindowRepository(
      counting.db,
      makeContext(WS),
    );

    counting.reset();
    await repository.readGoalMovementFacts(WEEK, quiet);
    const quietCost = counting.prepareCount();
    counting.reset();
    const busyFacts = await repository.readGoalMovementFacts(WEEK, busy);
    expect(counting.prepareCount()).toBe(quietCost);
    expect(busyFacts.get(busy[0]!)!.counts.task_completed).toBe(12);
  });

  it("stays inside D1's 100-bound-parameter ceiling for a full page", async () => {
    /*
     * The ceiling TASKS-13 and UX-02 each found the expensive way. Fifty ids is
     * `DEFAULT_SPINE_PAGE_SIZE`, i.e. the largest ordinary Goals page, and the
     * read must complete rather than fail with "too many SQL variables".
     */
    const ids = Array.from({ length: 50 }, (_, index) => `absent-${index}`);
    const repository = createActivityWindowRepository(env.DB, makeContext(WS));
    await expect(
      repository.readGoalMovementFacts(WEEK, ids),
    ).resolves.toBeInstanceOf(Map);
  });

  it("costs NOTHING for an empty page", async () => {
    const counting = countingDb(env.DB);
    const repository = createActivityWindowRepository(
      counting.db,
      makeContext(WS),
    );
    counting.reset();
    expect((await repository.readGoalMovementFacts(WEEK, [])).size).toBe(0);
    expect(counting.prepareCount()).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Nothing is stored                                                           */
/* -------------------------------------------------------------------------- */

describe("[ADR-110] — movement is derived, never stored", () => {
  it("writes nothing when it is read", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "A");
    w.clock.set(at("2026-05-05", 9));
    await w.spine.complete(task.id);

    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    await movementFor([goal.id]);
    await movementFor([goal.id]);
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();

    expect(after!.n).toBe(before!.n);
  });

  it("changes its answer immediately when history changes, with no reconciliation", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "A");

    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(false);
    w.clock.set(at("2026-05-05", 9));
    await w.spine.complete(task.id);
    expect((await movementFor([goal.id])).get(goal.id)!.moved).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Which Goals Today's summary read includes                                   */
/* -------------------------------------------------------------------------- */

describe("a Goal earns its place by having something TRUE to say", () => {
  /**
   * `loadGoalSummaries` against the real repositories, with the movement read
   * injected exactly as Today's loader injects it.
   */
  async function summaries(withMovement: boolean) {
    const scope = scopeFor(env.DB, WS);
    return loadGoalSummaries(scope, {
      now: new Date(`${TODAY}T00:00:00.000Z`),
      timezone: TZ,
      todayIso: MON,
      recentBoundaryStartIso: recentBoundaryStartIso(MON, TZ),
      readMovement: withMovement
        ? (goalIds) =>
            readGoalMovement(scope, {
              goalIds,
              window: WEEK,
              timezone: TZ,
              todayIso: MON,
            }).then((read) => read.movements)
        : undefined,
    });
  }

  it("includes a MEASURABLE Goal with no reading yet, so the panel can say what moved it", async () => {
    /*
     * The case a review caught, and it is a real defect rather than a nicety.
     * The rule used to be "exclude a measurable Goal with no reading" — which
     * made a workspace whose Goals were ALL measurable-but-unstarted produce an
     * EMPTY Goal panel, and the empty line then told the owner to add a Goal
     * when what they needed was to record a first measurement.
     *
     * It is also simply untrue that such a Goal has nothing to report: a
     * contributing Project completed inside the window moves it, which is what
     * this fixture does.
     */
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w, "Configured but unstarted");
    await configureMeasurement(w, goal.id);
    const project = await advancingProject(w, goal.id);
    w.clock.set(at("2026-05-06", 9));
    await w.spine.complete(project.id);

    const withMovement = await summaries(true);
    const entry = withMovement.find((summary) => summary.id === goal.id);
    expect(entry, "an unstarted measurable Goal is on the panel").toBeDefined();
    // GOAL-02's own designed absence, never a fabricated zero.
    expect(entry!.progress.measured).toBe(true);
    expect(entry!.progress.current).toBeNull();
    expect(entry!.progress.progressPercent).toBeNull();
    // And it has something true to say.
    expect(entry!.movement?.moved).toBe(true);
    expect(entry!.movement?.evidence).toEqual([
      { kind: "project_completed", count: 1 },
    ]);
  });

  /**
   * STEER-02 — a Goal the owner has set aside leaves Today's Goal panel, and
   * loses none of its facts on the way out (ADR-111 decision 3).
   *
   * Both halves are asserted in ONE test deliberately, because the pair is the
   * claim: a surface that quietly dropped a Goal AND quietly altered what it
   * says about it would pass either half alone.
   */
  it("drops a SET-ASIDE Goal from the panel while its facts stay exactly what they were", async () => {
    const w = world(WS, at("2026-05-04", 9));
    const pursued = await newGoal(w, "Pursued");
    const rested = await newGoal(w, "Rested");
    // Both have a genuine, identical week: a contributing Project completed
    // inside the window. The only difference between them is the owner's word.
    for (const goal of [pursued, rested]) {
      await configureMeasurement(w, goal.id);
      const project = await advancingProject(w, goal.id, `${goal.title} work`);
      w.clock.set(at("2026-05-06", 9));
      await w.spine.complete(project.id);
      w.clock.set(at("2026-05-04", 9));
    }

    const before = await summaries(true);
    expect(before.map((entry) => entry.id).sort()).toEqual(
      [pursued.id, rested.id].sort(),
    );
    const restedBefore = before.find((entry) => entry.id === rested.id)!;

    await setAside(w, rested.id);

    // Scope: the attention surface no longer asks about it…
    const after = await summaries(true);
    expect(after.map((entry) => entry.id)).toEqual([pursued.id]);

    // …and TRUTH: every derived fact about that Goal is byte-identical to what
    // it was a moment ago. The movement statement, the measurement evaluation
    // and the alignment-ordered collection all read exactly the same.
    const facts = (
      await createActivityWindowRepository(
        env.DB,
        makeContext(WS),
      ).readGoalMovementFacts(WEEK, [rested.id])
    ).get(rested.id)!;
    expect(
      evaluateGoalMovement(facts, {
        window: WEEK,
        // The SAME owner day the panel read used, so the comparison is about
        // the condition and nothing else — a different day would change the
        // window's phase and prove only that this test moved the goalposts.
        todayIso: MON,
        calendarIsoOf: (instant) => ownerCalendarIso(instant, TZ),
      }),
    ).toEqual(restedBefore.movement);

    // …and the COLLECTION still holds it, because `/goals` is where the owner
    // deliberately looks rather than a surface asking for their attention.
    const collection = await createGoalRepository(
      env.DB,
      w.ctx,
    ).listGoalsByAlignment({
      activeBoundaryIso: recentBoundaryStartIso(MON, TZ),
    });
    expect(collection.items.map((item) => item.id)).toContain(rested.id);
  });

  it("leaves a caller that did NOT ask for movement exactly the set it had", async () => {
    /*
     * The Projects page's compact rail is a MEASUREMENT rail. It asks for no
     * movement, so it must keep GOAL-02's set precisely: no Goal drawn with no
     * bar, no figure and no sentence.
     */
    const w = world(WS, at("2026-04-20", 9));
    const unmeasured = await newGoal(w, "No number");
    const unstarted = await newGoal(w, "Configured but unstarted");
    await configureMeasurement(w, unstarted.id);

    const ids = (await summaries(false)).map((summary) => summary.id);
    expect(ids).not.toContain(unmeasured.id);
    expect(ids).not.toContain(unstarted.id);
  });
});

/* -------------------------------------------------------------------------- */
/* The derivation and the read agree                                           */
/* -------------------------------------------------------------------------- */

describe("the platform read and the kernel evaluator agree", () => {
  it("produces the same result from the repository's own facts", async () => {
    const w = world(WS, at("2026-04-20", 9));
    const goal = await newGoal(w);
    const project = await advancingProject(w, goal.id);
    const task = await taskUnder(w, project.id, "A");
    w.clock.set(at("2026-05-05", 9));
    await w.spine.complete(task.id);

    const repository = createActivityWindowRepository(env.DB, makeContext(WS));
    const facts = (await repository.readGoalMovementFacts(WEEK, [goal.id])).get(
      goal.id,
    )!;
    const direct = evaluateGoalMovement(facts, {
      window: WEEK,
      todayIso: TODAY,
      calendarIsoOf: (instant) => ownerCalendarIso(instant, TZ),
    });

    expect((await movementFor([goal.id])).get(goal.id)).toEqual(direct);
  });

  it("resolves the owner's week from `firstDayOfWeek`", async () => {
    // Sunday-start weeks open a day earlier, which is a different set of days.
    const sunday = goalMovementWindow({
      todayIso: "2026-05-06",
      firstDayOfWeek: "sunday",
      timezone: TZ,
    });
    expect(sunday.periodStart).toBe("2026-05-03");
    expect(sunday.periodEnd).toBe("2026-05-09");
    expect(WEEK.periodStart).toBe(MON);
    expect(WEEK.periodEnd).toBe(SUN);
  });
});
