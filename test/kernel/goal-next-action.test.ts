/**
 * STEER-04 — from a signal to a STEP, against real D1.
 *
 * The kernel rule and its repository are proven equal in
 * `task-next-action.test.ts`. This file proves the two things that only exist
 * once the rule reaches a surface:
 *
 *   1. **The Goal-level composition.** A Goal's next step is chosen across its
 *      contributing Projects by the SAME ordering, deterministically, and is
 *      absent — never fabricated — when nothing is eligible.
 *   2. **The creation loop, end to end.** From a Goal with no contributing
 *      Project, `POST /projects/new` with the Goal as parent produces a Project
 *      that is contributing structure immediately, and its first completed Task
 *      moves the Goal's movement line.
 *
 * …plus the budgets both claims rest on: Today's cards cost ONE bounded
 * statement whatever the number of cards, and a Goal's next step costs one
 * whatever the number of Projects.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import { createActivityActorContext } from "~/kernel/activity";
import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import { loader as goalLoader } from "~/modules/goals/routes/detail";
import { action as newProjectAction } from "~/modules/projects/routes/new";
import { loadTodayDay } from "~/modules/today/day/load";
import { readGoalNextAction } from "~/shared/task-record/next-action-load.server";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeGoalDetailsRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goal_next_action_other";
const ZONE = "Australia/Brisbane";

const nextEntityId = sequentialIds("gna-e");
const nextActivityId = sequentialIds("gna-a");
const nextDetailsId = sequentialIds("gna-d");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
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
    clock: () => new Date(),
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function tasks(ws = WS) {
  return makeTaskRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function details(ws = WS) {
  return makeGoalDetailsRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextDetailsId,
  });
}

function scopeFor(db: D1Database = env.DB, ws = WS) {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(ws),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function runGoalRecord(goalId: string) {
  return goalLoader({
    request: new Request(`https://app.test/goals/${goalId}`),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof goalLoader>[0]);
}

async function createProjectForGoal(goalId: string, title: string) {
  const body = new FormData();
  body.set("title", title);
  body.set("parentId", goalId);
  body.set("templateId", "");
  body.set("iconKey", "");
  body.set("colourSlot", "");
  const response = await newProjectAction({
    request: new Request("https://app.test/projects/new", {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newProjectAction>[0]);
  return (await (response as Response).json()) as
    | { readonly ok: true; readonly projectId: string }
    | { readonly ok: false; readonly formError?: string };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* The Goal-level composition                                                  */
/* -------------------------------------------------------------------------- */

describe("a Goal names its next step through its contributing Projects", () => {
  it("chooses across Projects by the canonical ordering, and predictably", async () => {
    const s = spine();
    const t = tasks();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });

    const first = await s.createProject({
      title: "Base building",
      parent: { kind: "goal", id: goal.id },
    });
    const second = await s.createProject({
      title: "Speed work",
      parent: { kind: "goal", id: goal.id },
    });
    const low = await t.createTask({
      title: "Buy shoes",
      parent: { kind: "project", id: first.id },
    });
    await t.updateTask(low.id, { priority: "p3" });
    const high = await t.createTask({
      title: "Book the physio",
      parent: { kind: "project", id: second.id },
    });
    await t.updateTask(high.id, { priority: "p1" });

    const record = await runGoalRecord(goal.id);
    expect(record.nextAction).not.toBeNull();
    expect(record.nextAction!.title).toBe("Book the physio");
    // It names the PROJECT, because a Goal shows several and the Task's own
    // title is not enough to place it.
    expect(record.nextAction!.projectTitle).toBe("Speed work");

    // Deterministic: the same unchanged data answers the same way on reload.
    const again = await runGoalRecord(goal.id);
    expect(again.nextAction).toEqual(record.nextAction);
  });

  it("names nothing when every open Task under the Goal is parked or blocked", async () => {
    const s = spine();
    const t = tasks();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });
    const project = await s.createProject({
      title: "Base building",
      parent: { kind: "goal", id: goal.id },
    });
    const waiting = await t.createTask({
      title: "Wait for the club",
      parent: { kind: "project", id: project.id },
    });
    await t.setWaiting(waiting.id, {
      target: { kind: "text", note: "the club" },
    });
    const blocker = await t.createTask({
      title: "Get a medical",
      parent: { kind: "project", id: project.id },
    });
    const blocked = await t.createTask({
      title: "Enter the race",
      parent: { kind: "project", id: project.id },
    });
    await t.addTaskDependency(blocked.id, blocker.id);
    await t.completeTask(blocker.id);
    // With its blocker COMPLETE, the previously blocked Task becomes eligible —
    // which is the rule reading live edges rather than a stored flag.
    expect((await runGoalRecord(goal.id)).nextAction?.title).toBe(
      "Enter the race",
    );

    // Park it, and the Goal honestly names nothing.
    await t.updateTask(blocked.id, { status: "on_hold" });
    const parked = await runGoalRecord(goal.id);
    expect(parked.nextAction).toBeNull();
    // …while every derived fact it has is still stated.
    expect(parked.alignment).toBeDefined();
    expect(parked.movement).toBeDefined();
    expect(parked.progress).toBeDefined();
  });

  it("names nothing — and fabricates nothing — for a Goal with no Project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Learn cello", areaId: area.id });
    const record = await runGoalRecord(goal.id);
    expect(record.nextAction).toBeNull();
    expect(record.contribution.total).toBe(0);
    // The alignment evaluation says the structural thing, which is what the
    // record's create-structure door is offered against.
    expect(record.alignment.state).toBe("no_structure");
  });

  it("never reaches another workspace's Tasks", async () => {
    const mine = spine(WS);
    const theirs = spine(OTHER);
    const theirTasks = tasks(OTHER);
    const myArea = await mine.createArea({ title: "Health" });
    const myGoal = await mine.createGoal({
      title: "Run a half",
      areaId: myArea.id,
    });
    const theirArea = await theirs.createArea({ title: "Health" });
    const theirGoal = await theirs.createGoal({
      title: "Run a half",
      areaId: theirArea.id,
    });
    const theirProject = await theirs.createProject({
      title: "Base building",
      parent: { kind: "goal", id: theirGoal.id },
    });
    await theirTasks.createTask({
      title: "Their next action",
      parent: { kind: "project", id: theirProject.id },
    });

    // Asked in MY workspace about THEIR Project, the answer is nothing.
    const leaked = await readGoalNextAction(scopeFor(env.DB, WS), {
      projects: [{ id: theirProject.id, title: "Base building" }],
      todayIso: todayIso(),
      timezone: ZONE,
    });
    expect(leaked).toBeNull();
    expect((await runGoalRecord(myGoal.id)).nextAction).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* "New Project for this Goal" — the loop, end to end                          */
/* -------------------------------------------------------------------------- */

describe("New Project for this Goal", () => {
  it("creates a contributing Project whose first completed Task moves the Goal", async () => {
    const s = spine();
    const t = tasks();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });

    const before = await runGoalRecord(goal.id);
    expect(before.contribution.total).toBe(0);
    expect(before.movement.moved).toBe(false);

    const created = await createProjectForGoal(goal.id, "Base building");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    /*
     * The relationship is correct IMMEDIATELY — no manual re-linking. The Goal's
     * own record read (a fresh loader run, i.e. a reload) reports the Project as
     * contributing structure, and it is the SPINE's `project.advances_goal`
     * parentage rather than a second link the create door invented.
     */
    const after = await runGoalRecord(goal.id);
    expect(after.contribution.total).toBe(1);
    expect(after.projects.map((project) => project.id)).toContain(
      created.projectId,
    );
    const parent = await scopeFor().spine.getById(created.projectId);
    expect(parent?.kind).toBe("project");
    const projectRecord = await scopeFor().projects.getProjectOverview(
      created.projectId,
    );
    expect(projectRecord?.goal?.id).toBe(goal.id);

    // A Task under it is immediately the Goal's next step…
    const task = await t.createTask({
      title: "Run 5km",
      parent: { kind: "project", id: created.projectId },
    });
    expect((await runGoalRecord(goal.id)).nextAction?.title).toBe("Run 5km");

    // …and completing it moves the Goal's movement line. The loop, closed.
    await t.completeTask(task.id);
    const moved = await runGoalRecord(goal.id);
    expect(moved.movement.available).toBe(true);
    expect(moved.movement.moved).toBe(true);
  });

  it("refuses a parent that is not an Area or Goal in this workspace", async () => {
    const theirs = spine(OTHER);
    const theirArea = await theirs.createArea({ title: "Health" });
    const theirGoal = await theirs.createGoal({
      title: "Theirs",
      areaId: theirArea.id,
    });
    const refused = await createProjectForGoal(theirGoal.id, "Sneaky");
    expect(refused.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Budgets                                                                     */
/* -------------------------------------------------------------------------- */

describe("the next action costs one bounded statement, never one per record", () => {
  it("is flat in the number of a Goal's Projects", async () => {
    const s = spine();
    const t = tasks();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Run a half", areaId: area.id });
    const projects: { id: string; title: string }[] = [];
    for (let index = 0; index < 8; index += 1) {
      const project = await s.createProject({
        title: `Project ${index}`,
        parent: { kind: "goal", id: goal.id },
      });
      await t.createTask({
        title: `Task ${index}`,
        parent: { kind: "project", id: project.id },
      });
      projects.push({ id: project.id, title: project.title });
    }

    const counting = countingDb(env.DB);
    const scope = scopeFor(counting.db);

    counting.reset();
    await readGoalNextAction(scope, {
      projects: projects.slice(0, 2),
      todayIso: todayIso(),
      timezone: ZONE,
    });
    const few = counting.prepareCount();

    counting.reset();
    await readGoalNextAction(scope, {
      projects,
      todayIso: todayIso(),
      timezone: ZONE,
    });
    const many = counting.prepareCount();

    // ONE statement. An implementation that asked per Project would read eight.
    expect(few).toBe(1);
    expect(many).toBe(1);
  });

  it("is flat in the number of Today's Continue working cards", async () => {
    const s = spine();
    const t = tasks();
    const settings = makeProjectSettingsRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("gna-ps"),
    });
    const area = await s.createArea({ title: "Home" });

    const seedProjects = async (count: number) => {
      for (let index = 0; index < count; index += 1) {
        const project = await s.createProject({
          title: `Project ${index}`,
          parent: { kind: "area", id: area.id },
        });
        await settings.setStatus(project.id, "active");
        await t.createTask({
          title: `Open ${index}`,
          parent: { kind: "project", id: project.id },
        });
      }
    };

    const facts = {
      now: new Date(),
      timezone: ZONE,
      todayIso: todayIso(),
      dateLong: "Today",
      hour: 9,
      ownerName: null,
      firstDayOfWeek: "monday" as const,
      dateFormat: "d_mmm_yyyy" as const,
    };

    await seedProjects(2);
    const counting = countingDb(env.DB);
    counting.reset();
    const small = await loadTodayDay(scopeFor(counting.db), facts);
    const few = counting.prepareCount();
    expect(small.continueProjects.length).toBe(2);

    await seedProjects(6);
    counting.reset();
    const large = await loadTodayDay(scopeFor(counting.db), facts);
    const many = counting.prepareCount();

    // "Continue working" is capped, so the cards do not grow — and neither does
    // the cost. Six candidates cost exactly what two did.
    expect(many).toBe(few);
    expect(large.continueProjects.length).toBeGreaterThan(0);
    for (const card of large.continueProjects) {
      expect(card.nextAction?.title).toMatch(/^Open /);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The owner's condition                                                       */
/* -------------------------------------------------------------------------- */

describe("a Goal the owner set aside", () => {
  it("is offered no next step on Today, and still answers on its record", async () => {
    const s = spine();
    const t = tasks();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Learn cello", areaId: area.id });
    const project = await s.createProject({
      title: "Lessons",
      parent: { kind: "goal", id: goal.id },
    });
    await t.createTask({
      title: "Book a teacher",
      parent: { kind: "project", id: project.id },
    });
    await details().update(goal.id, { condition: "set_aside" });

    const facts = {
      now: new Date(),
      timezone: ZONE,
      todayIso: todayIso(),
      dateLong: "Today",
      hour: 9,
      ownerName: null,
      firstDayOfWeek: "monday" as const,
      dateFormat: "d_mmm_yyyy" as const,
    };
    const today = await loadTodayDay(scopeFor(), facts);
    // ADR-111 decision 3 — it leaves the attention surface entirely, so there is
    // no Goal there to be offered a next step.
    expect(today.goals.map((entry) => entry.id)).not.toContain(goal.id);

    // …and the record still answers when asked.
    const record = await runGoalRecord(goal.id);
    expect(record.nextAction?.title).toBe("Book a teacher");
    expect(record.details.condition).toBe("set_aside");
  });
});
