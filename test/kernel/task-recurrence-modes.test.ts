/**
 * TASKS-07 / ADR-083 — real Workers/D1 tests for Recurrence 2.0.
 *
 * Three things are proved here, all against real D1 through the real repository:
 *
 *   1. **The migration changed nothing.** A rule stored by the previous build — a row
 *      whose `mode` column simply took its default — still behaves exactly as it did:
 *      completing it late lands on the schedule, not on a completion-relative date.
 *      This is asserted by writing the row the old way (`mode` omitted from the
 *      insert) and completing it, not by trusting the default.
 *   2. **The two modes genuinely differ.** The same interval, the same anchor and the
 *      same late completion produce two different successors — which is the entire
 *      product reason the field exists.
 *   3. **The series operations are safe.** Skipping advances one occurrence without
 *      completing it; moving one occurrence keeps the routine's grid; moving the
 *      series re-anchors it; stopping a repeat keeps every completed occurrence.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TASK_RECURRENCE_OCCURRENCE_SKIPPED,
  TaskValidationError,
} from "~/kernel/tasks";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_recurrence_modes";

const nextEntityId = sequentialIds("mode");
const nextActivityId = sequentialIds("modeact");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-01T09:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at = "2026-08-01T09:00:00.000Z") {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** A Task scheduled on `date` under an Area — the ordinary shape a repeat attaches to. */
async function seedTask(
  ws: string,
  date = "2026-08-01",
  title = "Clean CPAP equipment",
) {
  const area = await spineRepo(ws).createArea({ title: "Health" });
  const task = await taskRepo(ws).createTask({
    title,
    parent: { kind: "area", id: area.id },
    scheduledDate: date,
  });
  return { area, task };
}

/** The raw recurrence row, so the stored mode and grid anchor can be asserted. */
async function recurrenceRow(ws: string, entityId: string) {
  return await env.DB.prepare(
    `SELECT mode, series_anchor_date, series_id, sequence, interval, frequency
       FROM task_recurrence_rules WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(ws, entityId)
    .first<{
      readonly mode: string;
      readonly series_anchor_date: string | null;
      readonly series_id: string;
      readonly sequence: number;
      readonly interval: number;
      readonly frequency: string;
    }>();
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("the migration preserves every existing series", () => {
  it("a rule written WITHOUT a mode column behaves exactly as a fixed schedule", async () => {
    // This is the migration's safety claim, tested rather than asserted. The row is
    // inserted with the same column list the previous build used, so `mode` takes its
    // DEFAULT and `series_anchor_date` stays NULL — precisely the state every
    // pre-TASKS-07 row is in after the ALTER TABLE.
    const { task } = await seedTask(WS, "2026-08-01");
    await env.DB.prepare(
      `INSERT INTO task_recurrence_rules
         (workspace_id, entity_id, entity_type, date_kind, frequency, interval,
          weekdays, anchor_day, anchor_month, series_id, sequence,
          created_at, updated_at)
       VALUES (?, ?, 'task', 'scheduled', 'day', 30, NULL, NULL, NULL, ?, 0, ?, ?)`,
    )
      .bind(
        WS,
        task.id,
        task.id,
        "2026-08-01T09:00:00.000Z",
        "2026-08-01T09:00:00.000Z",
      )
      .run();

    const stored = await recurrenceRow(WS, task.id);
    expect(stored?.mode).toBe("fixed");
    expect(stored?.series_anchor_date).toBeNull();

    // The rule reads back through the ordinary projection as a fixed schedule…
    const tasks = taskRepo(WS);
    const read = await tasks.getTask(task.id);
    expect(read?.recurrence?.mode).toBe("fixed");

    // …and completing it FIVE DAYS LATE still lands on the schedule's own slot
    // (1 Aug + 30 = 31 Aug), not on completion + 30 (5 Sep).
    const result = await tasks.completeTasks([task.id], {
      ownerTodayIso: "2026-08-06",
    });
    expect(result.changed).toBe(1);
    const successor = await tasks.getTask(
      (await recurrenceRowBySequence(WS, task.id, 1))!.entity_id,
    );
    expect(successor?.scheduledDate).toBe("2026-08-31");
  });
});

/** The entity holding a given sequence of a series, read from the ledger. */
async function recurrenceRowBySequence(
  ws: string,
  seriesId: string,
  sequence: number,
) {
  return await env.DB.prepare(
    `SELECT entity_id FROM task_recurrence_rules
      WHERE workspace_id = ? AND series_id = ? AND sequence = ?`,
  )
    .bind(ws, seriesId, sequence)
    .first<{ readonly entity_id: string }>();
}

describe("completing late under each mode", () => {
  it("a FIXED schedule keeps its slot", async () => {
    const { task } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
      mode: "fixed",
    });
    // Monday's routine, finished on Wednesday.
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-05",
    });
    expect(result.successor?.scheduledDate).toBe("2026-08-10");
    // Scenario D: completing it late did NOT move Sunday's routine permanently.
    expect((await recurrenceRow(WS, result.successor!.id))?.mode).toBe("fixed");
  });

  it("an AFTER-COMPLETION interval restarts from the completion day", async () => {
    const { task } = await seedTask(WS, "2026-08-01");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
      interval: 14,
      mode: "after_completion",
    });
    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-06",
    });
    // 6 Aug + 14, not 1 Aug + 14.
    expect(result.successor?.scheduledDate).toBe("2026-08-20");
    // The MODE is carried to the successor, so the series keeps meaning what it meant.
    expect((await recurrenceRow(WS, result.successor!.id))?.mode).toBe(
      "after_completion",
    );
  });

  it("bulk completion applies each series' OWN mode", async () => {
    // A mixed selection must not be special-cased: bulk completion runs the same
    // successor logic per task, so a fixed routine and a relative chore in the same
    // batch each get the successor their own rule describes.
    const { area } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    const fixed = (await tasks.listWorkspaceTasks({ todayIso: "2026-08-01" }))
      .items[0]!;
    await tasks.setTaskRecurrence(fixed.id, {
      frequency: "day",
      dateKind: "scheduled",
      interval: 7,
      mode: "fixed",
    });
    const relative = await tasks.createTask({
      title: "Descale the kettle",
      parent: { kind: "area", id: area.id },
      scheduledDate: "2026-08-03",
    });
    await tasks.setTaskRecurrence(relative.id, {
      frequency: "day",
      dateKind: "scheduled",
      interval: 7,
      mode: "after_completion",
    });
    const plain = await tasks.createTask({
      title: "Submit travel claim",
      parent: { kind: "area", id: area.id },
    });

    const result = await tasks.completeTasks(
      [fixed.id, relative.id, plain.id],
      { ownerTodayIso: "2026-08-06" },
    );
    expect(result.changed).toBe(3);

    const fixedNext = await tasks.getTask(
      (await recurrenceRowBySequence(WS, fixed.id, 1))!.entity_id,
    );
    const relativeNext = await tasks.getTask(
      (await recurrenceRowBySequence(WS, relative.id, 1))!.entity_id,
    );
    expect(fixedNext?.scheduledDate).toBe("2026-08-10");
    expect(relativeNext?.scheduledDate).toBe("2026-08-13");
    // Exactly one successor per SERIES, and none for the one-off task.
    const live = await tasks.listWorkspaceTasks({
      todayIso: "2026-08-06",
      limit: 50,
      filters: { completedVisibility: "include" },
    });
    expect(
      live.items.filter((item) => item.title === "Submit travel claim"),
    ).toHaveLength(1);
  });
});

describe("skipping an occurrence", () => {
  it("advances the occurrence WITHOUT completing it, and says so in Activity", async () => {
    const { task } = await seedTask(WS, "2026-08-03", "Mow the lawn");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });

    const result = await tasks.skipTaskOccurrence(task.id, {
      ownerTodayIso: "2026-08-03",
    });
    expect(result.changed).toBe(true);
    expect(result.skippedFrom).toBe("2026-08-03");
    expect(result.nextDate).toBe("2026-08-10");

    const after = await tasks.getTask(task.id);
    // Still OPEN. Skipped work is not done work, and the record must never say it was.
    expect(after?.completedAt).toBeNull();
    expect(after?.scheduledDate).toBe("2026-08-10");
    // No successor was minted, and the sequence was not consumed.
    expect(after?.recurrenceSeries?.sequence).toBe(0);
    expect(await recurrenceRowBySequence(WS, task.id, 1)).toBeNull();
    // The history says "skipped", not "completed".
    expect(
      await countActivitiesOfType(TASK_RECURRENCE_OCCURRENCE_SKIPPED),
    ).toBe(1);
    expect(await countActivitiesOfType("task.completed")).toBe(0);
  });

  it("carries the non-anchor date with it, keeping the window", async () => {
    const { area } = await seedTask(WS);
    const tasks = taskRepo(WS);
    const task = await tasks.createTask({
      title: "Submit the report",
      parent: { kind: "area", id: area.id },
      scheduledDate: "2026-08-03",
      dueDate: "2026-08-07",
    });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });
    await tasks.skipTaskOccurrence(task.id, { ownerTodayIso: "2026-08-03" });
    const after = await tasks.getTask(task.id);
    expect(after?.scheduledDate).toBe("2026-08-10");
    // Four days of window, preserved.
    expect(after?.dueDate).toBe("2026-08-14");
  });

  it("steps an after-completion interval from the OWNER's day", async () => {
    const { task } = await seedTask(WS, "2026-08-01");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "day",
      dateKind: "scheduled",
      interval: 10,
      mode: "after_completion",
    });
    await tasks.skipTaskOccurrence(task.id, { ownerTodayIso: "2026-08-06" });
    expect((await tasks.getTask(task.id))?.scheduledDate).toBe("2026-08-16");
  });

  it("refuses to skip a task that does not repeat", async () => {
    const { task } = await seedTask(WS);
    await expect(
      taskRepo(WS).skipTaskOccurrence(task.id, {
        ownerTodayIso: "2026-08-01",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("refuses to skip a COMPLETED occurrence", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    await tasks.completeTask(task.id, { ownerTodayIso: "2026-08-01" });
    await expect(
      tasks.skipTaskOccurrence(task.id, { ownerTodayIso: "2026-08-01" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });
});

describe("editing a recurring task at an explicit series scope", () => {
  it("THIS OCCURRENCE moves one date and the routine returns to its schedule", async () => {
    // Weekly on Mondays. This week only, do it on Wednesday. Next week is still Monday.
    const { task } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });

    const moved = await tasks.moveTaskOccurrence(task.id, {
      date: "2026-08-05",
      scope: "occurrence",
    });
    expect(moved.changed).toBe(true);
    expect(moved.task.scheduledDate).toBe("2026-08-05");
    // The routine's grid is REMEMBERED, so the series has not drifted to Wednesdays.
    expect((await recurrenceRow(WS, task.id))?.series_anchor_date).toBe(
      "2026-08-03",
    );

    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-05",
    });
    expect(result.successor?.scheduledDate).toBe("2026-08-10");
    // The successor is back on the grid and carries no override of its own.
    expect(
      (await recurrenceRow(WS, result.successor!.id))?.series_anchor_date,
    ).toBeNull();
  });

  it("THIS AND FUTURE re-anchors the routine to the new date", async () => {
    const { task } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });

    await tasks.moveTaskOccurrence(task.id, {
      date: "2026-08-05",
      scope: "series",
    });
    expect((await recurrenceRow(WS, task.id))?.series_anchor_date).toBeNull();

    const result = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-05",
    });
    // Wednesdays from now on.
    expect(result.successor?.scheduledDate).toBe("2026-08-12");
  });

  it("never rewrites a COMPLETED occurrence", async () => {
    const { task } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });
    const first = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-03",
    });
    const successorId = first.successor!.id;

    // Move the CURRENT occurrence for the whole series…
    await tasks.moveTaskOccurrence(successorId, {
      date: "2026-08-12",
      scope: "series",
    });

    // …and the completed occurrence's own dates are untouched. History is truth.
    const historical = await tasks.getTask(task.id);
    expect(historical?.scheduledDate).toBe("2026-08-03");
    expect(historical?.completedAt).not.toBeNull();
  });

  it("refuses a series move on a task that does not repeat", async () => {
    const { task } = await seedTask(WS);
    await expect(
      taskRepo(WS).moveTaskOccurrence(task.id, {
        date: "2026-08-09",
        scope: "series",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("refuses a scope it was not given", async () => {
    const { task } = await seedTask(WS);
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    await expect(
      tasks.moveTaskOccurrence(task.id, {
        date: "2026-08-09",
        scope: "everything" as unknown as "series",
      }),
    ).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("is an idempotent no-op when nothing would change", async () => {
    const { task } = await seedTask(WS, "2026-08-03");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });
    const result = await tasks.moveTaskOccurrence(task.id, {
      date: "2026-08-03",
      scope: "series",
    });
    expect(result.changed).toBe(false);
  });
});

describe("stopping a repeat", () => {
  it("keeps every completed occurrence and only ends the future", async () => {
    const { task } = await seedTask(WS, "2026-08-03", "Weekly planning");
    const tasks = taskRepo(WS);
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
    });
    const first = await tasks.completeTask(task.id, {
      ownerTodayIso: "2026-08-03",
    });
    const current = first.successor!.id;

    // Stop the repeat on the CURRENT occurrence.
    const stopped = await tasks.setTaskRecurrence(current, null);
    expect(stopped.changed).toBe(true);
    expect(stopped.task.recurrence ?? null).toBeNull();

    // The completed occurrence is still there, still completed, still with its rule —
    // history is not rewritten because the future changed.
    const historical = await tasks.getTask(task.id);
    expect(historical?.completedAt).not.toBeNull();
    expect(historical?.recurrence?.frequency).toBe("week");

    // Completing the current occurrence now ends the series: no new occurrence.
    const last = await tasks.completeTask(current, {
      ownerTodayIso: "2026-08-10",
    });
    expect(last.successor ?? null).toBeNull();
  });
});
