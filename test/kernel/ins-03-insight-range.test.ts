/**
 * V2.9 INS-03 — the Insight page's LOADER, against the real D1.
 *
 * The unit tests prove the vocabulary (`insight-range.test.ts`) and what the
 * screen draws (`AnalyticsScreen.test.tsx`). Every claim here is about SQL and
 * could not be made against a fake: how many statements a window costs,
 * whether that number moves when the window gets thirteen times longer, which
 * column the trend counts from, and whether a reopened or deleted Task can make
 * the bucket and the total disagree.
 *
 * The roadmap's own falsifications, in the order it states them:
 *
 *   1. **Twelve weeks at week grain is twelve points**, from a fixture with
 *      known completions in known weeks.
 *   2. **A grain above its maximum is refused rather than truncated** — the
 *      control never offers it, and asking for it in the URL falls back to a
 *      grain the window can hold instead of silently shortening the series.
 *   3. **Reopen and recomplete counts ONCE**, in the bucket and in the total,
 *      and a deleted Task leaves both.
 *
 * Plus the acceptance the roadmap asks for and the unit tests cannot give:
 * the statement count is asserted per window and is FLAT — a 24-month page
 * costs what a 7-day page costs.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { loader as analyticsLoader } from "~/modules/analytics/routes/index";
import { setAuthenticatedSession } from "~/platform/request";

import { createActivityActorContext } from "~/kernel/activity";
import {
  INSIGHT_WINDOWS,
  allowedGrains,
  resolveInsightGrain,
} from "~/kernel/analytics";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  ANALYTICS_QUERY_BUDGET,
  loadAnalytics,
} from "~/modules/analytics/analytics-context";

import {
  FakeClock,
  makeContext,
  makeGoalMeasurementRepository,
  makeReviewInsightRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const HOSTILE = "ins03-hostile-workspace";
const TIMEZONE = "Australia/Brisbane";
const TODAY = "2026-09-04";
const NOW = new Date("2026-09-04T06:00:00.000Z");

const nextEntityId = sequentialIds("i03e");
const nextActivityId = sequentialIds("i03a");

/* -------------------------------------------------------------------------- */
/* A counting D1 binding                                                       */
/* -------------------------------------------------------------------------- */

interface Counter {
  count: number;
}

/**
 * Counts EXECUTIONS, not preparations.
 *
 * `prepare` alone would miss a statement run twice from one preparation and
 * would count one that was prepared and abandoned. The page's cost is what it
 * actually asks the database to do.
 */
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
  const db = counter ? countingDatabase(counter) : env.DB;
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(workspaceId),
    createActivityActorContext({ type: "user", id: "owner-ins-03" }),
  );
}

function load(
  scope: WorkspaceScope,
  window: (typeof INSIGHT_WINDOWS)[number]["id"],
  grain: ReturnType<typeof resolveInsightGrain>,
) {
  return loadAnalytics({
    scope,
    window,
    grain,
    todayIso: TODAY,
    timezone: TIMEZONE,
    dateFormat: "dmy_slash",
    now: NOW,
  });
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function spineRepo(ws: string, at: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** Create a Task and complete it, both at named instants. */
async function completeAt(
  ws: string,
  areaId: string,
  title: string,
  createdAt: string,
  completedAt: string,
): Promise<string> {
  const task = await taskRepo(ws, createdAt).createTask({
    title,
    parent: { kind: "area", id: areaId },
  });
  await taskRepo(ws, completedAt).completeTask(task.id);
  return task.id;
}

beforeEach(async () => {
  await resetTables([WS, HOSTILE]);
});

/* -------------------------------------------------------------------------- */
/* 1 — the window and the grain the owner chose                                */
/* -------------------------------------------------------------------------- */

describe("the window the owner chose is the window that is read", () => {
  it("gives twelve weekly points for twelve weeks, with the completions in the right ones", async () => {
    const area = await spineRepo(WS, "2026-06-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    /*
     * Two completions in the most recent whole week, one in the week before it,
     * and one far enough back to be the OLDEST bucket — so a layout error in
     * either direction moves a number visibly rather than merely changing a
     * total that would still add up.
     */
    await completeAt(
      WS,
      area.id,
      "Recent one",
      "2026-06-01T00:00:00.000Z",
      "2026-09-02T02:00:00.000Z",
    );
    await completeAt(
      WS,
      area.id,
      "Recent two",
      "2026-06-01T00:00:00.000Z",
      "2026-09-03T02:00:00.000Z",
    );
    await completeAt(
      WS,
      area.id,
      "The week before",
      "2026-06-01T00:00:00.000Z",
      "2026-08-27T02:00:00.000Z",
    );
    await completeAt(
      WS,
      area.id,
      "The oldest week",
      "2026-06-01T00:00:00.000Z",
      "2026-06-16T02:00:00.000Z",
    );

    const data = await load(scopeFor(), "12-weeks", "week");
    expect(data.model.series).toHaveLength(12);
    expect(data.grain).toBe("week");
    expect(data.window).toBe("12-weeks");

    const series = data.model.series;
    // The LAST bucket is whole and ends today, which is the backward-from-the-
    // end rule the history kernel keeps: both recent completions land in it.
    expect(series[series.length - 1]!.tasksCompleted).toBe(2);
    expect(series[series.length - 2]!.tasksCompleted).toBe(1);
    expect(series[0]!.tasksCompleted).toBe(1);
    // Every point is accounted for: no completion invented, none lost.
    expect(series.reduce((sum, point) => sum + point.tasksCompleted, 0)).toBe(
      4,
    );
    // And the RANGE TOTAL is its own read, not the sum of the buckets.
    expect(data.model.metrics.find((m) => m.id === "tasks")?.value).toBe(4);
  });

  /*
   * The roadmap's second falsification. A grain above its maximum is REFUSED —
   * two years is months only, because 730 days exceeds 366 and 105 weeks
   * exceeds 52 — and the refusal is a fallback to a grain the window can hold,
   * never a silently shortened series at the grain that was asked for.
   */
  it("refuses a grain the window cannot hold instead of truncating it", async () => {
    expect(allowedGrains("24-months", TODAY)).toEqual(["month"]);

    const grain = resolveInsightGrain("24-months", "day", TODAY);
    expect(grain).toBe("month");

    const data = await load(scopeFor(), "24-months", grain);
    expect(data.grain).toBe("month");
    expect(data.grains).toEqual(["month"]);
    // 24 months is the stated maximum, so the series is whole rather than bound.
    expect(data.model.series).toHaveLength(24);
    expect(data.model.seriesBounded).toBe(false);
    expect(data.model.notes.some((note) => note.includes("most recent"))).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — the completion authority                                                */
/* -------------------------------------------------------------------------- */

describe("the trend and the total agree, and both read completion time", () => {
  /*
   * The roadmap's third falsification, and the reason the trend reads
   * `spine_records.completed_at` rather than `task.completed` Activity events
   * (RECALL-02 / ADR-114 d4): a reopened-and-recompleted Task has TWO events
   * and one completion, and a deleted Task has an event and no completion.
   */
  it("counts a reopened and recompleted Task ONCE, in the bucket and in the total", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const task = await completeAt(
      WS,
      area.id,
      "Finished, undone, finished again",
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T02:00:00.000Z",
    );
    await taskRepo(WS, "2026-09-02T02:00:00.000Z").reopenTask(task);
    await taskRepo(WS, "2026-09-03T02:00:00.000Z").completeTask(task);

    const data = await load(scopeFor(), "this-week", "day");
    const total = data.model.series.reduce(
      (sum, point) => sum + point.tasksCompleted,
      0,
    );
    expect(total).toBe(1);
    expect(data.model.metrics.find((m) => m.id === "tasks")?.value).toBe(1);
    /*
     * …and it is in the bucket of the LATEST completion (3 September, owner
     * time) rather than the first (1 September). Located by its own day rather
     * than by position, because the last bucket is today — the 4th — and the
     * point of this assertion is which completion decided the placement.
     */
    const index = data.model.buckets.findIndex(
      (bucket) => bucket.endIso === "2026-09-03",
    );
    expect(index).toBeGreaterThan(-1);
    expect(data.model.series[index]!.tasksCompleted).toBe(1);
    expect(
      data.model.series[data.model.series.length - 1]!.tasksCompleted,
    ).toBe(0);
  });

  it("leaves a deleted Task out of both", async () => {
    const area = await spineRepo(WS, "2026-08-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const kept = await completeAt(
      WS,
      area.id,
      "Kept",
      "2026-08-01T00:00:00.000Z",
      "2026-09-03T02:00:00.000Z",
    );
    const removed = await completeAt(
      WS,
      area.id,
      "Deleted after completing",
      "2026-08-01T00:00:00.000Z",
      "2026-09-03T03:00:00.000Z",
    );
    expect(kept).not.toBe(removed);
    await taskRepo(WS, "2026-09-03T04:00:00.000Z").deleteTasks([removed]);

    const data = await load(scopeFor(), "this-week", "day");
    expect(
      data.model.series.reduce((sum, point) => sum + point.tasksCompleted, 0),
    ).toBe(1);
    expect(data.model.metrics.find((m) => m.id === "tasks")?.value).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — the statement budget, per window and flat                               */
/* -------------------------------------------------------------------------- */

describe("the page's cost is stated, and does not grow with the window", () => {
  /*
   * A workspace with EVERY read's subject in it.
   *
   * The budget is only honest if every conditional read on the page actually
   * fires: two of them (the measured-Goal series and the across-Reviews
   * contributions) return early on a workspace with no Goals, so a fixture of
   * bare completions would measure a smaller page than any real owner sees.
   */
  async function seedYear() {
    const spine = spineRepo(WS, "2024-06-01T00:00:00.000Z");
    const area = await spine.createArea({ title: "Ops" });
    // A completion in each of thirty different weeks, spread across two years,
    // so every window under test has real rows in several of its buckets.
    for (let index = 0; index < 30; index += 1) {
      const day = new Date("2026-09-01T02:00:00.000Z");
      day.setUTCDate(day.getUTCDate() - index * 21);
      await completeAt(
        WS,
        area.id,
        `Completed ${index}`,
        "2024-06-01T00:00:00.000Z",
        day.toISOString(),
      );
    }
    // Two Goals with readings, so the Goal tally, the measurement series and
    // the across-Reviews read all have something to do.
    const measurements = makeGoalMeasurementRepository(makeContext(WS), {
      clock: new FakeClock("2026-09-01T00:00:00.000Z").now,
      idGenerator: nextEntityId,
    });
    for (const title of ["Reach 70 kg", "Read 24 books"]) {
      const goal = await spine.createGoal({ title, areaId: area.id });
      await measurements.createMeasurement(goal.id, {
        value: 10,
        measuredOn: "2026-07-01",
      });
      await measurements.createMeasurement(goal.id, {
        value: 14,
        measuredOn: "2026-08-01",
      });
    }
    return area;
  }

  /**
   * ONE completed weekly Review with a snapshot, so the across-Reviews read —
   * which runs only when a completed Review exists — is on the path measured.
   * Found by review: the budget was measured on a fixture with no Review, and
   * understated a real workspace by the series statement.
   */
  async function seedCompletedReview() {
    const reviews = makeReviewRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-31T09:00:00.000Z").now,
      idGenerator: sequentialIds("i03rev"),
    });
    const { review } = await reviews.create({
      type: "weekly",
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
    });
    await reviews.complete(review.id);
    await makeReviewInsightRepository(makeContext(WS)).saveSnapshot(review.id, {
      version: 1,
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
      tasksCompleted: 1,
      projectsCompleted: 0,
      goalsCompleted: 0,
      overdueCarryOver: 0,
      waitingCarryOver: 0,
      projects: [],
      projectsBounded: false,
      goals: [],
      goalsBounded: false,
      areas: [],
      areasBounded: false,
      carryOverTaskIds: [],
      carryOverTaskIdsBounded: false,
    });
  }

  it("costs TWO statements fewer in a workspace that has never completed a Review", async () => {
    // The anchor Review lookup answers empty, and the snapshot series that
    // would follow it is never asked for.
    await seedYear();
    const counter: Counter = { count: 0 };
    await load(scopeFor(counter), "12-weeks", "week");
    expect(counter.count).toBe(ANALYTICS_QUERY_BUDGET - 2);
  });

  it("costs the SAME number of statements for 7 days and for 24 months", async () => {
    await seedYear();
    await seedCompletedReview();

    const week: Counter = { count: 0 };
    await load(scopeFor(week), "this-week", "day");

    const years: Counter = { count: 0 };
    await load(scopeFor(years), "24-months", "month");

    /*
     * The property, not the number: 730 owner days and 24 buckets cost exactly
     * what 7 owner days and 7 buckets cost. Every windowed read on this page is
     * one grouped statement whose SHAPE is independent of the window — which is
     * what the `json_each` boundary parameter bought (DEBT-239), and what a
     * `SUM(CASE …)` column per bucket could not have.
     */
    expect(years.count).toBe(week.count);
    expect(years.count).toBe(ANALYTICS_QUERY_BUDGET);
  });

  it("costs the same number of statements at every window and grain", async () => {
    await seedYear();
    await seedCompletedReview();

    const counts = new Map<string, number>();
    for (const window of INSIGHT_WINDOWS) {
      for (const grain of allowedGrains(window.id, TODAY)) {
        const counter: Counter = { count: 0 };
        await load(scopeFor(counter), window.id, grain);
        counts.set(`${window.id}/${grain}`, counter.count);
      }
    }
    const measured = [...counts.values()];
    // One number, for every window and grain the surface offers.
    expect(new Set(measured).size).toBe(1);
    // And it is small: this is a page of derived readings, not a report.
    // …and it is the DECLARED budget, not merely a small number.
    expect(measured[0]).toBe(ANALYTICS_QUERY_BUDGET);
  });
});

/* -------------------------------------------------------------------------- */
/* 4 — the Goals panel                                                         */
/* -------------------------------------------------------------------------- */

describe("the measured-Goal series (DEBT-212's caller)", () => {
  it("reads a Goal's own measurements, and drops a Goal with only one", async () => {
    const spine = spineRepo(WS, "2026-06-01T00:00:00.000Z");
    const area = await spine.createArea({ title: "Health" });
    const measured = await spine.createGoal({
      title: "Reach 70 kg",
      areaId: area.id,
    });
    const single = await spine.createGoal({
      title: "One reading only",
      areaId: area.id,
    });
    const measurements = makeGoalMeasurementRepository(makeContext(WS), {
      clock: new FakeClock("2026-09-01T00:00:00.000Z").now,
      idGenerator: nextEntityId,
    });
    await measurements.createMeasurement(measured.id, {
      value: 85,
      measuredOn: "2026-07-01",
    });
    await measurements.createMeasurement(measured.id, {
      value: 79,
      measuredOn: "2026-08-01",
    });
    await measurements.createMeasurement(single.id, {
      value: 12,
      measuredOn: "2026-08-01",
    });

    const data = await load(scopeFor(), "12-weeks", "week");
    const rows = data.model.measuredGoals;
    const row = rows.find((entry) => entry.goalId === measured.id);
    expect(row).toBeDefined();
    expect(row!.points.map((point) => point.value)).toEqual([85, 79]);
    expect(row!.to).toBe(`/goals/${measured.id}`);
    expect(row!.bounded).toBe(false);
    // One reading is not a series: a single point drawn as a line would assert
    // a shape it does not have.
    expect(rows.some((entry) => entry.goalId === single.id)).toBe(false);

    // The page names a period, so its Goal shapes are that period's: the same
    // Goal has NO series on a window that holds none of its readings, rather
    // than the readings it took two months earlier (found by review — an
    // unwindowed read called July's weigh-ins "readings in this window" on a
    // 7-day view). The window's empty state is then the honest one.
    const week = await load(scopeFor(), "this-week", "day");
    expect(
      week.model.measuredGoals.some((entry) => entry.goalId === measured.id),
    ).toBe(false);
  });

  it("never returns another workspace's readings", async () => {
    const hostileSpine = spineRepo(HOSTILE, "2026-06-01T00:00:00.000Z");
    const hostileArea = await hostileSpine.createArea({ title: "Theirs" });
    const hostileGoal = await hostileSpine.createGoal({
      title: "Not yours",
      areaId: hostileArea.id,
    });
    const hostileMeasurements = makeGoalMeasurementRepository(
      makeContext(HOSTILE),
      {
        clock: new FakeClock("2026-09-01T00:00:00.000Z").now,
        idGenerator: nextEntityId,
      },
    );
    await hostileMeasurements.createMeasurement(hostileGoal.id, {
      value: 1,
      measuredOn: "2026-07-01",
    });
    await hostileMeasurements.createMeasurement(hostileGoal.id, {
      value: 2,
      measuredOn: "2026-08-01",
    });

    const data = await load(scopeFor(), "12-weeks", "week");
    expect(data.model.measuredGoals).toHaveLength(0);
    expect(data.model.goalContributions).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The address bar is the authority                                            */
/* -------------------------------------------------------------------------- */

describe("the address bar never names a window or grain the page is not drawing", () => {
  function session(): AuthenticatedSession {
    return {
      user: {
        subject: "owner-ins-03",
        email: "owner@example.test",
        name: "Owner",
      },
      workspaceId: WS,
    } as unknown as AuthenticatedSession;
  }
  async function loadPage(url: string) {
    const context = new RouterContextProvider();
    setAuthenticatedSession(context, session());
    return (await analyticsLoader({
      request: new Request(url),
      context,
      params: {},
    } as unknown as Parameters<typeof analyticsLoader>[0])) as
      Response | { window: string; grain: string };
  }

  it("redirects a stale or impossible request to the address it actually draws", async () => {
    // Found by review: `?window=quarter` (the deleted vocabulary) and
    // `?window=24-months&grain=day` were normalised silently, so the shared
    // link kept naming a page it did not match — and every grain link on the
    // page copied the stale value forward.
    const stale = await loadPage("https://app.test/analytics?window=quarter");
    expect(stale).toBeInstanceOf(Response);
    expect((stale as Response).status).toBe(302);
    expect((stale as Response).headers.get("location")).toBe(
      "/analytics?window=12-weeks",
    );
    const impossible = await loadPage(
      "https://app.test/analytics?window=24-months&grain=day",
    );
    expect((impossible as Response).headers.get("location")).toBe(
      "/analytics?window=24-months&grain=month",
    );
  });

  it("serves a canonical address as it is, with no redirect", async () => {
    const page = await loadPage(
      "https://app.test/analytics?window=12-weeks&grain=day",
    );
    expect(page).not.toBeInstanceOf(Response);
    expect(page).toMatchObject({ window: "12-weeks", grain: "day" });
    const bare = await loadPage("https://app.test/analytics");
    expect(bare).not.toBeInstanceOf(Response);
  });
});
