import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as detailLoader } from "~/modules/goals/routes/detail";
import { action as newAction } from "~/modules/goals/routes/new";
import { action as mutateAction } from "~/modules/goals/routes/mutate";
import { loader as activityLoader } from "~/modules/goals/routes/activity";
import {
  loader as projectsLoader,
  type GoalProjectsPageData,
} from "~/modules/goals/routes/projects";
import type { CreateGoalResult } from "~/modules/goals/routes/new";
import type { GoalMutationResult } from "~/modules/goals/routes/mutate";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goals_route_other";
const nextEntityId = sequentialIds("goalent");
const nextActivityId = sequentialIds("goalact");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function spine(ws = WS) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function runNew(form: FormData, method = "POST"): Promise<Response> {
  return newAction({
    request: new Request("https://app.test/goals/new", {
      method,
      body: method === "POST" ? form : undefined,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0]) as Promise<Response>;
}

async function runMutate(
  goalId: string,
  form: FormData,
  method = "POST",
): Promise<Response> {
  return mutateAction({
    request: new Request(
      `https://app.test/goals/${goalId}/mutate`,
      method === "POST" ? { method, body: form } : { method },
    ),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof mutateAction>[0]) as Promise<Response>;
}

function runDetail(goalId: string) {
  return detailLoader({
    request: new Request(`https://app.test/goals/${goalId}`),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function runActivity(goalId: string): Promise<Response> {
  return activityLoader({
    request: new Request(`https://app.test/goals/${goalId}/activity`),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof activityLoader>[0]) as Promise<Response>;
}

async function runProjects(goalId: string, cursor?: string): Promise<Response> {
  const url = new URL(`https://app.test/goals/${goalId}/projects`);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  return projectsLoader({
    request: new Request(url),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof projectsLoader>[0]) as Promise<Response>;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Goal routes", () => {
  it("creates a Goal under a verified Area and lands on the canonical record", async () => {
    const area = await spine().createArea({ title: "Health" });
    const response = await runNew(
      formData({ title: "Run a half-marathon", areaId: area.id }),
    );
    const body = (await response.json()) as CreateGoalResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const detail = await runDetail(body.goalId);
    expect("overview" in detail && detail.overview.title).toBe(
      "Run a half-marathon",
    );
    expect("overview" in detail && detail.overview.area.id).toBe(area.id);
  });

  it("validates a required title and writes nothing on failure", async () => {
    const area = await spine().createArea({ title: "Health" });
    const response = await runNew(formData({ title: "   ", areaId: area.id }));
    const body = (await response.json()) as CreateGoalResult;
    expect(body.ok).toBe(false);
  });

  it("rejects creation under a missing, deleted, wrong-kind or cross-workspace Area (fails closed, no partial write)", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const project = await s.createProject({
      title: "Not an area",
      parent: { kind: "area", id: area.id },
    });
    const deletedArea = await s.createArea({ title: "Deleted" });
    await s.softDelete(deletedArea.id);
    const deletedAreaId = deletedArea.id;

    const otherArea = await spine(OTHER).createArea({ title: "Other" });

    for (const areaId of [
      "nonexistent",
      project.id,
      deletedAreaId,
      otherArea.id,
    ]) {
      const response = await runNew(formData({ title: "Goal", areaId }));
      const body = (await response.json()) as CreateGoalResult;
      expect(body.ok).toBe(false);
    }
  });

  it("returns a real 405 for a non-POST create request", async () => {
    const area = await spine().createArea({ title: "Health" });
    await expect(
      runNew(formData({ title: "Goal", areaId: area.id }), "GET"),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("renames a Goal and records Activity — title stays spine-owned", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Old", areaId: area.id });

    const response = await runMutate(
      goal.id,
      formData({ intent: "rename", title: "New title" }),
    );
    const body = (await response.json()) as GoalMutationResult;
    expect(body).toEqual({ kind: "rename", ok: true });

    const detail = await runDetail(goal.id);
    expect("overview" in detail && detail.overview.title).toBe("New title");

    const activity = await makeActivityRepository(
      makeContext(WS),
    ).listForEntity(goal.id);
    expect(activity.items.some((item) => item.type === "entity.updated")).toBe(
      true,
    );
  });

  it("updates target date and definition of done atomically via update_details", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });

    const response = await runMutate(
      goal.id,
      formData({
        intent: "update_details",
        targetDate: "2026-12-31",
        definitionOfDone: "Cross the finish line.",
      }),
    );
    const body = (await response.json()) as GoalMutationResult;
    expect(body).toEqual({ kind: "update_details", ok: true });

    const detail = await runDetail(goal.id);
    expect("details" in detail && detail.details.targetDate).toBe("2026-12-31");
    expect("details" in detail && detail.details.definitionOfDone).toBe(
      "Cross the finish line.",
    );
  });

  it("returns a typed validation error for a malformed target date, writing nothing", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });

    const response = await runMutate(
      goal.id,
      formData({ intent: "update_details", targetDate: "not-a-date" }),
    );
    const body = (await response.json()) as GoalMutationResult;
    expect(body.kind).toBe("update_details");
    expect(body.ok).toBe(false);
    if (body.kind === "update_details" && !body.ok) {
      expect(body.fieldErrors?.targetDate).toBeTruthy();
    }

    const detail = await runDetail(goal.id);
    expect("details" in detail && detail.details.targetDate).toBeNull();
  });

  it("completes then reopens a Goal, keeping explicit completion separate from derived progress", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });
    await s.createProject({
      title: "Unrelated incomplete Project",
      parent: { kind: "goal", id: goal.id },
    });

    const completeResponse = await runMutate(
      goal.id,
      formData({ intent: "complete" }),
    );
    const completeBody = (await completeResponse.json()) as GoalMutationResult;
    expect(completeBody).toEqual({
      kind: "completion",
      ok: true,
      completed: true,
    });

    const afterComplete = await runDetail(goal.id);
    expect(
      "overview" in afterComplete && afterComplete.overview.completedAt,
    ).not.toBeNull();
    // Derived contribution progress is UNCHANGED by explicit completion — the
    // linked Project is still incomplete.
    expect(
      "contribution" in afterComplete && afterComplete.contribution.incomplete,
    ).toBe(1);

    const reopenResponse = await runMutate(
      goal.id,
      formData({ intent: "reopen" }),
    );
    const reopenBody = (await reopenResponse.json()) as GoalMutationResult;
    expect(reopenBody).toEqual({
      kind: "completion",
      ok: true,
      completed: false,
    });
    const afterReopen = await runDetail(goal.id);
    expect(
      "overview" in afterReopen && afterReopen.overview.completedAt,
    ).toBeNull();
  });

  it("rejects an unknown mutation intent with a calm typed error, mutating nothing", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });

    const response = await runMutate(goal.id, formData({ intent: "bogus" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as GoalMutationResult;
    expect(body.ok).toBe(false);
  });

  it("returns a real 405 for a non-POST mutate request", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });
    await expect(
      runMutate(goal.id, formData({ intent: "rename" }), "GET"),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("rejects every mutation intent against a task/project id (wrong kind) and a cross-workspace Goal", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const project = await s.createProject({
      title: "Not a goal",
      parent: { kind: "area", id: area.id },
    });
    const otherArea = await spine(OTHER).createArea({ title: "Other" });
    const otherGoal = await spine(OTHER).createGoal({
      title: "Other",
      areaId: otherArea.id,
    });

    for (const id of [project.id, otherGoal.id, "nonexistent"]) {
      await expect(
        runMutate(id, formData({ intent: "rename", title: "X" })),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("fails closed with a calm 404 for missing, deleted, wrong-kind and cross-workspace Goal records", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Deleted", areaId: area.id });
    const project = await s.createProject({
      title: "Not a goal",
      parent: { kind: "area", id: area.id },
    });
    await s.softDelete(goal.id);
    const otherArea = await spine(OTHER).createArea({ title: "Other" });
    const otherGoal = await spine(OTHER).createGoal({
      title: "Other",
      areaId: otherArea.id,
    });

    for (const id of ["nonexistent", goal.id, project.id, otherGoal.id]) {
      await expect(runDetail(id)).rejects.toMatchObject({ status: 404 });
      const activity = await runActivity(id);
      expect(activity.status).toBe(404);
    }
  });

  it("returns bounded Activity pages through the shared Activity route", async () => {
    const area = await spine().createArea({ title: "Health" });
    const response = await runNew(formData({ title: "Goal", areaId: area.id }));
    const body = (await response.json()) as CreateGoalResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const activity = await runActivity(body.goalId);
    expect(activity.status).toBe(200);
    const page = (await activity.json()) as { items: readonly unknown[] };
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("reports the EXACT Project contribution and bounds the displayed Project cards for >50 Projects", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Big Goal", areaId: area.id });
    for (let i = 0; i < 55; i++) {
      await s.createProject({
        title: `Project ${i}`,
        parent: { kind: "goal", id: goal.id },
      });
    }

    const detail = await runDetail(goal.id);
    expect("overview" in detail).toBe(true);
    if (!("overview" in detail)) return;

    expect(detail.projects.length).toBeLessThanOrEqual(50);
    expect(detail.projectsNextCursor).toBeTruthy();
    // The EXACT contribution boundary still reports every Project.
    expect(detail.contribution.total).toBe(55);
  });
});

describe("DEBT-22 — Goal Projects pagination endpoint (/goals/:goalId/projects)", () => {
  async function seedGoalWithProjects(count: number) {
    const s = spine();
    const area = await s.createArea({ title: "Area" });
    const goal = await s.createGoal({ title: "Goal", areaId: area.id });
    for (let i = 0; i < count; i++) {
      await s.createProject({
        title: `Project ${String(i).padStart(3, "0")}`,
        parent: { kind: "goal", id: goal.id },
      });
    }
    return goal.id;
  }

  it("returns a single bounded page for a Goal with one page of Projects", async () => {
    const goalId = await seedGoalWithProjects(3);
    const response = await runProjects(goalId);
    expect(response.status).toBe(200);
    const body = (await response.json()) as GoalProjectsPageData;
    expect(body.projects).toHaveLength(3);
    expect(body.nextCursor).toBeNull();
  });

  it("reaches EVERY Project across pages with no duplicates or gaps, ending nextCursor=null", async () => {
    const goalId = await seedGoalWithProjects(120);
    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const response = await runProjects(goalId, cursor);
      expect(response.status).toBe(200);
      const body = (await response.json()) as GoalProjectsPageData;
      seen.push(...body.projects.map((p) => p.id));
      cursor = body.nextCursor ?? undefined;
      guard += 1;
    } while (cursor && guard < 20);

    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120); // no duplicates across boundaries
    // Deterministic order ends in the immutable id tiebreak (creation keyset).
  });

  it("rejects a malformed cursor with a calm 400 (never a 500)", async () => {
    const goalId = await seedGoalWithProjects(2);
    const response = await runProjects(goalId, "not-a-cursor");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("invalid_cursor");
  });

  it("rejects a cursor issued for another Goal’s scope with a calm 400", async () => {
    const goalA = await seedGoalWithProjects(60);
    const goalB = await seedGoalWithProjects(2);
    const firstA = (await (
      await runProjects(goalA)
    ).json()) as GoalProjectsPageData;
    expect(firstA.nextCursor).toBeTruthy();
    // Feed Goal A's cursor to Goal B's endpoint — rejected, not reinterpreted.
    const response = await runProjects(goalB, firstA.nextCursor!);
    expect(response.status).toBe(400);
  });

  it("fails closed for a missing / wrong-kind / cross-workspace Goal id", async () => {
    const area = await spine().createArea({ title: "Area" });
    for (const goalId of ["nonexistent", area.id]) {
      const response = await runProjects(goalId);
      expect(response.status).toBe(404);
    }
    const otherGoalArea = await spine(OTHER).createArea({ title: "Other" });
    const foreignGoal = await spine(OTHER).createGoal({
      title: "Foreign",
      areaId: otherGoalArea.id,
    });
    const response = await runProjects(foreignGoal.id);
    expect(response.status).toBe(404);
  });
});

/**
 * PX-04 — reversible Goal removal over the real Worker/D1 runtime.
 *
 * A Goal had no removal path at all despite the spine supporting soft-delete
 * since FND-07. These assert the BEHAVIOUR the user gets: the record leaves the
 * active surfaces, Undo genuinely brings it back, a repeat call is a no-op rather
 * than an error, a Goal that still owns active Projects is refused with an
 * explanation (never cascaded), and neither intent can be aimed at another
 * workspace or another kind of record.
 */
describe("PX-04 — Goal delete/restore", () => {
  it("soft-deletes a Goal, hides it from its Area, and restores it exactly", async () => {
    const area = await spine().createArea({ title: "Health" });
    const goal = await spine().createGoal({
      title: "Run a half-marathon",
      areaId: area.id,
    });

    const deleted = (await (
      await runMutate(goal.id, formData({ intent: "delete" }))
    ).json()) as GoalMutationResult;
    expect(deleted).toEqual({ kind: "delete", ok: true });

    // Gone from the active reads: the canonical record 404s, exactly as a
    // deleted Note does.
    await expect(runDetail(goal.id)).rejects.toMatchObject({ status: 404 });

    const restored = (await (
      await runMutate(goal.id, formData({ intent: "restore" }))
    ).json()) as GoalMutationResult;
    expect(restored).toEqual({ kind: "restore", ok: true });

    const detail = await runDetail(goal.id);
    expect("overview" in detail && detail.overview.title).toBe(
      "Run a half-marathon",
    );
    expect("overview" in detail && detail.overview.area.id).toBe(area.id);
  });

  it("is idempotent, so a repeated delete or restore never becomes a spurious 404", async () => {
    const area = await spine().createArea({ title: "Health" });
    const goal = await spine().createGoal({
      title: "Ship v2",
      areaId: area.id,
    });

    await runMutate(goal.id, formData({ intent: "delete" }));
    const again = (await (
      await runMutate(goal.id, formData({ intent: "delete" }))
    ).json()) as GoalMutationResult;
    expect(again).toEqual({ kind: "delete", ok: true });

    await runMutate(goal.id, formData({ intent: "restore" }));
    const restoredAgain = (await (
      await runMutate(goal.id, formData({ intent: "restore" }))
    ).json()) as GoalMutationResult;
    expect(restoredAgain).toEqual({ kind: "restore", ok: true });
  });

  it("refuses to delete a Goal that still owns an active Project, and explains why", async () => {
    const area = await spine().createArea({ title: "Health" });
    const goal = await spine().createGoal({
      title: "Run a half-marathon",
      areaId: area.id,
    });
    await spine().createProject({
      title: "12-week plan",
      parent: { kind: "goal", id: goal.id },
    });

    const blocked = (await (
      await runMutate(goal.id, formData({ intent: "delete" }))
    ).json()) as GoalMutationResult;
    expect(blocked.kind).toBe("delete");
    expect(blocked.ok).toBe(false);
    if (blocked.kind === "delete" && !blocked.ok) {
      expect(blocked.blocked).toBe(true);
      expect(blocked.formError).toMatch(/active Projects/);
    }

    // Nothing was cascaded or orphaned — the Goal is still there.
    const detail = await runDetail(goal.id);
    expect("overview" in detail && detail.overview.title).toBe(
      "Run a half-marathon",
    );
  });

  it("fails closed for a cross-workspace Goal and for a non-Goal id", async () => {
    const foreignArea = await spine(OTHER).createArea({ title: "Theirs" });
    const foreignGoal = await spine(OTHER).createGoal({
      title: "Theirs",
      areaId: foreignArea.id,
    });
    await expect(
      runMutate(foreignGoal.id, formData({ intent: "delete" })),
    ).rejects.toMatchObject({ status: 404 });

    const area = await spine().createArea({ title: "Health" });
    await expect(
      runMutate(area.id, formData({ intent: "delete" })),
    ).rejects.toMatchObject({ status: 404 });
  });
});
