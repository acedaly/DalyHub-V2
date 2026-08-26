/**
 * FOLLOW-01 — the bounded Activity window against REAL D1, and the plan account
 * built on top of it.
 *
 * The unit matrix (`test/unit/activity-window/task-plan-history.test.ts`) proves
 * the RULES over synthetic events. This file proves the other half, which is the
 * half that can only be proved against a database: that the events the product's
 * own planning paths actually write, read back through the repository's three
 * arms, reconstruct the same history.
 *
 * Every Task here is created and planned through the CANONICAL repository —
 * `planTask`, `clearPlan`, `completeTask` — so nothing is asserted against
 * hand-written Activity rows. If a future change alters what those paths record,
 * this file fails, which is exactly what it is for.
 *
 * Query counting wraps the real D1 binding, following REVIEW-03's precedent:
 * every executed statement is one unit, because what costs a round trip is
 * running a statement.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  MAX_WINDOW_TASKS,
  derivePeriodPlanAccount,
  type ActivityWindow,
} from "~/kernel/activity-window";
import {
  ownerPeriodWindow,
  readPeriodPlanAccount,
} from "~/platform/activity-window/plan-account.server";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  FakeClock,
  makeContext,
  makeTaskRepository,
  resetTables,
} from "./support";

const WS = "test-window-workspace";
const OTHER = "test-window-other";
/** No DST inside the periods below, so a boundary that moves is a bug. */
const TZ = "Australia/Brisbane"; // UTC+10, fixed.

/** The week under test: Monday 4 May to Sunday 10 May 2026, owner-local. */
const MON = "2026-05-04";
const SUN = "2026-05-10";
const WEEK: ActivityWindow = ownerPeriodWindow(MON, SUN, TZ);
/** A day AFTER the week, so the period is closed for every assertion. */
const TODAY = "2026-05-14";

function day(index: number): string {
  return new Date(Date.parse(`${MON}T00:00:00Z`) + index * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** An instant at `hour` owner-local on a wall-calendar day (UTC+10). */
function at(dayIso: string, hour: number): string {
  return new Date(
    Date.parse(`${dayIso}T00:00:00Z`) + (hour - 10) * 3_600_000,
  ).toISOString();
}

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
/* Fixtures — every write through the canonical path                           */
/* -------------------------------------------------------------------------- */

/**
 * A Task repository whose clock is a specific instant, so a plan or a completion
 * genuinely HAPPENS at that moment. The Activity stream is what the derivation
 * reads, so a fixture that planned "now" would be describing a different week.
 */
function tasksAt(instantIso: string, ws = WS) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(instantIso).now,
  });
}

async function newTask(title: string, ws = WS): Promise<string> {
  const task = await tasksAt(at("2026-04-27", 9), ws).createTask({ title });
  return task.id;
}

async function accountFor(ws = WS, todayIso = TODAY) {
  const { account } = await readPeriodPlanAccount(scopeFor(undefined, ws), {
    periodStart: MON,
    periodEnd: SUN,
    timezone: TZ,
    todayIso,
  });
  return account;
}

function outcomeOf(
  account: Awaited<ReturnType<typeof accountFor>>,
  taskId: string,
) {
  return account.entries.find((entry) => entry.taskId === taskId) ?? null;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* The three arms                                                              */
/* -------------------------------------------------------------------------- */

describe("the window's candidate set, against real D1", () => {
  it("finds work PLANNED into the week before it began and never touched", async () => {
    const id = await newTask("Planned ahead");
    await tasksAt(at("2026-05-01", 9)).planTask(id, {
      scheduledDate: day(2),
    });

    const account = await accountFor();
    const entry = outcomeOf(account, id);
    expect(entry?.outcome).toBe("carried");
    expect(entry?.plannedDayJudged).toBe(day(2));
    expect(entry?.reschedules).toBe(0);
  });

  it("finds work whose plan MOVED inside the week, with the move count", async () => {
    const id = await newTask("Moved twice");
    await tasksAt(at("2026-05-01", 9)).planTask(id, { scheduledDate: day(0) });
    await tasksAt(at(day(0), 20)).planTask(id, { scheduledDate: day(2) });
    await tasksAt(at(day(2), 20)).planTask(id, { scheduledDate: day(4) });

    const entry = outcomeOf(await accountFor(), id);
    expect(entry?.outcome).toBe("carried");
    expect(entry?.reschedules).toBe(2);
    expect(entry?.plannedDays).toEqual([day(0), day(2), day(4)]);
  });

  it("finds work whose plan was WITHDRAWN after the week closed", async () => {
    /*
     * The arm that stops a Task the owner committed to on Wednesday and
     * re-planned the following Monday from vanishing out of the week it was
     * committed to. Its current `scheduled_date` is outside the week and it has
     * no event inside it, so arms 1 and 2 both miss it by construction.
     */
    const id = await newTask("Withdrawn later");
    await tasksAt(at("2026-05-01", 9)).planTask(id, { scheduledDate: day(4) });
    await tasksAt(at("2026-05-12", 9)).planTask(id, {
      scheduledDate: "2026-05-20",
    });

    const entry = outcomeOf(await accountFor(), id);
    expect(entry?.outcome).toBe("carried");
    expect(entry?.plannedDayJudged).toBe(day(4));
    // The post-window move is NOT counted as a move inside the week.
    expect(entry?.reschedules).toBe(0);
  });

  it("does NOT credit the week with a plan made AFTER the week closed", async () => {
    /*
     * The mirror of the arm above, and the one the current `scheduled_date`
     * would answer WRONGLY if it were ever trusted past its initial condition.
     *
     * The owner planned this for a day in June. The week ran without it. Only
     * afterwards did they move it onto the Wednesday that week had already
     * spent. `task_details.scheduled_date` now reads day 2 — inside the closed
     * week — so the candidate set holds the Task, and every honest answer must
     * come from the movement itself: at the moment the week opened, the plan
     * said June, and a week cannot hold work that was committed to it in
     * hindsight.
     */
    const id = await newTask("Backdated after the fact");
    await tasksAt(at("2026-05-01", 9)).planTask(id, {
      scheduledDate: "2026-06-01",
    });
    await tasksAt(at("2026-05-12", 9)).planTask(id, { scheduledDate: day(2) });

    const account = await accountFor();
    expect(outcomeOf(account, id)).toBeNull();
    expect(account.counts.planned).toBe(0);
  });

  it("does NOT report a plan moved in and out again after the week as a move OUT", async () => {
    /*
     * Same hindsight, twice. The Task passed THROUGH a day inside the closed
     * week on its way to July, so the withdrawal arm holds it as a candidate —
     * and reading only the withdrawal would call it work the week planned and
     * lost. The plan at the week's open is what settles it, and that is the
     * `before` of the FIRST movement from the week onwards, not the `before` of
     * the last one.
     */
    const id = await newTask("Passed through in hindsight");
    await tasksAt(at("2026-05-01", 9)).planTask(id, {
      scheduledDate: "2026-06-01",
    });
    await tasksAt(at("2026-05-12", 9)).planTask(id, { scheduledDate: day(2) });
    await tasksAt(at("2026-05-13", 9)).planTask(id, {
      scheduledDate: "2026-07-01",
    });

    const account = await accountFor();
    expect(outcomeOf(account, id)).toBeNull();
    expect(account.counts.movedOut).toBe(0);
  });

  it("finds a SERIES move that took an occurrence off the week after it closed", async () => {
    /*
     * The withdrawal arm in the OTHER recorded shape. TASKS-07's series move
     * writes its planned-day change as a `changes.scheduledDate` pair rather
     * than as one of the three domain planning types, and a week the owner
     * genuinely spent an occurrence in must not vanish because of which writer
     * recorded the move away from it.
     */
    const task = await tasksAt(at("2026-05-01", 9)).createTask({
      title: "Weekly report, moved out of the week later",
      dueDate: day(4),
      scheduledDate: day(3),
      recurrence: { dateKind: "due", frequency: "week", interval: 1 },
    });
    await tasksAt(at("2026-05-12", 9)).moveTaskOccurrence(task.id, {
      scope: "occurrence",
      date: "2026-05-28",
    });

    const entry = outcomeOf(await accountFor(), task.id);
    expect(entry?.outcome).toBe("carried");
    expect(entry?.plannedDayJudged).toBe(day(3));
    // The move happened after the week; it is not a move INSIDE it.
    expect(entry?.reschedules).toBe(0);
  });

  it("finds work CREATED with a planned day and no planning event at all", async () => {
    /*
     * `createTask` emits `entity.created` and nothing else, so this Task has no
     * plan event anywhere in the stream. The account still holds it, from the
     * initial condition the events record deltas from.
     */
    const task = await tasksAt(at("2026-05-01", 9)).createTask({
      title: "Born planned",
      scheduledDate: day(3),
    });
    const events = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activities a
       JOIN activity_subjects s ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
       WHERE a.workspace_id = ? AND s.entity_id = ?
         AND a.type IN ('task.planned','task.rescheduled','task.plan_cleared')`,
    )
      .bind(WS, task.id)
      .first<{ n: number }>();
    expect(events?.n).toBe(0);

    const entry = outcomeOf(await accountFor(), task.id);
    expect(entry?.outcome).toBe("carried");
    expect(entry?.plannedDayJudged).toBe(day(3));
  });
});

describe("what became of the week, against real D1", () => {
  it("separates kept from done-later, from the events themselves", async () => {
    const kept = await newTask("Kept");
    const late = await newTask("Late");
    await tasksAt(at("2026-05-01", 9)).planTask(kept, {
      scheduledDate: day(0),
    });
    await tasksAt(at("2026-05-01", 9)).planTask(late, {
      scheduledDate: day(0),
    });
    await tasksAt(at(day(0), 17)).completeTask(kept);
    await tasksAt(at(day(3), 9)).completeTask(late);

    const account = await accountFor();
    expect(outcomeOf(account, kept)?.outcome).toBe("kept");
    expect(outcomeOf(account, late)?.outcome).toBe("completed_late");
    expect(account.counts.kept).toBe(1);
    expect(account.counts.completedLate).toBe(1);
  });

  it("reports a cleared plan, and a completion with no plan for the week", async () => {
    const cleared = await newTask("Cleared");
    const unplanned = await newTask("Unplanned");
    await tasksAt(at("2026-05-01", 9)).planTask(cleared, {
      scheduledDate: day(1),
    });
    await tasksAt(at(day(2), 8)).clearPlan(cleared);
    await tasksAt(at(day(2), 16)).completeTask(unplanned);

    const account = await accountFor();
    expect(outcomeOf(account, cleared)?.outcome).toBe("cleared");
    expect(outcomeOf(account, unplanned)?.outcome).toBe("unplanned");
    expect(account.counts.planned).toBe(1);
    expect(account.counts.unplanned).toBe(1);
  });

  it("counts a completion at the owner's LAST MINUTE of the week, and not one minute later", async () => {
    const inside = await newTask("Sunday night");
    const outside = await newTask("Monday morning");
    await tasksAt(at("2026-05-01", 9)).planTask(inside, {
      scheduledDate: day(6),
    });
    await tasksAt(at("2026-05-01", 9)).planTask(outside, {
      scheduledDate: day(6),
    });
    // 23:59 owner-local on Sunday, and 00:01 owner-local on Monday.
    await tasksAt("2026-05-10T13:59:00.000Z").completeTask(inside);
    await tasksAt("2026-05-10T14:01:00.000Z").completeTask(outside);

    const account = await accountFor();
    expect(outcomeOf(account, inside)?.outcome).toBe("kept");
    expect(outcomeOf(account, outside)?.outcome).toBe("carried");
  });

  it("reads a SERIES move's carried planned day, which the payload now records", async () => {
    /*
     * FOLLOW-01's one payload correction. A repeating Task anchored on its DUE
     * date also carries a planned day, and moving the series shifted BOTH while
     * recording only the anchor — so a period account reconstructed from the
     * stream read a moved occurrence as one that never moved.
     */
    const task = await tasksAt(at("2026-05-01", 9)).createTask({
      title: "Weekly report",
      dueDate: day(1),
      scheduledDate: day(0),
      recurrence: { dateKind: "due", frequency: "week", interval: 1 },
    });
    await tasksAt(at(day(0), 12)).moveTaskOccurrence(task.id, {
      scope: "occurrence",
      date: day(3),
    });

    const entry = outcomeOf(await accountFor(), task.id);
    // The due date moved Tuesday → Thursday, so the planned day moved Monday →
    // Wednesday with it, and the account says so.
    expect(entry?.plannedDays).toEqual([day(0), day(2)]);
    expect(entry?.reschedules).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                   */
/* -------------------------------------------------------------------------- */

describe("workspace isolation", () => {
  it("never sees another workspace's week", async () => {
    const mine = await newTask("Mine", WS);
    const theirs = await newTask("Theirs", OTHER);
    await tasksAt(at("2026-05-01", 9), WS).planTask(mine, {
      scheduledDate: day(2),
    });
    await tasksAt(at("2026-05-01", 9), OTHER).planTask(theirs, {
      scheduledDate: day(2),
    });

    const ours = await accountFor(WS);
    expect(ours.entries.map((entry) => entry.taskId)).toEqual([mine]);
    const other = await accountFor(OTHER);
    expect(other.entries.map((entry) => entry.taskId)).toEqual([theirs]);
  });
});

/* -------------------------------------------------------------------------- */
/* The budget, and its flatness                                                */
/* -------------------------------------------------------------------------- */

/**
 * The EXACT number of executed D1 statements one window read costs.
 *
 * TWO, and it is a number rather than a claim: an edit that adds a per-Task read
 * fails the build rather than the owner's week.
 */
const WINDOW_QUERY_BUDGET = 2;

describe("the query budget", () => {
  async function seedWeek(taskCount: number, ws = WS) {
    for (let index = 0; index < taskCount; index += 1) {
      const id = await newTask(`Week task ${index}`, ws);
      await tasksAt(at("2026-05-01", 9), ws).planTask(id, {
        scheduledDate: day(index % 7),
      });
      // Every second one also MOVES, so the event read has real work to do.
      if (index % 2 === 0) {
        await tasksAt(at(day(1), 9), ws).planTask(id, {
          scheduledDate: day((index + 2) % 7),
        });
      }
    }
  }

  it("costs exactly two statements", async () => {
    await seedWeek(3);
    const counter: Counter = { count: 0 };
    await scopeFor(counter).activityWindow.readTaskPlanWindow(WEEK);
    expect(counter.count).toBe(WINDOW_QUERY_BUDGET);
  });

  it("is FLAT: a fifteen-Task week costs what a three-Task week does", async () => {
    await seedWeek(3, WS);
    await seedWeek(15, OTHER);

    const small: Counter = { count: 0 };
    await scopeFor(small, WS).activityWindow.readTaskPlanWindow(WEEK);
    const large: Counter = { count: 0 };
    await scopeFor(large, OTHER).activityWindow.readTaskPlanWindow(WEEK);

    expect(small.count).toBe(WINDOW_QUERY_BUDGET);
    expect(large.count).toBe(WINDOW_QUERY_BUDGET);

    // And the larger week really is larger, so the flatness claim means something.
    const read = await scopeFor(
      undefined,
      OTHER,
    ).activityWindow.readTaskPlanWindow(WEEK);
    expect(read.subjects.length).toBe(15);
  });

  it("binds a CONSTANT number of parameters, well inside D1's ceiling of 100", async () => {
    /*
     * The ceiling TASKS-13 and UX-02 both found the expensive way. The id set
     * never crosses the process boundary — it is a common table expression
     * inside both statements — so the parameter count is a function of the
     * window, not of the week.
     */
    const bound: number[] = [];
    const probe = new Proxy(env.DB, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property === "prepare") {
          return (sql: string) => {
            const statement = (
              value as (s: string) => D1PreparedStatement
            ).call(target, sql);
            return new Proxy(statement, {
              get(inner, key, innerReceiver) {
                const innerValue = Reflect.get(inner, key, innerReceiver);
                if (key === "bind") {
                  return (...args: unknown[]) => {
                    bound.push(args.length);
                    return (
                      innerValue as (...a: unknown[]) => D1PreparedStatement
                    ).apply(inner, args);
                  };
                }
                return typeof innerValue === "function"
                  ? (innerValue as (...a: unknown[]) => unknown).bind(inner)
                  : innerValue;
              },
            });
          };
        }
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as D1Database;

    await seedWeek(12);
    await bindWorkspaceRepositories(
      { DB: probe },
      makeContext(WS),
      createActivityActorContext({ type: "user", id: "owner-1" }),
    ).activityWindow.readTaskPlanWindow(WEEK);

    expect(bound.length).toBe(2);
    // Numbers rather than a claim: an edit that starts binding per Task shows
    // up here long before it shows up as a failed read on a busy week.
    expect(bound).toEqual([18, 20]);
    for (const count of bound) expect(count).toBeLessThan(100);
  });

  it("reports `bounded` rather than silently truncating the week", async () => {
    await seedWeek(4);
    const read = await scopeFor().activityWindow.readTaskPlanWindow(WEEK, {
      tasks: 2,
    });
    expect(read.subjects).toHaveLength(2);
    expect(read.bounded).toBe(true);

    const whole = await scopeFor().activityWindow.readTaskPlanWindow(WEEK);
    expect(whole.bounded).toBe(false);
  });

  it("keeps the kernel's own ceiling as the ceiling", async () => {
    await seedWeek(3);
    const read = await scopeFor().activityWindow.readTaskPlanWindow(WEEK, {
      tasks: MAX_WINDOW_TASKS * 10,
    });
    expect(read.subjects.length).toBeLessThanOrEqual(MAX_WINDOW_TASKS);
  });
});

/* -------------------------------------------------------------------------- */
/* Failing soft                                                                */
/* -------------------------------------------------------------------------- */

describe("failing soft", () => {
  it("says the history could not be read rather than reporting an empty week", async () => {
    const broken = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return () => {
            throw new Error("D1 is having a moment");
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as D1Database;
    const scope = bindWorkspaceRepositories(
      { DB: broken },
      makeContext(WS),
      createActivityActorContext({ type: "user", id: "owner-1" }),
    );
    const { account } = await readPeriodPlanAccount(scope, {
      periodStart: MON,
      periodEnd: SUN,
      timezone: TZ,
      todayIso: TODAY,
    });
    expect(account.available).toBe(false);
    expect(account.entries).toHaveLength(0);
  });

  it("returns an unavailable account when there is no workspace at all", async () => {
    const { account } = await readPeriodPlanAccount(null, {
      periodStart: MON,
      periodEnd: SUN,
      timezone: TZ,
      todayIso: TODAY,
    });
    expect(account.available).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The window itself                                                           */
/* -------------------------------------------------------------------------- */

describe("the owner's period window", () => {
  it("resolves the owner's local midnights, not UTC ones", () => {
    expect(WEEK.startInstantIso).toBe("2026-05-03T14:00:00.000Z");
    expect(WEEK.endInstantIso).toBe("2026-05-10T14:00:00.000Z");
  });

  it("derives the same account from the same read, whoever asks", async () => {
    const id = await newTask("Shared");
    await tasksAt(at("2026-05-01", 9)).planTask(id, { scheduledDate: day(2) });
    await tasksAt(at(day(2), 9)).completeTask(id);

    const read = await scopeFor().activityWindow.readTaskPlanWindow(WEEK);
    const direct = derivePeriodPlanAccount({
      window: WEEK,
      todayIso: TODAY,
      subjects: read.subjects,
      events: read.events,
      bounded: read.bounded,
      ownerDayOf: (instantIso) => ownerCalendarIso(new Date(instantIso), TZ),
    });
    const throughHelper = await accountFor();
    expect(direct.counts).toEqual(throughHelper.counts);
    expect(direct.entries.map((entry) => entry.outcome)).toEqual(
      throughHelper.entries.map((entry) => entry.outcome),
    );
  });
});
