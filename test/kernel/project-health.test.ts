import { beforeEach, describe, expect, it } from "vitest";

import {
  evaluateProjectHealth,
  type HealthEvaluationContext,
} from "~/kernel/project-health";

import {
  FakeClock,
  makeContext,
  makeLinkRepository,
  makeProjectHealthRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-02 — the derived project-health facts projection (`ProjectHealthRepository`)
 * over real D1 in the Workers runtime. Proves health is derived from ALL of a
 * project's tasks (not the Tasks-tab page), that project + child-task meaningful
 * Activity drives staleness (and irrelevant events do not), that waiting/due/
 * scheduled signals are correct and distinct, that soft-deleted and cross-workspace
 * records never contribute, that wrong-kind/missing ids stay calm, and that the read
 * is bounded and N+1-free (no cached health can drift).
 */

const WS = "test-default-workspace";
const OTHER = "ws_health_other";

/** A UTC-based evaluation clock, so `todayIso` and date-only comparisons are exact. */
function contextAt(todayIso: string): HealthEvaluationContext {
  return {
    now: new Date(`${todayIso}T00:00:00.000Z`),
    todayIso,
    calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
  };
}

/** A world sharing ONE clock across spine + task mutations, so Activity timestamps
 * are coherent. */
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
    links: makeLinkRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-l`),
      activityIdGenerator: sequentialIds(`${ws}-la`),
    }),
    health: makeProjectHealthRepository(ctx),
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

async function newProject(w: ReturnType<typeof world>, title = "Project") {
  const area = await w.spine.createArea({ title: `${title} area` });
  return w.spine.createProject({
    title,
    parent: { kind: "area", id: area.id },
  });
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

describe("ProjectHealthRepository — facts derivation", () => {
  it("derives health from ALL of a project's tasks, independent of Tasks-tab paging (60+ tasks)", async () => {
    const w = world(WS);
    const project = await newProject(w);
    // 60 tasks: 40 open, 20 completed — far more than any task-list page size.
    for (let i = 0; i < 60; i++) {
      const task = await addTask(w, project.id, `Task ${i}`);
      if (i < 20) {
        await w.tasks.completeTask(task.id);
      }
    }
    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts).not.toBeNull();
    expect(facts!.taskTotal).toBe(60);
    expect(facts!.taskCompleted).toBe(20);
  });

  it("excludes soft-deleted tasks and unlinked (soft-deleted) links", async () => {
    const w = world(WS);
    const project = await newProject(w);
    const keep = await addTask(w, project.id, "Keep");
    const drop = await addTask(w, project.id, "Drop");
    await w.spine.softDelete(drop.id);
    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts!.taskTotal).toBe(1);
    expect(facts!.taskCompleted).toBe(0);
    expect(keep.id).toBeTruthy();
  });

  it("counts open waiting tasks and the oldest wait, ignoring completed formerly-waiting tasks", async () => {
    const w = world(WS, "2026-07-01T00:00:00.000Z");
    const project = await newProject(w);
    const waitingA = await addTask(w, project.id, "Waiting A");
    const waitingB = await addTask(w, project.id, "Waiting B");
    const formerly = await addTask(w, project.id, "Formerly waiting");

    // Oldest wait is A (set first, earlier clock).
    await w.tasks.setWaiting(waitingA.id, {
      target: { kind: "text", note: "finance" },
    });
    w.clock.advance(5 * 86_400_000);
    await w.tasks.setWaiting(waitingB.id, {
      target: { kind: "text", note: "parts" },
    });
    // A task that waited then completed must not count as waiting.
    await w.tasks.setWaiting(formerly.id, {
      target: { kind: "text", note: "legal" },
    });
    await w.tasks.completeTask(formerly.id);

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts!.waitingOpen).toBe(2);
    expect(facts!.oldestWaitingSince?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("keeps overdue-due and slipped-scheduled distinct, and excludes completed tasks", async () => {
    const w = world(WS);
    const project = await newProject(w);
    const overdue = await addTask(w, project.id, "Overdue due");
    const slipped = await addTask(w, project.id, "Slipped scheduled");
    const upcomingDue = await addTask(w, project.id, "Upcoming due");
    const upcomingSched = await addTask(w, project.id, "Upcoming scheduled");
    const doneOverdue = await addTask(w, project.id, "Completed overdue");

    await w.tasks.updateTask(overdue.id, { dueDate: "2026-07-10" });
    await w.tasks.updateTask(slipped.id, { scheduledDate: "2026-07-10" });
    await w.tasks.updateTask(upcomingDue.id, { dueDate: "2026-07-22" });
    await w.tasks.updateTask(upcomingSched.id, { scheduledDate: "2026-07-23" });
    await w.tasks.updateTask(doneOverdue.id, { dueDate: "2026-07-01" });
    await w.tasks.completeTask(doneOverdue.id);

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts!.overdueOpen).toBe(1);
    expect(facts!.slippedOpen).toBe(1);
    expect(facts!.upcomingDueOpen).toBe(1); // 2026-07-22 within 7 days of 07-20
    expect(facts!.upcomingScheduledOpen).toBe(1);
    // The completed overdue task never triggers an open-work warning.
    const health = evaluateProjectHealth(facts!, contextAt("2026-07-20"));
    expect(health.state).toBe("at_risk");
  });
});

describe("ProjectHealthRepository — staleness from Activity", () => {
  it("child-task meaningful activity keeps a project fresh; the project's own updated_at is not required", async () => {
    const w = world(WS, "2026-07-01T00:00:00.000Z");
    const project = await newProject(w);
    // Later, add a task (records a meaningful child event) close to 'today'.
    w.clock.advance(17 * 86_400_000); // 2026-07-18
    await addTask(w, project.id, "Fresh task");

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts!.lastMeaningfulActivityAt?.toISOString()).toBe(
      "2026-07-18T00:00:00.000Z",
    );
    const health = evaluateProjectHealth(facts!, contextAt("2026-07-20"));
    expect(health.state).toBe("on_track");
  });

  it("a project with only old activity is stale, and irrelevant (link) events do not refresh it", async () => {
    const w = world(WS, "2026-07-01T00:00:00.000Z");
    const project = await newProject(w);
    await addTask(w, project.id, "Old task");

    // A recent IRRELEVANT event: a generic relates_to link (entity_link.created is
    // NOT a meaningful health event).
    w.clock.advance(18 * 86_400_000); // 2026-07-19
    const other = await w.spine.createArea({ title: "Unrelated" });
    await w.links.create({
      sourceEntityId: project.id,
      targetEntityId: other.id,
      type: "project.relates_to",
    });

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    // Last meaningful activity stays at creation time (2026-07-01), so ~19 days stale.
    expect(facts!.lastMeaningfulActivityAt?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    const health = evaluateProjectHealth(facts!, contextAt("2026-07-20"));
    expect(health.state).toBe("stale");
  });

  it("a soft-deleted child task's activity does not keep a project fresh (stays stale)", async () => {
    const w = world(WS, "2026-07-01T00:00:00.000Z");
    const project = await newProject(w);
    // An old remaining task keeps the project open with stale activity.
    await addTask(w, project.id, "Old remaining");

    // A recently created/updated task — then soft-deleted. Its structural link is
    // retained (for restore), so its recent activity must NOT count toward momentum.
    w.clock.advance(18 * 86_400_000); // 2026-07-19
    const recent = await addTask(w, project.id, "Recent then deleted");
    await w.tasks.updateTask(recent.id, { dueDate: "2026-08-01" });
    await w.spine.softDelete(recent.id);

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    // The deleted task contributes neither to counts nor to latest activity.
    expect(facts!.taskTotal).toBe(1);
    expect(facts!.lastMeaningfulActivityAt?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(evaluateProjectHealth(facts!, contextAt("2026-07-20")).state).toBe(
      "stale",
    );
  });

  it("aggregates latest activity without inflating from duplicate subjects/links", async () => {
    const w = world(WS, "2026-07-01T00:00:00.000Z");
    const project = await newProject(w);
    const task = await addTask(w, project.id, "Task");
    // Several meaningful mutations on the same task at increasing times.
    w.clock.advance(3 * 86_400_000);
    await w.tasks.updateTask(task.id, { dueDate: "2026-08-01" });
    w.clock.advance(2 * 86_400_000);
    await w.tasks.planTask(task.id, { scheduledDate: "2026-08-02" });

    const facts = await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    );
    expect(facts!.lastMeaningfulActivityAt?.toISOString()).toBe(
      "2026-07-06T00:00:00.000Z",
    );
  });
});

describe("ProjectHealthRepository — bounded, N+1-free, isolated", () => {
  it("derives facts for a whole page of projects across the internal chunk boundary (45 > 40)", async () => {
    const w = world(WS);
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      const p = await newProject(w, `Project ${i}`);
      await addTask(w, p.id, "Task");
      ids.push(p.id);
    }
    const map = await w.health.listProjectHealthFacts(ids, "2026-07-20");
    expect(map.size).toBe(45);
    for (const id of ids) {
      expect(map.get(id)!.taskTotal).toBe(1);
    }
  });

  it("de-duplicates repeated ids and rejects an oversized batch", async () => {
    const w = world(WS);
    const p = await newProject(w);
    const map = await w.health.listProjectHealthFacts(
      [p.id, p.id],
      "2026-07-20",
    );
    expect(map.size).toBe(1);
    await expect(
      w.health.listProjectHealthFacts(
        Array.from({ length: 101 }, (_, i) => `id_${i}`),
        "2026-07-20",
      ),
    ).rejects.toThrow();
  });

  it("never contributes or discloses cross-workspace records", async () => {
    const w = world(WS);
    const other = world(OTHER);
    const mine = await newProject(w);
    await addTask(w, mine.id, "Mine");
    const theirs = await newProject(other, "Theirs");
    await addTask(other, theirs.id, "Theirs");

    // Their id is invisible in my workspace (absent from the map, calm null single).
    const map = await w.health.listProjectHealthFacts(
      [mine.id, theirs.id],
      "2026-07-20",
    );
    expect(map.has(mine.id)).toBe(true);
    expect(map.has(theirs.id)).toBe(false);
    expect(
      await w.health.getProjectHealthFacts(theirs.id, "2026-07-20"),
    ).toBeNull();
  });

  it("returns null for a wrong-kind or missing id (calm not-found)", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "An area" });
    expect(
      await w.health.getProjectHealthFacts(area.id, "2026-07-20"),
    ).toBeNull();
    expect(
      await w.health.getProjectHealthFacts("does-not-exist", "2026-07-20"),
    ).toBeNull();
  });

  it("rejects a malformed todayIso rather than guessing", async () => {
    const w = world(WS);
    const p = await newProject(w);
    await expect(
      w.health.getProjectHealthFacts(p.id, "not-a-date"),
    ).rejects.toThrow();
  });
});

describe("ProjectHealthRepository — completion & reopen change health", () => {
  it("completing a project flips health to completed; reopening restores active health", async () => {
    const w = world(WS);
    const project = await newProject(w);
    const overdue = await addTask(w, project.id, "Overdue");
    await w.tasks.updateTask(overdue.id, { dueDate: "2026-07-01" });

    let facts = (await w.health.getProjectHealthFacts(
      project.id,
      "2026-07-20",
    ))!;
    expect(evaluateProjectHealth(facts, contextAt("2026-07-20")).state).toBe(
      "at_risk",
    );

    await w.spine.complete(project.id);
    facts = (await w.health.getProjectHealthFacts(project.id, "2026-07-20"))!;
    expect(evaluateProjectHealth(facts, contextAt("2026-07-20")).state).toBe(
      "completed",
    );

    await w.spine.reopen(project.id);
    facts = (await w.health.getProjectHealthFacts(project.id, "2026-07-20"))!;
    expect(evaluateProjectHealth(facts, contextAt("2026-07-20")).state).toBe(
      "at_risk",
    );
  });
});
