/**
 * TASKS-12 — the advanced recurrence rules through the REAL storage layer.
 *
 * `task-recurrence-advanced.test.ts` proves the calendar arithmetic; this proves
 * that a rule authored at the mutation boundary is STORED, READ BACK unchanged,
 * and produces exactly the successor the arithmetic says it should — including
 * the two end conditions, which are the only rules in DalyHub that make a
 * completion create nothing.
 *
 * Every assertion goes through the real repository against real D1, and every
 * successor is created by the ONE authority (completion), never by a test helper.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TaskValidationError,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_recurrence_advanced";

const nextEntityId = sequentialIds("adv");
const nextActivityId = sequentialIds("advact");

function taskRepo(at = "2026-08-19T09:00:00.000Z") {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** A scheduled Task carrying a recurrence rule, created the ordinary way. */
async function seedRecurring(
  scheduledDate: string,
  recurrence: Parameters<
    ReturnType<typeof taskRepo>["setTaskRecurrence"]
  >[1] extends infer _R
    ? Record<string, unknown>
    : never,
  title = "Camper service",
) {
  const tasks = taskRepo();
  const task = await tasks.createTask({ title, parent: null, scheduledDate });
  await tasks.setTaskRecurrence(task.id, recurrence as never);
  return (await tasks.getTask(task.id))!;
}

/** The stored recurrence row, exactly as D1 holds it. */
async function ruleRow(entityId: string) {
  return await env.DB.prepare(
    `SELECT frequency, interval, weekdays, ordinal, weekend_rule,
            ends_after_count, ends_on_date, series_id, sequence, series_anchor_date
     FROM task_recurrence_rules WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(WS, entityId)
    .first<{
      frequency: string;
      interval: number;
      weekdays: string | null;
      ordinal: string | null;
      weekend_rule: string;
      ends_after_count: number | null;
      ends_on_date: string | null;
      series_id: string;
      sequence: number;
      series_anchor_date: string | null;
    }>();
}

beforeEach(async () => {
  await resetTables([WS]);
});

/* -------------------------------------------------------------------------- */
/* Storage round trip                                                         */
/* -------------------------------------------------------------------------- */

describe("an advanced rule is stored as DATA and read back unchanged", () => {
  it("round-trips the nth-weekday, weekend and end-condition fields", async () => {
    const task = await seedRecurring("2026-08-28", {
      frequency: "month",
      dateKind: "scheduled",
      ordinal: "last",
      weekdays: [5],
      weekendRule: "allow",
      endsAfterCount: 6,
    });
    const row = await ruleRow(task.id);
    expect(row).toMatchObject({
      frequency: "month",
      ordinal: "last",
      weekdays: "5",
      weekend_rule: "allow",
      ends_after_count: 6,
      ends_on_date: null,
      sequence: 0,
    });
    const read = (await taskRepo().getTask(task.id))!;
    expect(read.recurrence).toMatchObject({
      ordinal: "last",
      weekdays: [5],
      endsAfterCount: 6,
      endsOnDate: null,
      weekendRule: "allow",
    });
  });

  it("REFUSES an impossible rule at the mutation boundary, storing nothing", async () => {
    const tasks = taskRepo();
    const task = await tasks.createTask({
      title: "Nonsense",
      parent: null,
      scheduledDate: "2026-08-22",
    });
    await expect(
      tasks.setTaskRecurrence(task.id, {
        frequency: "week",
        dateKind: "scheduled",
        weekdays: [0, 6],
        weekendRule: "skip",
      } as never),
    ).rejects.toBeInstanceOf(TaskValidationError);
    expect(await ruleRow(task.id)).toBeNull();
  });

  it("treats a change to an end condition as a REAL change, not a no-op", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2026-08-24", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
    });
    const result = await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
      endsAfterCount: 12,
    } as never);
    expect(result.changed).toBe(true);
    expect((await ruleRow(task.id))?.ends_after_count).toBe(12);
  });
});

/* -------------------------------------------------------------------------- */
/* The successor a completion creates                                         */
/* -------------------------------------------------------------------------- */

describe("completion creates the occurrence the rule says", () => {
  it("advances 'the last Friday of every month'", async () => {
    const tasks = taskRepo();
    // 28 August 2026 is the last Friday of August.
    const task = await seedRecurring("2026-08-28", {
      frequency: "month",
      dateKind: "scheduled",
      ordinal: "last",
      weekdays: [5],
    });
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-28",
    });
    expect(result.successor?.scheduledDate).toBe("2026-09-25");
    // ONE series, one sequence step.
    const row = await ruleRow(result.successor!.id);
    expect(row?.series_id).toBe(task.id);
    expect(row?.sequence).toBe(1);
    expect(row?.ordinal).toBe("last");
  });

  it("advances a Mon/Wed/Fri rule ONE step at a time, in ONE series", async () => {
    const tasks = taskRepo();
    // 17 August 2026 is a Monday.
    const first = await seedRecurring("2026-08-17", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1, 3, 5],
    });
    const wednesday = (
      await tasks.completeTask(first.id, { ownerTodayIso: "2026-08-17" })
    ).successor!;
    expect(wednesday.scheduledDate).toBe("2026-08-19");
    const friday = (
      await tasks.completeTask(wednesday.id, { ownerTodayIso: "2026-08-19" })
    ).successor!;
    expect(friday.scheduledDate).toBe("2026-08-21");
    const monday = (
      await tasks.completeTask(friday.id, { ownerTodayIso: "2026-08-21" })
    ).successor!;
    expect(monday.scheduledDate).toBe("2026-08-24");

    // Every occurrence belongs to the SAME series, at consecutive sequences.
    for (const [index, id] of [first.id, wednesday.id, friday.id, monday.id]
      .map((id, index) => [index, id] as const)
      .map(([index, id]) => [index, id] as const)) {
      const row = await ruleRow(id as string);
      expect(row?.series_id).toBe(first.id);
      expect(row?.sequence).toBe(index as number);
    }
  });

  it("MOVES a weekend occurrence and remembers the grid, so the routine does not drift", async () => {
    const tasks = taskRepo();
    // The 1st of every month, moved to the Friday before when it lands at a
    // weekend. 1 August 2026 is a Saturday; 1 November 2026 is a Sunday.
    const july = await seedRecurring("2026-07-01", {
      frequency: "month",
      dateKind: "scheduled",
      anchorDay: 1,
      weekendRule: "before",
    });
    const august = (
      await tasks.completeTask(july.id, { ownerTodayIso: "2026-07-01" })
    ).successor!;
    expect(august.scheduledDate).toBe("2026-07-31");
    // The GRID is remembered on the successor, so the next step comes from the
    // 1st rather than from the 31st.
    expect((await ruleRow(august.id))?.series_anchor_date).toBe("2026-08-01");

    const september = (
      await tasks.completeTask(august.id, { ownerTodayIso: "2026-07-31" })
    ).successor!;
    expect(september.scheduledDate).toBe("2026-09-01");
    expect((await ruleRow(september.id))?.series_anchor_date).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* End conditions                                                             */
/* -------------------------------------------------------------------------- */

describe("end conditions stop the series", () => {
  it("produces exactly N occurrences, and the last creates NOTHING", async () => {
    const tasks = taskRepo();
    let current = await seedRecurring("2026-08-01", {
      frequency: "day",
      dateKind: "scheduled",
      endsAfterCount: 3,
    });
    const dates: string[] = [current.scheduledDate!];
    for (let step = 0; step < 5; step += 1) {
      const result = await tasks.completeTask(current.id, {
        ownerTodayIso: current.scheduledDate!,
      });
      if (!result.successor) break;
      current = result.successor;
      dates.push(current.scheduledDate!);
    }
    expect(dates).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    // The final completion appended NO occurrence-created event.
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_CREATED),
    ).toBe(2);
  });

  it("creates the occurrence ON the end date and none after it", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2026-09-21", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
      endsOnDate: "2026-09-28",
    });
    const last = (
      await tasks.completeTask(task.id, { ownerTodayIso: "2026-09-21" })
    ).successor!;
    expect(last.scheduledDate).toBe("2026-09-28");
    const beyond = await tasks.completeTask(last.id, {
      ownerTodayIso: "2026-09-28",
    });
    expect(beyond.successor).toBeNull();
  });

  it("cannot exceed the count under a CONCURRENT double completion", async () => {
    /*
     * The last occurrence of a bounded series, completed twice at once. Neither
     * request may create a successor: the count is applied by the ONE authority
     * before the batch, and the series slot's UNIQUE index is the second boundary.
     */
    const task = await seedRecurring("2026-08-01", {
      frequency: "day",
      dateKind: "scheduled",
      endsAfterCount: 1,
    });
    const results = await Promise.allSettled([
      taskRepo().completeTask(task.id, { ownerTodayIso: "2026-08-01" }),
      taskRepo().completeTask(task.id, { ownerTodayIso: "2026-08-01" }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM task_recurrence_rules WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("creates AT MOST ONE successor when an unbounded rule is completed twice at once", async () => {
    const task = await seedRecurring("2026-08-17", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1, 3, 5],
    });
    await Promise.allSettled([
      taskRepo().completeTask(task.id, { ownerTodayIso: "2026-08-17" }),
      taskRepo().completeTask(task.id, { ownerTodayIso: "2026-08-17" }),
    ]);
    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM task_recurrence_rules
       WHERE workspace_id = ? AND series_id = ?`,
    )
      .bind(WS, task.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(2);
  });

  it("refuses to SKIP an occurrence past the series' end date", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2026-09-28", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
      endsOnDate: "2026-09-28",
    });
    await expect(
      tasks.skipTaskOccurrence(task.id, { ownerTodayIso: "2026-09-28" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    expect((await tasks.getTask(task.id))?.scheduledDate).toBe("2026-09-28");
  });
});

/* -------------------------------------------------------------------------- */
/* TASKS-13 checklist inheritance, under the new rules                        */
/* -------------------------------------------------------------------------- */

describe("checklist inheritance still holds for every advanced rule", () => {
  it("copies titles and order, resets ticks and mints fresh ids", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2026-08-28", {
      frequency: "month",
      dateKind: "scheduled",
      ordinal: "last",
      weekdays: [5],
      endsAfterCount: 4,
    });
    await tasks.createChecklistItem(task.id, { title: "Check tyres" });
    await tasks.createChecklistItem(task.id, { title: "Check gas" });
    const original = await tasks.listChecklist(task.id);
    await tasks.setChecklistItemCompleted(task.id, original[0]!.id, true);

    const successor = (
      await tasks.completeTask(task.id, { ownerTodayIso: "2026-08-28" })
    ).successor!;
    const inherited = await tasks.listChecklist(successor.id);

    expect(inherited.map((item) => item.title)).toEqual([
      "Check tyres",
      "Check gas",
    ]);
    expect(inherited.map((item) => item.position)).toEqual([0, 1]);
    expect(inherited.every((item) => item.completed === false)).toBe(true);
    expect(
      inherited.every(
        (item) => !original.some((source) => source.id === item.id),
      ),
    ).toBe(true);
    // The completed occurrence keeps its own history untouched.
    const kept = await tasks.listChecklist(task.id);
    expect(kept[0]?.completed).toBe(true);
  });

  it("writes NO checklist when the series has ended, because no successor exists", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2026-08-01", {
      frequency: "day",
      dateKind: "scheduled",
      endsAfterCount: 1,
    });
    await tasks.createChecklistItem(task.id, { title: "Only step" });
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-01",
    });
    expect(result.successor).toBeNull();
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM task_checklist_items WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    // Exactly the one item on the completed occurrence, and no orphan clone.
    expect(rows?.n).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Regression: every rule that existed before TASKS-12                        */
/* -------------------------------------------------------------------------- */

describe("every pre-TASKS-12 rule behaves exactly as it did", () => {
  const cases = [
    { rule: { frequency: "day" }, from: "2026-08-19", to: "2026-08-20" },
    { rule: { frequency: "weekday" }, from: "2026-08-21", to: "2026-08-24" },
    { rule: { frequency: "week" }, from: "2026-08-19", to: "2026-08-26" },
    {
      rule: { frequency: "week", weekdays: [1] },
      from: "2026-08-17",
      to: "2026-08-24",
    },
    { rule: { frequency: "month" }, from: "2026-01-31", to: "2026-02-28" },
    { rule: { frequency: "year" }, from: "2026-02-28", to: "2027-02-28" },
  ] as const;

  for (const { rule, from, to } of cases) {
    it(`${rule.frequency}${"weekdays" in rule ? " (weekday-pinned)" : ""}: ${from} -> ${to}`, async () => {
      const tasks = taskRepo();
      const task = await seedRecurring(from, {
        ...rule,
        dateKind: "scheduled",
      });
      const result = await tasks.completeTask(task.id, {
        ownerTodayIso: from,
      });
      expect(result.successor?.scheduledDate).toBe(to);
      // And every advanced column is at its documented absent value.
      const row = await ruleRow(result.successor!.id);
      expect(row).toMatchObject({
        ordinal: null,
        weekend_rule: "allow",
        ends_after_count: null,
        ends_on_date: null,
      });
    });
  }

  it("keeps 29 February returning to the 29th in the next leap year", async () => {
    const tasks = taskRepo();
    const task = await seedRecurring("2028-02-29", {
      frequency: "year",
      dateKind: "scheduled",
    });
    // 2029 has no 29 February, so it clamps to the 28th...
    const first = (
      await tasks.completeTask(task.id, { ownerTodayIso: "2028-02-29" })
    ).successor!;
    expect(first.scheduledDate).toBe("2029-02-28");
    // ...and the ORIGINALLY REQUESTED day is kept, so 2032 returns to the 29th.
    let current = first;
    for (let year = 0; year < 3; year += 1) {
      current = (
        await tasks.completeTask(current.id, {
          ownerTodayIso: current.scheduledDate!,
        })
      ).successor!;
    }
    expect(current.scheduledDate).toBe("2032-02-29");
  });
});
