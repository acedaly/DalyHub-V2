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
  REVIEW_INSIGHTS_QUERY_BUDGET_WITH_HABITS,
  captureReviewInsightSnapshot,
  loadReviewInsights,
  reviewPeriodWindow,
} from "~/modules/reviews/insights/review-insights-context";
import { loadReviewGuideStepData } from "~/modules/reviews/guided/review-guide-context";
import { loadAnalytics } from "~/modules/analytics/analytics-context";
import { goalContributionAcrossReviewsLine } from "~/kernel/review-insights";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import type { Review } from "~/kernel/reviews";

import {
  makeContext,
  makeHabitRepository,
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

  /*
   * HARDEN-06C (F-07) — a closed period is a record of a period.
   *
   * The completions scan joined `entities … AND e.deleted_at IS NULL`, so a
   * soft-deleted record silently left every historical bucket: a weekly Review
   * that said "3 Tasks completed" said "2" once the owner tidied up, and the
   * Analytics trend moved with it — while `analytics.ts` and REVIEW-03 both
   * stated the opposite guarantee in as many words.
   */
  it("does not change a closed period's count when a completed Task is later deleted", async () => {
    const context = makeContext(WS);
    const tasks = makeTaskRepository(context, {
      clock: new FakeClock(IN_PERIOD_INSTANT).now,
    });
    const kept = await tasks.createTask({ title: "Kept" });
    const removed = await tasks.createTask({ title: "Tidied up later" });
    await tasks.completeTask(kept.id);
    await tasks.completeTask(removed.id);

    const repo = makeReviewInsightRepository(context);
    const before = await repo.countPeriodCompletions([
      { key: "current", window: WINDOW },
    ]);
    expect(before[0]!.tasksCompleted).toBe(2);

    // Three weeks later, from the bulk bar on `/tasks`.
    await makeTaskRepository(context, {
      clock: new FakeClock("2026-08-20T09:00:00.000Z").now,
    }).deleteTasks([removed.id]);

    const after = await repo.countPeriodCompletions([
      { key: "current", window: WINDOW },
    ]);
    expect(after[0]!.tasksCompleted).toBe(2);
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

  /*
   * V2.9 INS-02 — the across-Reviews section, end to end against real D1: two
   * completed Reviews, each with a captured snapshot, read back as a SERIES.
   */
  it("reads more than one snapshot back, and says what the series holds", async () => {
    await seedCompletedWork(WS, { inPeriod: 3 });
    const scope = scopeFor();

    // Two earlier Reviews, each completed and snapshotted.
    const oldest = await weeklyReview(WS, "2026-07-13", "2026-07-19");
    await reviewsRepo().complete(oldest.id);
    await captureReviewInsightSnapshot(scope, insightInput(oldest));
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    await reviewsRepo().complete(previous.id);
    await captureReviewInsightSnapshot(scope, insightInput(previous));

    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);
    const { insights } = await loadReviewInsights(scope, insightInput(current));

    // The panel reached further back than `priorReviews[0]`, which is the whole
    // point of INS-02: both snapshots are in the series, so the comparison and
    // the across-Reviews facts come from one read.
    expect(insights.comparison).toMatchObject({
      kind: "snapshot",
      previousReviewId: previous.id,
    });
    // Whatever the series says, it says it about the Reviews it actually
    // holds — never a count it did not read.
    for (const insight of insights.acrossReviews) {
      expect(insight.reason).toMatch(/over your last \d+ Reviews?/);
      expect(insight.links.length).toBeGreaterThan(0);
    }
  });

  it("says no_snapshot when the immediately prior Review has none, even if an older one does", async () => {
    // The previous-snapshot semantics `listSnapshotSeries` replaced: the
    // IMMEDIATELY prior Review's snapshot, or null — never "the most recent
    // Review that happens to have one". Found by review: claimed, untested.
    await seedCompletedWork(WS, { inPeriod: 3 });
    const scope = scopeFor();
    const oldest = await weeklyReview(WS, "2026-07-13", "2026-07-19");
    await reviewsRepo().complete(oldest.id);
    await captureReviewInsightSnapshot(scope, insightInput(oldest));
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    await reviewsRepo().complete(previous.id);
    // No snapshot captured for `previous`.
    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);
    const { insights } = await loadReviewInsights(scope, insightInput(current));
    expect(insights.comparison).toMatchObject({ kind: "no_snapshot" });
  });

  it("reads the SAME series on the guided Goals step and on Analytics, for the same Goal", async () => {
    // The Goal story's across-Reviews line is one machine value with one
    // phrasing wherever it appears. Found by review: three surfaces read
    // three different series (6, a page size clamped to 8, and 8 on a
    // different anchor), so one Review could say two things about one Goal.
    const { goalId } = await seedCompletedWork(WS, { inPeriod: 3 });
    const scope = scopeFor();
    for (const [start, end] of [
      ["2026-07-06", "2026-07-12"],
      ["2026-07-13", "2026-07-19"],
      [PREVIOUS_START, PREVIOUS_END],
    ] as const) {
      const review = await weeklyReview(WS, start, end);
      await reviewsRepo().complete(review.id);
      await captureReviewInsightSnapshot(scope, insightInput(review));
    }
    const current = await weeklyReview(WS, PERIOD_START, PERIOD_END);

    const step = await loadReviewGuideStepData(
      scope,
      {
        review: current,
        stepId: "alignment",
        now: NOW,
        timezone: TZ,
        todayIso: TODAY,
        formatDate: (iso: string) => iso,
      },
      null,
    );
    expect(step.kind).toBe("alignment");
    const guided =
      step.kind === "alignment"
        ? step.alignment.goals.find((goal) => goal.id === goalId)?.story
            .contributionAcrossReviews
        : undefined;
    expect(guided).not.toBeNull();
    expect(guided).toBeDefined();

    const analytics = await loadAnalytics({
      scope,
      window: "12-weeks",
      grain: "week",
      todayIso: TODAY,
      timezone: TZ,
      dateFormat: "dmy_slash",
      now: NOW,
    });
    const onAnalytics = analytics.model.goalContributions.find(
      (goal) => goal.goalId === goalId,
    );
    // The SAME machine value — state, count, Reviews that recorded it, and the
    // series length — and therefore the same words.
    expect(onAnalytics).toBeDefined();
    expect(onAnalytics?.reading).toBe(
      goalContributionAcrossReviewsLine(guided!),
    );
    expect(guided).toMatchObject({ reviews: 3, of: 3 });
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
/* FOLLOW-01 — the period's plan account, and DEBT-156's routines               */
/* -------------------------------------------------------------------------- */

describe("the period's plan account", () => {
  /** Plan/complete through the CANONICAL path at a specific instant. */
  function tasksAt(instantIso: string, ws = WS) {
    return makeTaskRepository(makeContext(ws), {
      clock: new FakeClock(instantIso).now,
    });
  }

  /** Owner-local 12:00 on a day in this period (Brisbane is UTC+10). */
  function noon(dayIso: string): string {
    return `${dayIso}T02:00:00.000Z`;
  }

  it("accounts for the week the Review covers, from the same derivation `/plan` reads", async () => {
    const before = tasksAt("2026-07-24T02:00:00.000Z");
    const kept = await before.createTask({ title: "Kept" });
    const late = await before.createTask({ title: "Late" });
    const moved = await before.createTask({ title: "Moved" });
    await before.planTask(kept.id, { scheduledDate: "2026-07-27" });
    await before.planTask(late.id, { scheduledDate: "2026-07-27" });
    await before.planTask(moved.id, { scheduledDate: "2026-07-28" });

    await tasksAt(noon("2026-07-27")).completeTask(kept.id);
    await tasksAt(noon("2026-07-30")).completeTask(late.id);
    await tasksAt(noon("2026-07-29")).planTask(moved.id, {
      scheduledDate: "2026-07-31",
    });

    const review = await weeklyReview();
    const { insights, facts } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );

    expect(facts.planAccount.available).toBe(true);
    expect(facts.planAccount.counts).toMatchObject({
      planned: 3,
      kept: 1,
      completedLate: 1,
      carried: 1,
      reschedules: 1,
      rescheduled: 1,
    });

    const account = insights.planAccount;
    expect(account).not.toBeNull();
    expect(account?.headline).toContain("held 3 Tasks");
    expect(account?.movement).toContain("moved to another day");
    // Every count is drillable: each named Task links to its own record.
    expect(account?.entries.map((entry) => entry.taskId).sort()).toEqual(
      [kept.id, late.id, moved.id].sort(),
    );
    for (const entry of account?.entries ?? []) {
      expect(entry.link.to).toBe(`/tasks?task=${entry.taskId}`);
    }
  });

  it("says nothing at all about a period whose plan held nothing", async () => {
    const review = await weeklyReview();
    const { insights } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );
    expect(insights.planAccount).toBeNull();
  });

  it("is NOT carried into the stored snapshot", async () => {
    /*
     * [ADR-110] decision 3: REVIEW-03's versioned insight snapshot stays the ONLY
     * stored period artefact, and the plan account is always re-derivable, so
     * storing it would be the second copy this programme refuses.
     */
    const before = tasksAt("2026-07-24T02:00:00.000Z");
    const task = await before.createTask({ title: "Planned" });
    await before.planTask(task.id, { scheduledDate: "2026-07-29" });

    const review = await weeklyReview();
    expect(
      await captureReviewInsightSnapshot(scopeFor(), insightInput(review)),
    ).toBe(true);
    const stored = await scopeFor().reviewInsights.getSnapshot(review.id);
    const text = JSON.stringify(stored?.snapshot ?? {});
    expect(text).not.toContain("planAccount");
    expect(text).not.toContain("outcome");
    expect(text).not.toContain(task.id);
  });

  it("states routine consistency for the period, with its denominator", async () => {
    /*
     * The schedule's first version is effective from the owner's day AT
     * CREATION, so the Habit is created with a clock BEFORE the period and
     * checked in with one after it — a check-in may not be in the future.
     */
    const habit = await makeHabitRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-01T02:00:00.000Z").now,
      idGenerator: sequentialIds("hab"),
    }).create({
      title: "Morning walk",
      // Monday / Wednesday / Friday. The period is Mon 27 Jul – Sun 2 Aug, so it
      // asks for exactly three check-ins.
      schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
    });
    const habits = makeHabitRepository(makeContext(WS), {
      clock: new FakeClock(NOW.toISOString()).now,
    });
    await habits.checkIn(habit.id, "2026-07-27");
    await habits.checkIn(habit.id, "2026-07-29");

    const review = await weeklyReview();
    const { insights, facts } = await loadReviewInsights(scopeFor(), {
      ...insightInput(review),
      firstDayOfWeek: "monday",
    });

    expect(facts.habits).toMatchObject({
      expected: 3,
      completed: 2,
      habitsCounted: 1,
      available: true,
    });
    expect(insights.habits?.label).toBe("2 of 3 scheduled check-ins");
    // No percentage, ever. ADR-102 §8 / ADR-110 decision 4.
    expect(insights.habits?.label).not.toContain("%");
    expect(insights.habits?.reason).not.toContain("%");
  });

  it("admits its bound on a period longer than one consistency reading walks", async () => {
    /*
     * A CUSTOM Review period is whatever two dates the owner picked, and
     * `evaluateHabitConsistency` walks a fixed number of owner-calendar weeks.
     * Asked for more it used to stop at week sixty and drop everything after —
     * which, walking forward, is the MOST RECENT weeks, the ones the Review is
     * actually about — while the surface still called the total exact.
     *
     * This period is eighty weeks. The one check-in is inside the period's LAST
     * week, so a reading that silently truncated would report `0 of 3` and swear
     * to it. The window is clamped from the end instead, the check-in is counted,
     * and the reading says where it really starts.
     */
    const habit = await makeHabitRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-01T02:00:00.000Z").now,
      idGenerator: sequentialIds("hab"),
    }).create({
      title: "Morning walk",
      schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
    });
    await makeHabitRepository(makeContext(WS), {
      clock: new FakeClock(NOW.toISOString()).now,
    }).checkIn(habit.id, "2026-07-27");

    const { review } = await reviewsRepo(WS).create({
      type: "custom",
      periodStart: "2025-01-20", // ~80 weeks before the period's end.
      periodEnd: PERIOD_END,
    });
    const { insights, facts } = await loadReviewInsights(scopeFor(), {
      ...insightInput(review),
      firstDayOfWeek: "monday",
    });

    expect(facts.habits.bounded).toBe(true);
    // Clamped forward from the end, to the start of an owner-calendar week.
    expect(facts.habits.fromIso > "2025-01-20").toBe(true);
    expect(facts.habits.toIso).toBe(PERIOD_END);
    // The most recent week is INSIDE the reading, which is the whole point.
    expect(facts.habits.completed).toBe(1);
    expect(insights.habits?.measure?.exactness).toBe("bounded");
    expect(insights.habits?.reason).toContain(facts.habits.fromIso);
    expect(insights.habits?.reason).toContain("not necessarily all of them");
  });

  it("says NOTHING about routines when the period asked for none", async () => {
    const review = await weeklyReview();
    const { insights } = await loadReviewInsights(
      scopeFor(),
      insightInput(review),
    );
    expect(insights.habits).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Query budget                                                                */
/* -------------------------------------------------------------------------- */

describe("query bounds", () => {
  it("stays within the declared evidence-load budget", async () => {
    await seedCompletedWork(WS, { inPeriod: 3, overdueOpen: 2 });
    // ONE completed, snapshotted prior Review, so the snapshot-series read
    // fires. Found by review: the budget was measured on a first Review, where
    // that read is skipped, so the declared number understated every Review
    // after the first — the one path the number exists to describe.
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    await reviewsRepo().complete(previous.id);
    await captureReviewInsightSnapshot(scopeFor(), insightInput(previous));
    const review = await weeklyReview();
    const counter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(counter), insightInput(review));
    expect(counter.count).toBe(REVIEW_INSIGHTS_QUERY_BUDGET);
  });

  it("costs TWO statements fewer on a first Review: no series, no prior sections to read", async () => {
    await seedCompletedWork(WS, { inPeriod: 3, overdueOpen: 2 });
    const review = await weeklyReview();
    const counter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(counter), insightInput(review));
    expect(counter.count).toBe(REVIEW_INSIGHTS_QUERY_BUDGET - 2);
  });

  it("costs TWO more statements in a workspace that practises a routine", async () => {
    await seedCompletedWork(WS, { inPeriod: 1 });
    await makeHabitRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-01T02:00:00.000Z").now,
      idGenerator: sequentialIds("hab-budget"),
    }).create({ title: "Stretch", schedule: { kind: "daily" } });
    // On the same real path as the budget above: a snapshotted prior Review.
    const previous = await weeklyReview(WS, PREVIOUS_START, PREVIOUS_END);
    await reviewsRepo().complete(previous.id);
    await captureReviewInsightSnapshot(scopeFor(), insightInput(previous));
    const review = await weeklyReview();
    const counter: Counter = { count: 0 };
    await loadReviewInsights(scopeFor(counter), insightInput(review));
    expect(counter.count).toBe(REVIEW_INSIGHTS_QUERY_BUDGET_WITH_HABITS);
  });

  /*
   * This one seeds a SECOND, larger workspace — eight goals, eight projects and
   * twenty-four completed tasks, every one a real D1 write — where its
   * neighbours in this block seed nothing, so it is the slowest here at 829 ms
   * locally. The ceiling it needs lives in `vitest.workers.config.ts`; the
   * claim it makes is a query-count budget, identical in a small workspace and
   * a large one, and that has never involved time.
   */
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
