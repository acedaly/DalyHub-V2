/**
 * REVIEW-03 — the insight aggregates, the snapshot and the projection, against
 * real D1.
 *
 * What these make enforceable rather than aspirational: exact period counts read
 * from the append-only Activity stream, workspace isolation on every read AND
 * every write, deterministic ordering, snapshot idempotency and version
 * fail-closed behaviour, a FIXED query budget for the whole evidence load, and
 * that the budget is flat with respect to workspace size.
 *
 * Query counting wraps the real D1 binding: every executed statement (and every
 * batch) is one unit, deliberately execution-based rather than `prepare`-based,
 * because what costs a round trip is running a statement.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  REVIEW_INSIGHT_SNAPSHOT_VERSION,
  buildReviewInsightSnapshot,
  classifyGoalContribution,
  type ReviewPeriodWindow,
} from "~/kernel/review-insights";
import {
  REVIEW_INSIGHTS_QUERY_BUDGET,
  captureReviewInsightSnapshot,
  loadReviewInsights,
  reviewPeriodWindow,
} from "~/modules/reviews/insights/review-insights-context";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import type { Review } from "~/kernel/reviews";

import {
  makeContext,
  makeReviewInsightRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  FakeClock,
  sequentialIds,
} from "./support";

const WS = "test-insights-workspace";
const OTHER = "test-insights-other";
const TZ = "Australia/Brisbane"; // No DST — period boundaries stay legible.
const NOW = new Date("2026-08-03T09:00:00.000Z");
const TODAY = "2026-08-03";

const PERIOD_START = "2026-07-27";
const PERIOD_END = "2026-08-02";
const PREVIOUS_START = "2026-07-20";
const PREVIOUS_END = "2026-07-26";

const WINDOW: ReviewPeriodWindow = reviewPeriodWindow(
  PERIOD_START,
  PERIOD_END,
  TZ,
);

/** An instant inside the Review period, in the owner's calendar. */
const IN_PERIOD_INSTANT = "2026-07-30T02:00:00.000Z";

/* -------------------------------------------------------------------------- */
/* A counting D1 binding                                                       */
/* -------------------------------------------------------------------------- */

interface Counter {
  count: number;
}

function countingDatabase(counter: Counter): D1Database {
  const real = env.DB;
  function wrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        if (property === "bind") {
          return (...args: unknown[]) =>
            wrapStatement(
              (value as (...a: unknown[]) => D1PreparedStatement).apply(
                target,
                args,
              ),
            );
        }
        if (
          property === "first" ||
          property === "all" ||
          property === "run" ||
          property === "raw"
        ) {
          return (...args: unknown[]) => {
            counter.count += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });
  }
  return new Proxy(real, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "prepare") {
        return (sql: string) =>
          wrapStatement(
            (value as (s: string) => D1PreparedStatement).call(target, sql),
          );
      }
      if (property === "batch") {
        return (...args: unknown[]) => {
          counter.count += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (typeof value === "function") {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  }) as D1Database;
}

function scopeFor(counter?: Counter, workspaceId = WS): WorkspaceScope {
  return bindWorkspaceRepositories(
    { DB: counter ? countingDatabase(counter) : env.DB },
    makeContext(workspaceId),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const reviewRepos = new Map<string, ReturnType<typeof makeReviewRepository>>();

function reviewsRepo(ws = WS) {
  const existing = reviewRepos.get(ws);
  if (existing) return existing;
  const repo = makeReviewRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-03T09:00:00.000Z").now,
    idGenerator: sequentialIds(`rev-${ws}`),
  });
  reviewRepos.set(ws, repo);
  return repo;
}

async function weeklyReview(
  ws = WS,
  periodStart = PERIOD_START,
  periodEnd = PERIOD_END,
): Promise<Review> {
  const { review } = await reviewsRepo(ws).create({
    type: "weekly",
    periodStart,
    periodEnd,
  });
  return review;
}

function insightInput(review: Review) {
  return {
    review,
    now: NOW,
    timezone: TZ,
    todayIso: TODAY,
    formatDate: (iso: string) => iso,
  };
}

/**
 * A workspace with one Area, one Goal, one Project under the Goal, and
 * `completed` Tasks completed INSIDE the Review period plus `outside` completed
 * before it. Returns the ids so a test can assert attribution.
 */
async function seedCompletedWork(
  ws: string,
  options: {
    readonly inPeriod: number;
    readonly beforePeriod?: number;
    readonly overdueOpen?: number;
  },
) {
  const context = makeContext(ws);
  // A clock INSIDE the Review period: completion events are what the aggregate
  // reads, so a fixture that completed work "now" would be describing a
  // different week than the one under test.
  const clock = new FakeClock(IN_PERIOD_INSTANT).now;
  const spine = makeSpineRepository(context, { clock });
  const tasks = makeTaskRepository(context, { clock });
  const area = await spine.createArea({ title: `Area ${ws}` });
  const goal = await spine.createGoal({ title: `Goal ${ws}`, areaId: area.id });
  const project = await spine.createProject({
    title: `Project ${ws}`,
    parent: { kind: "goal", id: goal.id },
  });

  const completedIds: string[] = [];
  for (let index = 0; index < options.inPeriod; index += 1) {
    const task = await tasks.createTask({
      title: `Done ${index} ${ws}`,
      parent: { kind: "project", id: project.id },
    });
    await tasks.completeTask(task.id);
    completedIds.push(task.id);
  }
  for (let index = 0; index < (options.beforePeriod ?? 0); index += 1) {
    const task = await tasks.createTask({
      title: `Old ${index} ${ws}`,
      parent: { kind: "project", id: project.id },
    });
    await tasks.completeTask(task.id);
    // Rewrite ONLY the Activity instant: the completion genuinely happened
    // before this Review's period, which is what the aggregate reads.
    await env.DB.prepare(
      `UPDATE activities SET occurred_at = ?
       WHERE workspace_id = ? AND type = 'task.completed'
         AND id IN (SELECT activity_id FROM activity_subjects
                    WHERE workspace_id = ? AND entity_id = ?)`,
    )
      .bind("2026-07-01T02:00:00.000Z", ws, ws, task.id)
      .run();
  }
  const overdueIds: string[] = [];
  for (let index = 0; index < (options.overdueOpen ?? 0); index += 1) {
    const task = await tasks.createTask({
      title: `Overdue ${index} ${ws}`,
      parent: { kind: "project", id: project.id },
      dueDate: "2026-07-10",
    });
    overdueIds.push(task.id);
  }
  return {
    areaId: area.id,
    goalId: goal.id,
    projectId: project.id,
    completedIds,
    overdueIds,
  };
}

beforeEach(async () => {
  reviewRepos.clear();
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Exact period aggregates                                                     */
/* -------------------------------------------------------------------------- */

describe("period completion counts", () => {
  it("counts exactly what completed inside the period, and nothing outside it", async () => {
    await seedCompletedWork(WS, { inPeriod: 3, beforePeriod: 2 });
    const repo = makeReviewInsightRepository(makeContext(WS));
    const [current] = await repo.countPeriodCompletions([
      { key: "current", window: WINDOW },
    ]);
    expect(current).toEqual({
      key: "current",
      tasksCompleted: 3,
      projectsCompleted: 0,
      goalsCompleted: 0,
    });
  });

  it("counts a Task completed, reopened and completed again ONCE", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context, {
      clock: new FakeClock(IN_PERIOD_INSTANT).now,
    });
    const task = await tasks.createTask({ title: "Wobbly" });
    await tasks.completeTask(task.id);
    await tasks.reopenTask(task.id);
    await tasks.completeTask(task.id);
    const repo = makeReviewInsightRepository(context);
    const [current] = await repo.countPeriodCompletions([
      { key: "current", window: WINDOW },
    ]);
    expect(current.tasksCompleted).toBe(1);
  });

  it("counts Project and Goal completions under their own headings", async () => {
    const context = makeContext(WS);
    const spine = makeSpineRepository(context, {
      clock: new FakeClock(IN_PERIOD_INSTANT).now,
    });
    const area = await spine.createArea({ title: "Area" });
    const goal = await spine.createGoal({ title: "Goal", areaId: area.id });
    const project = await spine.createProject({
      title: "Project",
      parent: { kind: "goal", id: goal.id },
    });
    await spine.complete(project.id);
    await spine.complete(goal.id);
    const [current] = await makeReviewInsightRepository(
      context,
    ).countPeriodCompletions([{ key: "current", window: WINDOW }]);
    expect(current).toMatchObject({
      tasksCompleted: 0,
      projectsCompleted: 1,
      goalsCompleted: 1,
    });
  });

  it("never sees another workspace's completions", async () => {
    await seedCompletedWork(OTHER, { inPeriod: 5 });
    const [current] = await makeReviewInsightRepository(
      makeContext(WS),
    ).countPeriodCompletions([{ key: "current", window: WINDOW }]);
    expect(current.tasksCompleted).toBe(0);
  });

  it("answers several periods in ONE read, each against its own window", async () => {
    await seedCompletedWork(WS, { inPeriod: 2, beforePeriod: 0 });
    const counter: Counter = { count: 0 };
    const countingRepo = scopeFor(counter).reviewInsights;
    const results = await countingRepo.countPeriodCompletions([
      {
        key: "previous",
        window: reviewPeriodWindow(PREVIOUS_START, PREVIOUS_END, TZ),
      },
      { key: "current", window: WINDOW },
    ]);
    expect(counter.count).toBe(1);
    expect(results.map((row) => [row.key, row.tasksCompleted])).toEqual([
      ["previous", 0],
      ["current", 2],
    ]);
  });

  it("performs no read at all when nothing is asked for", async () => {
    const counter: Counter = { count: 0 };
    await scopeFor(counter).reviewInsights.countPeriodCompletions([]);
    expect(counter.count).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Contribution attribution                                                    */
/* -------------------------------------------------------------------------- */

describe("where the completed work landed", () => {
  it("attributes completed Tasks to their Project, Goal and Area", async () => {
    const seeded = await seedCompletedWork(WS, { inPeriod: 4 });
    const rows = await makeReviewInsightRepository(
      makeContext(WS),
    ).listPeriodContributions(WINDOW, 50);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: seeded.projectId,
      goalId: seeded.goalId,
      areaId: seeded.areaId,
      tasksCompleted: 4,
    });
  });

  it("resolves an Area through a Project that sits directly in one", async () => {
    const context = makeContext(WS);
    const clock = new FakeClock(IN_PERIOD_INSTANT).now;
    const spine = makeSpineRepository(context, { clock });
    const tasks = makeTaskRepository(context, { clock });
    const area = await spine.createArea({ title: "Home" });
    const project = await spine.createProject({
      title: "Kitchen",
      parent: { kind: "area", id: area.id },
    });
    const task = await tasks.createTask({
      title: "Tile",
      parent: { kind: "project", id: project.id },
    });
    await tasks.completeTask(task.id);
    const rows = await makeReviewInsightRepository(
      context,
    ).listPeriodContributions(WINDOW, 50);
    expect(rows[0]).toMatchObject({ areaId: area.id, goalId: null });
  });

  it("keeps an unparented completed Task, with no ancestry claimed for it", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context, {
      clock: new FakeClock(IN_PERIOD_INSTANT).now,
    });
    const task = await tasks.createTask({ title: "Floating" });
    await tasks.completeTask(task.id);
    const rows = await makeReviewInsightRepository(
      context,
    ).listPeriodContributions(WINDOW, 50);
    expect(rows).toEqual([
      {
        projectId: null,
        projectTitle: null,
        goalId: null,
        goalTitle: null,
        areaId: null,
        areaTitle: null,
        tasksCompleted: 1,
      },
    ]);
  });

  it("is deterministically ordered, highest contribution first", async () => {
    const context = makeContext(WS);
    const clock = new FakeClock(IN_PERIOD_INSTANT).now;
    const spine = makeSpineRepository(context, { clock });
    const tasks = makeTaskRepository(context, { clock });
    const area = await spine.createArea({ title: "Home" });
    const big = await spine.createProject({
      title: "Big",
      parent: { kind: "area", id: area.id },
    });
    const small = await spine.createProject({
      title: "Small",
      parent: { kind: "area", id: area.id },
    });
    for (const [project, count] of [
      [big, 3],
      [small, 1],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const task = await tasks.createTask({
          title: `T${index}`,
          parent: { kind: "project", id: project.id },
        });
        await tasks.completeTask(task.id);
      }
    }
    const repo = makeReviewInsightRepository(context);
    const first = await repo.listPeriodContributions(WINDOW, 50);
    const again = await repo.listPeriodContributions(WINDOW, 50);
    expect(first.map((row) => row.projectId)).toEqual([big.id, small.id]);
    expect(again).toEqual(first);
  });

  it("never crosses a workspace boundary", async () => {
    await seedCompletedWork(OTHER, { inPeriod: 3 });
    expect(
      await makeReviewInsightRepository(
        makeContext(WS),
      ).listPeriodContributions(WINDOW, 50),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Carry-over                                                                  */
/* -------------------------------------------------------------------------- */

describe("carry-over", () => {
  it("counts open work that was already overdue when the period began", async () => {
    await seedCompletedWork(WS, { inPeriod: 0, overdueOpen: 2 });
    const repo = makeReviewInsightRepository(makeContext(WS));
    expect(await repo.countCarryOverTasks(WINDOW)).toEqual({
      overdue: 2,
      waiting: 0,
    });
    const named = await repo.listCarryOverTasks(WINDOW, 10);
    expect(named).toHaveLength(2);
    expect(named.every((task) => task.kind === "overdue")).toBe(true);
  });

  it("ignores work due INSIDE the period — that is this week's, not carried over", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    await tasks.createTask({ title: "Due Friday", dueDate: "2026-07-31" });
    expect(
      await makeReviewInsightRepository(context).countCarryOverTasks(WINDOW),
    ).toEqual({ overdue: 0, waiting: 0 });
  });

  it("ignores work the owner deliberately parked or dropped", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    const someday = await tasks.createTask({
      title: "One day",
      dueDate: "2026-07-01",
    });
    await tasks.setCommitmentMany([someday.id], "someday");
    const cancelled = await tasks.createTask({
      title: "Dropped",
      dueDate: "2026-07-01",
    });
    await tasks.setStatusMany([cancelled.id], "cancelled");
    expect(
      await makeReviewInsightRepository(context).countCarryOverTasks(WINDOW),
    ).toEqual({ overdue: 0, waiting: 0 });
  });

  it("counts a long wait, and never counts one commitment twice", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    const waiting = await tasks.createTask({ title: "Chasing the plumber" });
    await tasks.setWaiting(waiting.id, {
      target: { kind: "text", note: "quote" },
    });
    await env.DB.prepare(
      `UPDATE task_details SET waiting_since = ? WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind("2026-07-05T00:00:00.000Z", WS, waiting.id)
      .run();
    const both = await tasks.createTask({
      title: "Both",
      dueDate: "2026-07-02",
    });
    await tasks.setWaiting(both.id, {
      target: { kind: "text", note: "also waiting" },
    });
    await env.DB.prepare(
      `UPDATE task_details SET waiting_since = ? WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind("2026-07-05T00:00:00.000Z", WS, both.id)
      .run();

    const counts =
      await makeReviewInsightRepository(context).countCarryOverTasks(WINDOW);
    // The overdue-and-waiting Task is reported once, as the more actionable of
    // the two, so the arms partition rather than overlap.
    expect(counts).toEqual({ overdue: 1, waiting: 1 });
  });

  it("never sees another workspace's commitments", async () => {
    await seedCompletedWork(OTHER, { inPeriod: 0, overdueOpen: 4 });
    expect(
      await makeReviewInsightRepository(makeContext(WS)).countCarryOverTasks(
        WINDOW,
      ),
    ).toEqual({ overdue: 0, waiting: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* CONVERGE-01 §8 — overdue, read at past moments                              */
/* -------------------------------------------------------------------------- */

describe("overdue at a period's close", () => {
  /** A moment to read the backlog at, as the loader builds one. */
  function asOf(
    key: string,
    endIso: string,
  ): {
    key: string;
    window: ReviewPeriodWindow;
  } {
    return { key, window: reviewPeriodWindow(endIso, endIso, TZ) };
  }

  it("counts a Task that was past its date and still open at that moment", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    await tasks.createTask({ title: "Late", dueDate: "2026-07-10" });

    expect(
      await makeReviewInsightRepository(context).countOverdueAtPeriodEnd([
        asOf("before", "2026-07-05"),
        asOf("after", "2026-07-20"),
      ]),
    ).toEqual([
      { key: "before", overdue: 0 },
      { key: "after", overdue: 1 },
    ]);
  });

  /*
   * The product's ONE overdue rule: strictly before, so due-that-day is not yet
   * overdue. `task-views` states it and the `smart` sort obeys it; a second
   * definition here would make the metric disagree with the view it links to.
   */
  it("does not call a Task due ON that day overdue", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    await tasks.createTask({ title: "Due today", dueDate: "2026-07-10" });

    expect(
      await makeReviewInsightRepository(context).countOverdueAtPeriodEnd([
        asOf("same-day", "2026-07-10"),
        asOf("next-day", "2026-07-11"),
      ]),
    ).toEqual([
      { key: "same-day", overdue: 0 },
      { key: "next-day", overdue: 1 },
    ]);
  });

  /*
   * The whole point of a HISTORY. A Task completed last week was still overdue
   * the week before, and a reading that reported it as clear then would make the
   * chart disagree with what the owner actually lived through.
   */
  it("still counts a Task at moments BEFORE it was completed", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context, {
      clock: new FakeClock("2026-07-20T02:00:00.000Z").now,
    });
    const task = await tasks.createTask({
      title: "Late, then done",
      dueDate: "2026-07-01",
    });
    await tasks.completeTask(task.id);

    expect(
      await makeReviewInsightRepository(context).countOverdueAtPeriodEnd([
        asOf("while-open", "2026-07-10"),
        asOf("after-done", "2026-07-25"),
      ]),
    ).toEqual([
      { key: "while-open", overdue: 1 },
      { key: "after-done", overdue: 0 },
    ]);
  });

  it("ignores work the owner deliberately parked or dropped", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context);
    const someday = await tasks.createTask({
      title: "One day",
      dueDate: "2026-07-01",
    });
    await tasks.setCommitmentMany([someday.id], "someday");
    const cancelled = await tasks.createTask({
      title: "Dropped",
      dueDate: "2026-07-01",
    });
    await tasks.setStatusMany([cancelled.id], "cancelled");

    expect(
      await makeReviewInsightRepository(context).countOverdueAtPeriodEnd([
        asOf("now", "2026-07-20"),
      ]),
    ).toEqual([{ key: "now", overdue: 0 }]);
  });

  it("ignores a Task with no due date at all", async () => {
    const context = makeContext(WS);
    await makeTaskRepository(context).createTask({ title: "Someday, no date" });
    expect(
      await makeReviewInsightRepository(context).countOverdueAtPeriodEnd([
        asOf("now", "2026-07-20"),
      ]),
    ).toEqual([{ key: "now", overdue: 0 }]);
  });

  it("never sees another workspace's backlog", async () => {
    await seedCompletedWork(OTHER, { inPeriod: 0, overdueOpen: 4 });
    expect(
      await makeReviewInsightRepository(
        makeContext(WS),
      ).countOverdueAtPeriodEnd([asOf("now", "2026-07-20")]),
    ).toEqual([{ key: "now", overdue: 0 }]);
  });

  it("performs no read at all for an empty request list", async () => {
    const counter: Counter = { count: 0 };
    await scopeFor(counter).reviewInsights.countOverdueAtPeriodEnd([]);
    expect(counter.count).toBe(0);
  });

  /*
   * The budget claim the module comment makes: ONE statement for the whole
   * series, however many moments are asked about. A per-bucket read would be an
   * N+1 on a page the owner opens to look at a chart.
   */
  it("answers every moment in ONE statement", async () => {
    await seedCompletedWork(WS, { inPeriod: 0, overdueOpen: 3 });
    const counter: Counter = { count: 0 };
    const results = await scopeFor(
      counter,
    ).reviewInsights.countOverdueAtPeriodEnd(
      ["2026-07-15", "2026-07-20", "2026-07-25", "2026-07-30"].map((iso) =>
        asOf(iso, iso),
      ),
    );
    expect(counter.count).toBe(1);
    expect(results.map((row) => row.overdue)).toEqual([3, 3, 3, 3]);
  });
});

/* -------------------------------------------------------------------------- */
/* The snapshot                                                                */
/* -------------------------------------------------------------------------- */

describe("the Review insight snapshot", () => {
  async function snapshotFor(review: Review, ws = WS) {
    const scope = scopeFor(undefined, ws);
    const { facts } = await loadReviewInsights(scope, insightInput(review));
    const byGoal = new Map(
      facts.state.goals.map((goal) => [
        goal.id,
        classifyGoalContribution(goal),
      ]),
    );
    return buildReviewInsightSnapshot(
      facts,
      (goalId) => byGoal.get(goalId) ?? "none",
    );
  }

  it("round-trips through storage under the current version", async () => {
    await seedCompletedWork(WS, { inPeriod: 2 });
    const review = await weeklyReview();
    const repo = makeReviewInsightRepository(makeContext(WS));
    const snapshot = await snapshotFor(review);
    expect(await repo.saveSnapshot(review.id, snapshot)).toBe(true);
    const stored = await repo.getSnapshot(review.id);
    expect(stored?.snapshot).toEqual(snapshot);
    expect(stored?.snapshot.version).toBe(REVIEW_INSIGHT_SNAPSHOT_VERSION);
  });

  it("is idempotent: saving the same facts twice leaves one identical row", async () => {
    await seedCompletedWork(WS, { inPeriod: 2 });
    const review = await weeklyReview();
    const repo = makeReviewInsightRepository(makeContext(WS));
    const snapshot = await snapshotFor(review);
    await repo.saveSnapshot(review.id, snapshot);
    const first = await repo.getSnapshot(review.id);
    await repo.saveSnapshot(review.id, snapshot);
    const second = await repo.getSnapshot(review.id);
    expect(second?.snapshot).toEqual(first?.snapshot);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM review_insight_snapshots WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(Number(row?.n)).toBe(1);
  });

  it("refuses to write against another workspace's Review, without raising", async () => {
    const otherReview = await weeklyReview(OTHER);
    const snapshot = await snapshotFor(otherReview, OTHER);
    const written = await makeReviewInsightRepository(
      makeContext(WS),
    ).saveSnapshot(otherReview.id, snapshot);
    expect(written).toBe(false);
    expect(
      await makeReviewInsightRepository(makeContext(WS)).getSnapshot(
        otherReview.id,
      ),
    ).toBeNull();
  });

  it("never reads another workspace's snapshot", async () => {
    const otherReview = await weeklyReview(OTHER);
    await makeReviewInsightRepository(makeContext(OTHER)).saveSnapshot(
      otherReview.id,
      await snapshotFor(otherReview, OTHER),
    );
    expect(
      await makeReviewInsightRepository(makeContext(WS)).getSnapshot(
        otherReview.id,
      ),
    ).toBeNull();
    expect(
      await makeReviewInsightRepository(makeContext(WS)).listSnapshotsBefore(
        "2030-01-01",
        5,
      ),
    ).toEqual([]);
  });

  it("finds only snapshots whose period ended strictly before the given date", async () => {
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);
    const repo = makeReviewInsightRepository(makeContext(WS));
    await repo.saveSnapshot(previous.id, await snapshotFor(previous));
    await repo.saveSnapshot(current.id, await snapshotFor(current));
    const before = await repo.listSnapshotsBefore(PERIOD_START, 5);
    expect(before.map((entry) => entry.reviewId)).toEqual([previous.id]);
  });

  it("reads a row stored under an unknown version as absent, not as zeros", async () => {
    const review = await weeklyReview();
    const repo = makeReviewInsightRepository(makeContext(WS));
    await repo.saveSnapshot(review.id, await snapshotFor(review));
    await env.DB.prepare(
      `UPDATE review_insight_snapshots
       SET facts_json = json_set(facts_json, '$.version', 99)
       WHERE workspace_id = ? AND review_id = ?`,
    )
      .bind(WS, review.id)
      .run();
    expect(await repo.getSnapshot(review.id)).toBeNull();
  });

  it("goes with the Review when it is permanently deleted", async () => {
    const review = await weeklyReview();
    const repo = makeReviewInsightRepository(makeContext(WS));
    await repo.saveSnapshot(review.id, await snapshotFor(review));
    const result = await reviewsRepo().permanentlyDelete(review.id);
    expect(result.deleted).toBe(true);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM review_insight_snapshots WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(Number(row?.n)).toBe(0);
  });

  it("is captured on completion, and a re-completion refreshes it", async () => {
    await seedCompletedWork(WS, { inPeriod: 2 });
    const review = await weeklyReview();
    const scope = scopeFor();
    expect(
      await captureReviewInsightSnapshot(scope, insightInput(review)),
    ).toBe(true);
    const first = await scope.reviewInsights.getSnapshot(review.id);
    expect(first?.snapshot.tasksCompleted).toBe(2);

    // More work lands, the Review is reopened and completed again: the snapshot
    // describes the NEW completion point.
    await seedCompletedWork(WS, { inPeriod: 1 });
    const refreshed = await scopeFor().reviews.get(review.id);
    expect(refreshed).not.toBeNull();
    await captureReviewInsightSnapshot(
      scope,
      insightInput(refreshed as Review),
    );
    const second = await scope.reviewInsights.getSnapshot(review.id);
    expect(second?.snapshot.tasksCompleted).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* The projection                                                              */
/* -------------------------------------------------------------------------- */

describe("the evidence projection", () => {
  it("says it is the first Review rather than showing an empty dashboard", async () => {
    const review = await weeklyReview();
    const { insights } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );
    expect(insights.comparison).toEqual({ kind: "first_review" });
    expect(insights.isEmpty).toBe(true);
  });

  it("compares against the previous completed Review of the SAME type", async () => {
    await seedCompletedWork(WS, { inPeriod: 3 });
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    await reviewsRepo().complete(previous.id);
    const scope = scopeFor();
    await captureReviewInsightSnapshot(scope, insightInput(previous));

    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);
    const { insights } = await loadReviewInsights(scope, insightInput(current));
    expect(insights.comparison).toMatchObject({
      kind: "snapshot",
      previousReviewId: previous.id,
    });
    expect(insights.trends.length).toBeGreaterThan(0);
  });

  it("never compares against another workspace's Reviews", async () => {
    const otherPrevious = await weeklyReview(
      OTHER,
      PREVIOUS_START,
      PREVIOUS_END,
    );
    await reviewsRepo(OTHER).complete(otherPrevious.id);
    const review = await weeklyReview();
    const { insights } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );
    expect(insights.comparison).toEqual({ kind: "first_review" });
  });

  it("reports movement that is exact, and derives the same numbers as the aggregate", async () => {
    await seedCompletedWork(WS, { inPeriod: 3, beforePeriod: 2 });
    const review = await weeklyReview();
    const { insights, facts } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );
    expect(facts.history.completions.tasksCompleted).toBe(3);
    const tasks = insights.movement.find(
      (insight) => insight.id === "movement.tasks",
    );
    expect(tasks?.measure).toEqual({ value: 3, exactness: "exact" });
  });
});

/* -------------------------------------------------------------------------- */
/* Query budget                                                                */
/* -------------------------------------------------------------------------- */

describe("query bounds", () => {
  it("stays within the declared evidence-load budget", async () => {
    await seedCompletedWork(WS, { inPeriod: 3, overdueOpen: 2 });
    const review = await weeklyReview();
    const counter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(counter), insightInput(review));
    expect(counter.count).toBe(REVIEW_INSIGHTS_QUERY_BUDGET);
  });

  it("costs the same whether the workspace is small or large", async () => {
    await seedCompletedWork(WS, { inPeriod: 3 });
    const small = await weeklyReview();
    const smallCounter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(smallCounter), insightInput(small));

    await resetTables([WS, OTHER]);
    reviewRepos.clear();
    const context = makeContext(WS);
    const clock = new FakeClock(IN_PERIOD_INSTANT).now;
    const spine = makeSpineRepository(context, { clock });
    const tasks = makeTaskRepository(context, { clock });
    const area = await spine.createArea({ title: "Area" });
    for (let index = 0; index < 8; index += 1) {
      const goal = await spine.createGoal({
        title: `Goal ${index}`,
        areaId: area.id,
      });
      const project = await spine.createProject({
        title: `Project ${index}`,
        parent: { kind: "goal", id: goal.id },
      });
      for (let n = 0; n < 3; n += 1) {
        const task = await tasks.createTask({
          title: `T${index}-${n}`,
          parent: { kind: "project", id: project.id },
        });
        await tasks.completeTask(task.id);
      }
    }
    const large = await weeklyReview();
    const largeCounter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(largeCounter), insightInput(large));

    expect(largeCounter.count).toBe(smallCounter.count);
  });

  it("does not grow with the number of past Reviews it can trend over", async () => {
    await seedCompletedWork(WS, { inPeriod: 2 });
    const one = await weeklyReview(WS, "2026-07-13", "2026-07-19");
    await reviewsRepo().complete(one.id);
    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);
    const few: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(few), insightInput(current));

    for (const [start, end] of [
      ["2026-06-29", "2026-07-05"],
      ["2026-07-06", "2026-07-12"],
      ["2026-07-20", "2026-07-26"],
    ] as const) {
      const extra = await weeklyReview(WS, start, end);
      await reviewsRepo().complete(extra.id);
    }
    const many: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(many), insightInput(current));
    expect(many.count).toBe(few.count);
  });
});
