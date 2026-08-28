/**
 * STEER-02 — `/plan`'s unsupported-Goal signals, over real D1.
 *
 * The planner's Goal signal says *"No planned supporting action this week"*
 * about a Goal whose contributing Projects have nothing planned. That is a
 * useful nudge about a Goal the owner is pursuing, and it is exactly the
 * manufactured guilt [ADR-111 decision 3] removes about one they have
 * deliberately set aside — so a set-aside Goal leaves this surface, while
 * every derived fact about it stays what it was.
 *
 * The signal had no test coverage at all before this file, which is the other
 * reason it exists: the behaviour being changed had nothing asserting the
 * behaviour it already had.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { bindWorkspaceRepositories } from "~/platform/workspaces";
import { loadPlanPage } from "~/modules/plan/plan-load.server";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  FakeClock,
  makeContext,
  makeGoalDetailsRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "owner-subject";
/** A Wednesday, so "this week" is unambiguous in either week convention. */
const NOW = new Date("2026-05-06T02:00:00.000Z");

const ACTOR = {
  actor: { type: "user" as const, id: OWNER },
};

function scope(): WorkspaceScope {
  return bindWorkspaceRepositories({ DB: env.DB }, makeContext(WS), ACTOR);
}

function world() {
  const clock = new FakeClock(NOW.toISOString());
  const ctx = makeContext(WS);
  return {
    ctx,
    spine: makeSpineRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds("plangoal-e"),
      activityIdGenerator: sequentialIds("plangoal-a"),
    }),
    tasks: makeTaskRepository(ctx, {
      clock: clock.now,
      activityIdGenerator: sequentialIds("plangoal-ta"),
    }),
    details: makeGoalDetailsRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds("plangoal-gd"),
    }),
    settings: makeProjectSettingsRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds("plangoal-ps"),
    }),
  };
}

/**
 * An ACTIVE Project advancing a Goal.
 *
 * The planner reads open, `active` Projects — a newly created Project is
 * `planned` — so the status is set explicitly rather than assumed. Without it
 * the fixture would produce no signals at all and every assertion below would
 * pass for the wrong reason.
 */
async function advancingProject(
  w: ReturnType<typeof world>,
  goalId: string,
  title: string,
) {
  const project = await w.spine.createProject({
    title,
    parent: { kind: "goal", id: goalId },
  });
  await w.settings.setStatus(project.id, "active");
  return project;
}

async function planGoalSignals() {
  const page = await loadPlanPage({
    scope: scope(),
    ownerId: OWNER,
    now: NOW,
    // The planner's own defaults — this week, no day and no queue override.
    weekOffset: 0,
    requestedDay: null,
    requestedQueueSource: null,
  });
  return page.goalSignals;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("/plan's unsupported-Goal signals (STEER-02)", () => {
  it("names a Goal whose contributing Projects have nothing planned this week", async () => {
    const w = world();
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({
      title: "Run a half-marathon",
      areaId: area.id,
    });
    await advancingProject(w, goal.id, "Training block");

    // The behaviour that already existed, asserted for the first time.
    expect(await planGoalSignals()).toEqual([
      { goalId: goal.id, title: "Run a half-marathon" },
    ]);
  });

  it("says nothing about a Goal the owner has SET ASIDE", async () => {
    const w = world();
    const area = await w.spine.createArea({ title: "Health" });
    const rested = await w.spine.createGoal({
      title: "Learn the piano",
      areaId: area.id,
    });
    await advancingProject(w, rested.id, "Weekly practice");

    expect((await planGoalSignals()).map((signal) => signal.goalId)).toEqual([
      rested.id,
    ]);

    await w.details.update(rested.id, { condition: "set_aside" });

    // "No planned supporting action this week" is true and unwelcome about a
    // Goal the owner has deliberately put down. The signal goes; the Goal, its
    // Project and every derived fact about both stay exactly as they were.
    expect(await planGoalSignals()).toEqual([]);
    const overview = await scope().goals.getGoalOverview(rested.id);
    expect(overview).not.toBeNull();
    expect(
      (await scope().goals.getGoalProjectContribution(rested.id)).total,
    ).toBe(1);
  });

  it("filters BEFORE the cap, so a set-aside Goal never costs a pursued one its place", async () => {
    /*
     * The planner shows at most three Goal signals. Filtering after the cap
     * would let three set-aside Goals fill it and hide the pursued Goal that
     * genuinely has no planned support — a silent, and exactly wrong, drop.
     */
    const w = world();
    const area = await w.spine.createArea({ title: "Health" });
    const rested: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const goal = await w.spine.createGoal({
        title: `Rested ${index}`,
        areaId: area.id,
      });
      await advancingProject(w, goal.id, `Rested work ${index}`);
      await w.details.update(goal.id, { condition: "set_aside" });
      rested.push(goal.id);
    }
    const pursued = await w.spine.createGoal({
      title: "Pursued",
      areaId: area.id,
    });
    await advancingProject(w, pursued.id, "Pursued work");

    expect((await planGoalSignals()).map((signal) => signal.goalId)).toEqual([
      pursued.id,
    ]);
    expect(rested).toHaveLength(3);
  });

  it("still says nothing about a Goal whose work IS planned this week", async () => {
    const w = world();
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({
      title: "Supported goal",
      areaId: area.id,
    });
    const project = await advancingProject(w, goal.id, "Training block");
    await w.tasks.createTask({
      title: "Wednesday: 5km",
      parent: { kind: "project", id: project.id },
      scheduledDate: "2026-05-06",
    });

    // The pre-existing rule, unchanged by the condition filter: a Goal with
    // planned supporting work is not an unsupported Goal.
    expect(await planGoalSignals()).toEqual([]);
  });
});
