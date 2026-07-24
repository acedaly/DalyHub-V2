import { beforeEach, describe, expect, it } from "vitest";

import {
  GoalDetailsNotFoundError,
  GoalDetailsValidationError,
} from "~/kernel/goals";

import {
  countActivitiesOfType,
  countGoalDetailRows,
  FakeClock,
  makeContext,
  makeGoalDetailsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goal_details_other";

function spine(ws = WS, prefix = "gd") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    activityIdGenerator: sequentialIds(`${prefix}act`),
  });
}

function details(options?: Parameters<typeof makeGoalDetailsRepository>[1]) {
  return makeGoalDetailsRepository(makeContext(WS), {
    clock: new FakeClock().now,
    ...options,
  });
}

async function seedGoal(s: ReturnType<typeof spine>) {
  const area = await s.createArea({ title: "Health" });
  return s.createGoal({ title: "Run a half-marathon", areaId: area.id });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("GoalDetailsRepository.get", () => {
  it("returns the default null-fields shape for a Goal with no details row", async () => {
    const goal = await seedGoal(spine());
    const record = await details().get(goal.id);
    expect(record).toMatchObject({
      id: goal.id,
      targetDate: null,
      definitionOfDone: null,
    });
    expect(await countGoalDetailRows()).toBe(0);
  });

  it("fails closed (null) for missing, deleted, wrong-kind and cross-workspace ids", async () => {
    const s = spine();
    const goal = await seedGoal(s);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Not a goal",
      parent: { kind: "area", id: area.id },
    });
    await s.softDelete(goal.id);

    const other = spine(OTHER, "other");
    const otherArea = await other.createArea({ title: "Other" });
    const otherGoal = await other.createGoal({
      title: "Other",
      areaId: otherArea.id,
    });

    const repo = details();
    for (const id of ["nonexistent", goal.id, project.id, otherGoal.id]) {
      expect(await repo.get(id)).toBeNull();
    }
  });
});

describe("GoalDetailsRepository.update", () => {
  it("sets both fields together and records goal.details_updated exactly once", async () => {
    const goal = await seedGoal(spine());
    const repo = details();

    const result = await repo.update(goal.id, {
      targetDate: "2026-12-31",
      definitionOfDone: "Cross the finish line.",
    });
    expect(result.changed).toBe(true);
    expect(result.details).toMatchObject({
      targetDate: "2026-12-31",
      definitionOfDone: "Cross the finish line.",
    });
    expect(await countGoalDetailRows()).toBe(1);
    expect(await countActivitiesOfType("goal.details_updated")).toBe(1);
  });

  it("title stays spine-owned: updating details never changes the Goal's title", async () => {
    const s = spine();
    const goal = await seedGoal(s);
    await details().update(goal.id, { targetDate: "2026-12-31" });
    const record = await s.getById(goal.id);
    expect(record?.title).toBe("Run a half-marathon");
  });

  it("target date and definition of done are read back exactly, never coerced", async () => {
    const goal = await seedGoal(spine());
    const repo = details();
    await repo.update(goal.id, { targetDate: "2026-01-01" });
    expect((await repo.get(goal.id))?.targetDate).toBe("2026-01-01");
    await repo.update(goal.id, { definitionOfDone: "Done means done." });
    const record = await repo.get(goal.id);
    // The target date set earlier is UNCHANGED by an update that only patches
    // definitionOfDone — an omitted key leaves that field alone.
    expect(record?.targetDate).toBe("2026-01-01");
    expect(record?.definitionOfDone).toBe("Done means done.");
  });

  it("clears a field with an explicit null", async () => {
    const goal = await seedGoal(spine());
    const repo = details();
    await repo.update(goal.id, { targetDate: "2026-01-01" });
    const result = await repo.update(goal.id, { targetDate: null });
    expect(result.details.targetDate).toBeNull();
  });

  it("is an idempotent no-op (no Activity) when the patch changes nothing", async () => {
    const goal = await seedGoal(spine());
    const repo = details();
    await repo.update(goal.id, { targetDate: "2026-01-01" });
    const before = await countActivitiesOfType("goal.details_updated");
    const result = await repo.update(goal.id, { targetDate: "2026-01-01" });
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("goal.details_updated")).toBe(before);
  });

  it("rejects a malformed target date honestly, writing nothing", async () => {
    const goal = await seedGoal(spine());
    const repo = details();
    await expect(
      repo.update(goal.id, { targetDate: "31-12-2026" }),
    ).rejects.toBeInstanceOf(GoalDetailsValidationError);
    expect(await countGoalDetailRows()).toBe(0);
  });

  it("rejects an impossible calendar date (e.g. 30 February)", async () => {
    const goal = await seedGoal(spine());
    await expect(
      details().update(goal.id, { targetDate: "2026-02-30" }),
    ).rejects.toBeInstanceOf(GoalDetailsValidationError);
  });

  it("normalises a whitespace-only definition of done to null", async () => {
    const goal = await seedGoal(spine());
    const repo = details();
    const result = await repo.update(goal.id, { definitionOfDone: "   " });
    expect(result.details.definitionOfDone).toBeNull();
  });

  it("rejects an over-length definition of done", async () => {
    const goal = await seedGoal(spine());
    await expect(
      details().update(goal.id, { definitionOfDone: "a".repeat(3000) }),
    ).rejects.toBeInstanceOf(GoalDetailsValidationError);
  });

  it("fails closed for a missing, deleted, wrong-kind or cross-workspace Goal id", async () => {
    const s = spine();
    const goal = await seedGoal(s);
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Not a goal",
      parent: { kind: "area", id: area.id },
    });
    await s.softDelete(goal.id);

    const other = spine(OTHER, "other");
    const otherArea = await other.createArea({ title: "Other" });
    const otherGoal = await other.createGoal({
      title: "Other",
      areaId: otherArea.id,
    });

    const repo = details();
    for (const id of ["nonexistent", goal.id, project.id, otherGoal.id]) {
      await expect(
        repo.update(id, { targetDate: "2026-01-01" }),
      ).rejects.toBeInstanceOf(GoalDetailsNotFoundError);
    }
    expect(await countGoalDetailRows()).toBe(0);
  });
});

describe("Activity atomicity — the details write and its event are all-or-nothing", () => {
  it("an Activity-insert failure rolls the details write back too", async () => {
    const goal = await seedGoal(spine());
    const repo = details({ mutationFault: "after-domain" });
    await expect(
      repo.update(goal.id, { targetDate: "2026-01-01" }),
    ).rejects.toThrow();
    expect(await countGoalDetailRows()).toBe(0);
    expect(await countActivitiesOfType("goal.details_updated")).toBe(0);
  });

  it("a genuine no-op never reaches the armed fault", async () => {
    const goal = await seedGoal(spine());
    const repo = details({ mutationFault: "after-domain" });
    const result = await repo.update(goal.id, {});
    expect(result.changed).toBe(false);
  });
});
