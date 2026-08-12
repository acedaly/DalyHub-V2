import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as todayLoader } from "~/modules/today/routes/index";

import {
  FakeClock,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-05 Slice 4 — the ACTUAL `/today` route loader in the real Workers runtime
 * over real D1, proving "Continue working" is genuinely Active-only: `state: "open"`
 * plus `workflowStatus: "active"` together exclude Planned, On hold, Completed and
 * Archived projects (including a Completed or Archived project whose PRESERVED
 * workflow status is "active" — the state/completion/archival guards are
 * independent of workflow status), workspace isolation holds, the bound is the
 * existing repository contract, and every documented status transition (via the
 * real `ProjectSettingsRepository`) is reflected on the next loader read. This does
 * NOT re-prove the `workflowStatus` predicate itself — that is
 * `test/kernel/projects.test.ts` — only that the Today loader actually passes it
 * and consumes the trusted authenticated scope.
 *
 * Every fixture project is created WITH an open task, because the Today redesign
 * added one more condition on top of the query: "Continue working" lists projects
 * with work left to continue. A project with nothing open is not a suggestion, so
 * a project with no tasks would be correctly absent for a reason these tests are
 * not about — see the dedicated case at the end, which asserts exactly that.
 */

const WS = "test-default-workspace";
const OTHER = "ws_today_route_other";

const nextEntityId = sequentialIds("tdent");
const nextActivityId = sequentialIds("tdact");
const otherEntityId = sequentialIds("tdoent");
const otherActivityId = sequentialIds("tdoact");

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

function spine(clock: FakeClock = new FakeClock()) {
  return makeSpineRepository(makeContext(WS), {
    clock: clock.now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function settings() {
  return makeProjectSettingsRepository(makeContext(WS));
}

function assets() {
  return makeAssetRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-09T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function assetHistory() {
  return makeAssetHistoryRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-09T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** Finish every open task under a project, so archival is actually permitted. */
async function completeChildTasks(
  s: ReturnType<typeof spine>,
  projectId: string,
): Promise<void> {
  const page = await s.listChildren({ parentId: projectId, childKind: "task" });
  for (const child of page.items) {
    await s.complete(child.id);
  }
}

/** An Active project whose single task is DONE, so it can actually be archived. */
async function archivableProject(
  s: ReturnType<typeof spine>,
  title: string,
): Promise<string> {
  const id = await activeProject(s, title);
  await completeChildTasks(s, id);
  return id;
}

async function runToday() {
  return todayLoader({
    request: new Request("https://app.test/today"),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof todayLoader>[0]);
}

/**
 * An Active project with one OPEN task, so it is a candidate to continue.
 *
 * The task matters twice over: it is what makes the project "work to continue",
 * and it is what BLOCKS archival — the product refuses to archive a project with
 * unfinished tasks — so the archive cases below use `archivableProject` instead.
 */
async function activeProject(
  s: ReturnType<typeof spine>,
  title: string,
): Promise<string> {
  const area = await s.createArea({ title: `${title} area` });
  const project = await s.createProject({
    title,
    parent: { kind: "area", id: area.id },
  });
  await s.createTask({
    title: `${title} task`,
    parent: { kind: "project", id: project.id },
  });
  await settings().setStatus(project.id, "active");
  return project.id;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("GET /today — 'Continue working' is Active-only (PROJ-05 Slice 4)", () => {
  it("includes an Active, incomplete, non-archived project", async () => {
    const s = spine();
    const id = await activeProject(s, "Ship the launch");

    const data = await runToday();
    expect(
      data.day.continueProjects.map((project: { id: string }) => project.id),
    ).toEqual([id]);
    expect(data.day.continueProjects[0]?.title).toBe("Ship the launch");
  });

  it("excludes a Planned project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    await s.createProject({
      title: "Not yet started",
      parent: { kind: "area", id: area.id },
    });

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("excludes an On hold project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Paused work",
      parent: { kind: "area", id: area.id },
    });
    await settings().setStatus(project.id, "on_hold");

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("excludes a Completed project even when its workflow status is Active", async () => {
    const s = spine();
    const id = await activeProject(s, "Finished work");
    await s.complete(id);

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("excludes an Archived project even when its preserved workflow status is Active", async () => {
    const s = spine();
    const id = await archivableProject(s, "Archived work");
    await settings().archive(id);

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("preserves workspace isolation", async () => {
    const otherSpine = makeSpineRepository(makeContext(OTHER), {
      clock: new FakeClock().now,
      idGenerator: otherEntityId,
      activityIdGenerator: otherActivityId,
    });
    const otherSettings = makeProjectSettingsRepository(makeContext(OTHER));
    const area = await otherSpine.createArea({ title: "Other workspace area" });
    const project = await otherSpine.createProject({
      title: "Other workspace project",
      parent: { kind: "area", id: area.id },
    });
    await otherSettings.setStatus(project.id, "active");

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("shows at most three projects to continue", async () => {
    const s = spine();
    for (let i = 0; i < 8; i += 1) {
      await activeProject(s, `Active project ${i}`);
    }

    const data = await runToday();
    expect(data.day.continueProjects.length).toBe(3);
  });

  it("ranks by real ACTIVITY recency, not by a settings-only touch", async () => {
    const clock = new FakeClock();
    const s = spine(clock);
    const firstId = await activeProject(s, "First");
    clock.advance(1000);
    const secondId = await activeProject(s, "Second");

    // A settings-only transition bumps `first`'s effective `updatedAt`
    // (ADR-037 §37.2) — which is exactly the signal the old ordering used, and
    // exactly the signal the new one must NOT use: nothing was worked on.
    clock.advance(1000);
    await settings().setStatus(firstId, "on_hold");
    await settings().setStatus(firstId, "active");

    const data = await runToday();
    expect(
      data.day.continueProjects.map((project: { id: string }) => project.id),
    ).toEqual([secondId, firstId]);
  });

  it("excludes an Active project with no open work left to continue", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Nothing left",
      parent: { kind: "area", id: area.id },
    });
    await settings().setStatus(project.id, "active");

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("reflects a settings-only transition to Active", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const project = await s.createProject({
      title: "Newly activated",
      parent: { kind: "area", id: area.id },
    });
    await s.createTask({
      title: "Newly activated task",
      parent: { kind: "project", id: project.id },
    });

    expect((await runToday()).day.continueProjects).toEqual([]);

    await settings().setStatus(project.id, "active");
    const data = await runToday();
    expect(
      data.day.continueProjects.map((entry: { id: string }) => entry.id),
    ).toEqual([project.id]);
  });

  it("removes a project after Active → On hold", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then paused");
    expect(
      (await runToday()).day.continueProjects.map(
        (project: { id: string }) => project.id,
      ),
    ).toEqual([id]);

    await settings().setStatus(id, "on_hold");
    expect((await runToday()).day.continueProjects).toEqual([]);
  });

  it("removes a project after Active → Planned", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then planned");
    expect(
      (await runToday()).day.continueProjects.map(
        (project: { id: string }) => project.id,
      ),
    ).toEqual([id]);

    await settings().setStatus(id, "planned");
    expect((await runToday()).day.continueProjects).toEqual([]);
  });

  it("removes a project after archive", async () => {
    const s = spine();
    const id = await activeProject(s, "Active then archived");
    expect(
      (await runToday()).day.continueProjects.map(
        (entry: { id: string }) => entry.id,
      ),
    ).toEqual([id]);

    // Archival requires the open work to be finished first, so the project is
    // taken through the real sequence rather than a state it could never reach.
    await completeChildTasks(s, id);
    await settings().archive(id);
    expect((await runToday()).day.continueProjects).toEqual([]);
  });

  it("includes an Active project again after restore", async () => {
    const s = spine();
    const id = await archivableProject(s, "Restored active");
    await settings().archive(id);
    expect((await runToday()).day.continueProjects).toEqual([]);

    await settings().restore(id);
    // Restored, Active, and with work to continue again.
    await s.createTask({
      title: "Fresh work",
      parent: { kind: "project", id },
    });
    const data = await runToday();
    expect(
      data.day.continueProjects.map((entry: { id: string }) => entry.id),
    ).toEqual([id]);
  });

  it("does not include a restored Planned project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const planned = await s.createProject({
      title: "Restored planned",
      parent: { kind: "area", id: area.id },
    });
    await settings().archive(planned.id);
    await settings().restore(planned.id);
    // Work added AFTER the restore, so the only reason it stays out is its
    // Planned workflow status — not an absence of anything to continue.
    await s.createTask({
      title: "Restored planned task",
      parent: { kind: "project", id: planned.id },
    });

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("does not include a restored On hold project", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Career" });
    const onHold = await s.createProject({
      title: "Restored on hold",
      parent: { kind: "area", id: area.id },
    });
    await settings().setStatus(onHold.id, "on_hold");
    await settings().archive(onHold.id);
    await settings().restore(onHold.id);
    await s.createTask({
      title: "Restored on hold task",
      parent: { kind: "project", id: onHold.id },
    });

    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });

  it("returns the calm empty shape when no Active project exists", async () => {
    const data = await runToday();
    expect(data.day.continueProjects).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The day itself                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The loader's DAY, over real D1. The pure rules are unit-tested in
 * `test/unit/today/day-view.test.ts`; what is proved here is that the loader
 * actually reads a task's DUE date — the field the old Today ignored entirely,
 * which is why a task due today landed in "Anytime" and a task a week past its
 * deadline reported "0 overdue".
 */

/** The owner's calendar date, in the same timezone the loader resolves. */
function ownerToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(new Date());
}

function shiftDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

async function taskDue(
  s: ReturnType<typeof spine>,
  title: string,
  dueDate: string,
): Promise<string> {
  const area = await s.createArea({ title: `${title} area` });
  const record = await s.createTask({
    title,
    parent: { kind: "area", id: area.id },
  });
  await makeTaskRepository(makeContext(WS)).updateTask(record.id, { dueDate });
  return record.id;
}

describe("GET /today — the day is read from DUE dates, not plans alone", () => {
  it("puts a task due today on the day, with no plan set", async () => {
    const s = spine();
    const today = ownerToday();
    const id = await taskDue(s, "Due today", today);

    const data = await runToday();
    expect(data.day.today.map((task: { id: string }) => task.id)).toContain(id);
    expect(data.day.overdue).toEqual([]);
  });

  it("puts a task past its due date in the timeline — never in the rail", async () => {
    const s = spine();
    const id = await taskDue(s, "Late", shiftDays(ownerToday(), -3));

    const data = await runToday();
    expect(data.day.overdue.map((task: { id: string }) => task.id)).toEqual([
      id,
    ]);
    expect(
      data.day.attention.some(
        (item: { kind: string }) => item.kind === "inbox",
      ),
    ).toBe(false);
    expect(
      data.day.attention.map((item: { label: string }) => item.label),
    ).not.toContain("Late");
  });

  it("counts an unfiled open task as the inbox, and a filed one out of it", async () => {
    const s = spine();
    const tasks = makeTaskRepository(makeContext(WS));
    // Unfiled: created with no Area or Project above it — DalyHub's inbox, and
    // exactly the population the `/tasks?system=inbox` view holds.
    await tasks.createTask({ title: "Loose thought" });
    // Filed: the same task with a home is not inbox work.
    const area = await s.createArea({ title: "Home" });
    await s.createTask({
      title: "Filed thought",
      parent: { kind: "area", id: area.id },
    });

    const data = await runToday();
    const inbox = data.day.attention.find(
      (item: { kind: string }) => item.kind === "inbox",
    );
    expect(inbox?.detail).toBe("1 unfiled task");
    expect(inbox?.href).toBe("/tasks?system=inbox");
  });

  it("counts Inbox from the canonical Tasks view, not Today's bounded planning page", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    for (let i = 0; i < 105; i += 1) {
      await tasks.createTask({ title: `Loose thought ${i}` });
    }

    const data = await runToday();
    const inbox = data.day.attention.find(
      (item: { kind: string }) => item.kind === "inbox",
    );
    expect(inbox?.detail).toBe("105 unfiled tasks");
  });

  it("surfaces due Asset obligations only when an open linked Task is not already carrying them", async () => {
    const dueTomorrow = shiftDays(ownerToday(), 1);
    const assetRepo = assets();
    const history = assetHistory();
    const ute = await assetRepo.create({
      title: "Hilux",
      assetType: "vehicle",
    });
    const mower = await assetRepo.create({
      title: "Mower",
      assetType: "equipment",
    });
    await history.createObligation(ute.id, {
      category: "registration",
      title: "Renew registration",
      dueDate: dueTomorrow,
      leadDays: 14,
    });
    const linked = await history.createObligation(mower.id, {
      category: "service",
      title: "Sharpen blades",
      dueDate: dueTomorrow,
      leadDays: 14,
    });
    const task = await makeTaskRepository(makeContext(WS)).createTask({
      title: "Book mower service",
      dueDate: ownerToday(),
    });
    await history.linkObligationTask(linked.id, task.id);

    const data = await runToday();
    const asset = data.day.attention.find(
      (item: { kind: string }) => item.kind === "asset",
    );
    expect(asset).toMatchObject({
      label: "Hilux",
      href: `/asset/${ute.id}?tab=obligations`,
    });
    expect(asset?.detail).toContain("1 tracked as a task");
  });

  it("returns a quiet, correct day when the workspace holds nothing", async () => {
    const data = await runToday();
    expect(data.day.overdue).toEqual([]);
    expect(data.day.today).toEqual([]);
    expect(data.day.meetings).toEqual([]);
    expect(data.day.attention).toEqual([]);
    expect(data.day.continueProjects).toEqual([]);
    expect(data.day.dateLong.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* TODAY-10 — Today Focus ↔ the canonical Tasks `today` view                   */
/* -------------------------------------------------------------------------- */

/**
 * The equivalence contract, driven over real D1 through the ACTUAL loader.
 *
 * TODAY-09 made Today and `/tasks?system=today` agree about what "today" means;
 * TODAY-10 is what stops them drifting apart again. The whole point of this
 * block is that neither side is re-implemented here: it runs the real loader and
 * the real workspace read model and compares the two SETS. Focus may file a Task
 * in a different BAND (a Task due today whose plan has slipped belongs under
 * Overdue), so the comparison is against the panel's whole composition —
 * everything the Focus panel can draw — which is exactly the claim being made.
 */
describe("TODAY-10 — Today Focus holds the canonical Tasks `today` set", () => {
  /** Every open Task id the canonical `/tasks?system=today` view returns. */
  async function canonicalTodayIds(): Promise<readonly string[]> {
    const page = await makeTaskRepository(makeContext(WS)).listWorkspaceTasks({
      view: "today",
      todayIso: ownerToday(),
      limit: 100,
    });
    return page.items.map((item) => item.id).sort();
  }

  /** Every Task id the Focus panel can draw, across all three of its bands. */
  function focusIds(day: {
    readonly overdue: readonly { readonly id: string }[];
    readonly today: readonly { readonly id: string }[];
  }): readonly string[] {
    return [...day.overdue, ...day.today].map((task) => task.id).sort();
  }

  async function seedTask(
    title: string,
    fields: {
      readonly dueDate?: string | null;
      readonly scheduledDate?: string | null;
      readonly priority?: "p1" | "p2" | "p3" | "p4";
      readonly status?: "todo" | "in_progress" | "on_hold";
    } = {},
  ): Promise<string> {
    const tasks = makeTaskRepository(makeContext(WS));
    const record = await tasks.createTask({ title });
    await tasks.updateTask(record.id, fields);
    return record.id;
  }

  it("agrees on a day holding every kind of Task at once", async () => {
    const today = ownerToday();
    const dueOnly = await seedTask("Due today", { dueDate: today });
    const plannedOnly = await seedTask("Planned today", {
      scheduledDate: today,
    });
    const both = await seedTask("Due and planned today", {
      dueDate: today,
      scheduledDate: today,
    });
    // Due today, but the PLAN slipped: one of today's Tasks on both surfaces,
    // and Focus files it under Overdue because that is where the owner needs it.
    const slippedPlan = await seedTask("Due today, planned Monday", {
      dueDate: today,
      scheduledDate: shiftDays(today, -4),
    });
    // Present but NOT today's work on either surface.
    await seedTask("Overdue", { dueDate: shiftDays(today, -2) });
    await seedTask("Future", { dueDate: shiftDays(today, 5) });
    await seedTask("No dates at all");

    const data = await runToday();
    const canonical = await canonicalTodayIds();

    expect(canonical).toEqual([dueOnly, plannedOnly, both, slippedPlan].sort());
    // Focus draws the canonical set (plus outright-overdue work, which is the
    // one deliberate difference and is banded as such).
    for (const id of canonical) {
      expect(focusIds(data.day)).toContain(id);
    }
    expect(data.day.overdue.map((task: { id: string }) => task.id)).toContain(
      slippedPlan,
    );
    // …and each of them exactly once, however many signals it carries.
    const drawn = [...data.day.overdue, ...data.day.today].map(
      (task: { id: string }) => task.id,
    );
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it("agrees that a PARKED Task is not dated work (waiting and on hold alike)", async () => {
    const today = ownerToday();
    const ordinary = await seedTask("Ordinary", { dueDate: today });
    const onHold = await seedTask("Paused", {
      dueDate: today,
      status: "on_hold",
    });
    const waiting = await seedTask("Blocked on someone", { dueDate: today });
    await makeTaskRepository(makeContext(WS)).setWaiting(waiting, {
      target: { kind: "text", note: "Chasing legal" },
    });

    const data = await runToday();
    expect(await canonicalTodayIds()).toEqual([ordinary]);
    expect(focusIds(data.day)).toEqual([ordinary]);
    expect(focusIds(data.day)).not.toContain(onHold);
    // Both stay reachable where they belong — nothing was destroyed, only
    // filed: the on-hold Task is still in `all`, the waiting one in `waiting`.
    const repo = makeTaskRepository(makeContext(WS));
    const all = await repo.listWorkspaceTasks({
      view: "all",
      todayIso: today,
      limit: 100,
    });
    expect(all.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([onHold, waiting]),
    );
    const parked = await repo.listWorkspaceTasks({
      view: "waiting",
      todayIso: today,
      limit: 100,
    });
    expect(parked.items.map((item) => item.id)).toEqual([waiting]);
  });

  it("drops a Task from BOTH surfaces the moment it is completed", async () => {
    const today = ownerToday();
    const open = await seedTask("Still to do", { dueDate: today });
    const done = await seedTask("Already finished", { dueDate: today });
    // Completed through the real task-domain operation on the REAL clock, so
    // the completion instant resolves to the owner's calendar day.
    await makeTaskRepository(makeContext(WS)).completeTask(done);

    const data = await runToday();
    // The canonical view holds only what is left to do…
    expect(await canonicalTodayIds()).toEqual([open]);
    // …while Focus still SHOWS the completion, dimmed, in the band it was in,
    // because the day's progress figure counts it. It is not active work: the
    // completion is what `completedToday` reports.
    expect(
      data.day.completedToday.map((task: { id: string }) => task.id),
    ).toEqual([done]);
    expect(
      data.day.today
        .filter((task: { completed: boolean }) => !task.completed)
        .map((task: { id: string }) => task.id),
    ).toEqual([open]);
  });

  it("resolves the day boundary in the OWNER's timezone, not the runtime's", async () => {
    // `ownerToday()` formats in Australia/Sydney, the same zone the loader uses
    // (SET-01 `appPreferences.timezone`). On a UTC runtime the two calendar days
    // differ for most of the day, so a Task dated by the owner's day must land
    // on the day and one dated by UTC's must not when they disagree.
    const ownerDay = ownerToday();
    const utcDay = new Date().toISOString().slice(0, 10);
    const onOwnerDay = await seedTask("Owner's today", { dueDate: ownerDay });

    const data = await runToday();
    expect(data.day.todayIso).toBe(ownerDay);
    expect(data.day.today.map((task: { id: string }) => task.id)).toContain(
      onOwnerDay,
    );
    if (utcDay !== ownerDay) {
      const onUtcDay = await seedTask("UTC's today", { dueDate: utcDay });
      const after = await runToday();
      expect(
        after.day.today.map((task: { id: string }) => task.id),
      ).not.toContain(onUtcDay);
    }
  });

  it("orders the day by priority, then deadline — not alphabetically", async () => {
    const today = ownerToday();
    const plain = await seedTask("Aardvark", { dueDate: today });
    const urgent = await seedTask("Zebra", { dueDate: today, priority: "p1" });

    const data = await runToday();
    expect(data.day.today.map((task: { id: string }) => task.id)).toEqual([
      urgent,
      plain,
    ]);
  });
});
