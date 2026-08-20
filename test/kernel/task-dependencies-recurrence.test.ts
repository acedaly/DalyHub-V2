/**
 * TASKS-12 — where recurrence and dependencies MEET, and the rule that governs
 * it.
 *
 * ── The decision ─────────────────────────────────────────────────────────────
 * **Dependencies are OCCURRENCE-LOCAL and are never copied to a successor.**
 *
 * A dependency is a fact about two pieces of work that EXIST. An occurrence that
 * has not been created yet is not work — it is a prediction — so an edge pointing
 * at one would be a relationship to something that may never happen (a series can
 * end, a rule can be removed, an occurrence can be deleted). Cloning edges onto
 * successors would also mean, for two independent series, guessing which future
 * occurrence of A corresponds to which future occurrence of B; the only honest
 * answers are "by date" (wrong the moment either series is completed late) or "by
 * sequence" (wrong the moment either series is skipped).
 *
 * So the successor arrives with NO dependencies, exactly as it arrives with no
 * waiting state and no delegation, and the owner attaches one if this occurrence
 * genuinely needs it. This file asserts that — precisely, and in every direction —
 * so a future generic relationship-copier cannot quietly change it.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { TASK_BLOCKS } from "~/kernel/tasks";

import {
  FakeClock,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_dep_recurrence";

const nextEntityId = sequentialIds("dr");
const nextActivityId = sequentialIds("dract");

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-19T09:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** A scheduled Task, optionally repeating. */
async function seed(
  title: string,
  scheduledDate: string,
  recurrence?: Record<string, unknown>,
) {
  const tasks = taskRepo();
  const task = await tasks.createTask({ title, parent: null, scheduledDate });
  if (recurrence) {
    await tasks.setTaskRecurrence(task.id, recurrence as never);
  }
  return (await tasks.getTask(task.id))!;
}

async function activeEdges(): Promise<
  readonly {
    readonly source_entity_id: string;
    readonly target_entity_id: string;
  }[]
> {
  const result = await env.DB.prepare(
    `SELECT source_entity_id, target_entity_id FROM entity_links
     WHERE workspace_id = ? AND type = ? AND deleted_at IS NULL`,
  )
    .bind(WS, TASK_BLOCKS)
    .all<{ source_entity_id: string; target_entity_id: string }>();
  return result.results ?? [];
}

beforeEach(async () => {
  await resetTables([WS]);
});

/* -------------------------------------------------------------------------- */
/* Case A — a recurring BLOCKER blocks a one-off Task                          */
/* -------------------------------------------------------------------------- */

describe("Case A: a recurring blocker blocks a one-off Task", () => {
  it("attaches to the OCCURRENCE, and the successor inherits nothing", async () => {
    const tasks = taskRepo();
    const check = await seed("Monthly compliance check", "2026-08-31", {
      frequency: "month",
      dateKind: "scheduled",
    });
    const audit = await seed("Submit annual audit", "2026-10-01");
    await tasks.addTaskDependency(audit.id, check.id);
    expect(
      (await tasks.listBlockedSummaries([audit.id])).get(audit.id),
    ).toMatchObject({ blockerCount: 1 });

    const successor = (
      await tasks.completeTask(check.id, { ownerTodayIso: "2026-08-31" })
    ).successor!;

    // The completed occurrence keeps its edge — history is not rewritten — and
    // the successor has none, so the audit is UNBLOCKED: the specific piece of
    // work it was waiting for is done.
    const edges = await activeEdges();
    expect(edges).toEqual([
      { source_entity_id: check.id, target_entity_id: audit.id },
    ]);
    expect((await tasks.listTaskDependencies(successor.id)).blocks).toEqual([]);
    expect((await tasks.listBlockedSummaries([audit.id])).has(audit.id)).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Case B — a one-off Task blocks a recurring Task                             */
/* -------------------------------------------------------------------------- */

describe("Case B: a one-off Task blocks a recurring Task", () => {
  it("blocks THIS occurrence, and the successor arrives free", async () => {
    const tasks = taskRepo();
    const install = await seed("Install new system", "2026-08-20");
    const weekly = await seed("Weekly system check", "2026-08-24", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
    });
    await tasks.addTaskDependency(weekly.id, install.id);
    expect(
      (await tasks.listBlockedSummaries([weekly.id])).get(weekly.id),
    ).toMatchObject({
      blockerCount: 1,
      firstBlockerTitle: "Install new system",
    });

    // The owner completes the blocked occurrence anyway (blocked never prevents
    // completion). Its successor is a NEW piece of work with no relationships.
    const successor = (
      await tasks.completeTask(weekly.id, { ownerTodayIso: "2026-08-24" })
    ).successor!;
    expect(successor.scheduledDate).toBe("2026-08-31");
    expect(await tasks.listTaskDependencies(successor.id)).toEqual({
      blockedBy: [],
      blocks: [],
    });
    expect(
      (await tasks.listBlockedSummaries([successor.id])).has(successor.id),
    ).toBe(false);
    // And exactly ONE edge exists in the workspace, still pointing at the
    // occurrence it was created for.
    expect(await activeEdges()).toEqual([
      { source_entity_id: install.id, target_entity_id: weekly.id },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Case C — both recurring                                                     */
/* -------------------------------------------------------------------------- */

describe("Case C: a recurring Task blocks another recurring Task", () => {
  it("does NOT clone the dependency onto either successor", async () => {
    const tasks = taskRepo();
    const prepare = await seed("Prepare monthly report", "2026-08-25", {
      frequency: "month",
      dateKind: "scheduled",
    });
    const submit = await seed("Submit monthly report", "2026-08-28", {
      frequency: "month",
      dateKind: "scheduled",
    });
    await tasks.addTaskDependency(submit.id, prepare.id);

    const nextPrepare = (
      await tasks.completeTask(prepare.id, { ownerTodayIso: "2026-08-25" })
    ).successor!;
    const nextSubmit = (
      await tasks.completeTask(submit.id, { ownerTodayIso: "2026-08-28" })
    ).successor!;

    // ONE edge in the workspace, still between the two occurrences that existed
    // when the owner created it. Nothing points at the new pair.
    expect(await activeEdges()).toEqual([
      { source_entity_id: prepare.id, target_entity_id: submit.id },
    ]);
    expect(await tasks.listTaskDependencies(nextSubmit.id)).toEqual({
      blockedBy: [],
      blocks: [],
    });
    expect(await tasks.listTaskDependencies(nextPrepare.id)).toEqual({
      blockedBy: [],
      blocks: [],
    });
    // The next month's pair is therefore NOT blocked, which is the honest state:
    // no one has said this month's submission waits on this month's preparation.
    expect(
      (await tasks.listBlockedSummaries([nextSubmit.id])).has(nextSubmit.id),
    ).toBe(false);
  });

  it("lets the owner attach the dependency again on the new occurrences", async () => {
    const tasks = taskRepo();
    const prepare = await seed("Prepare", "2026-08-25", {
      frequency: "month",
      dateKind: "scheduled",
    });
    const submit = await seed("Submit", "2026-08-28", {
      frequency: "month",
      dateKind: "scheduled",
    });
    await tasks.addTaskDependency(submit.id, prepare.id);
    const nextPrepare = (
      await tasks.completeTask(prepare.id, { ownerTodayIso: "2026-08-25" })
    ).successor!;
    const nextSubmit = (
      await tasks.completeTask(submit.id, { ownerTodayIso: "2026-08-28" })
    ).successor!;

    // The same relationship, on the new pair: a NEW edge with its own identity,
    // not a resurrection of the old one.
    await tasks.addTaskDependency(nextSubmit.id, nextPrepare.id);
    expect(await activeEdges()).toHaveLength(2);
    expect(
      (await tasks.listBlockedSummaries([nextSubmit.id])).get(nextSubmit.id),
    ).toMatchObject({ blockerCount: 1, firstBlockerTitle: "Prepare" });
  });
});

/* -------------------------------------------------------------------------- */
/* End conditions leave no phantom edge                                        */
/* -------------------------------------------------------------------------- */

describe("a series that ends leaves no dangling dependency", () => {
  it("creates no successor and therefore no edge to one", async () => {
    const tasks = taskRepo();
    const last = await seed("Final instalment", "2026-08-01", {
      frequency: "day",
      dateKind: "scheduled",
      endsAfterCount: 1,
    });
    const dependent = await seed("Close the account", "2026-08-05");
    await tasks.addTaskDependency(dependent.id, last.id);

    const result = await tasks.completeTask(last.id, {
      ownerTodayIso: "2026-08-01",
    });
    expect(result.successor).toBeNull();
    // ONE edge, to the occurrence that existed. No edge to an occurrence that
    // will never be created, and none left pointing at nothing.
    const edges = await activeEdges();
    expect(edges).toEqual([
      { source_entity_id: last.id, target_entity_id: dependent.id },
    ]);
    // Every endpoint of every edge resolves to a real Task.
    for (const edge of edges) {
      expect(await tasks.getTask(edge.source_entity_id)).not.toBeNull();
      expect(await tasks.getTask(edge.target_entity_id)).not.toBeNull();
    }
    // And the dependent is unblocked, because its blocker is complete.
    expect(
      (await tasks.listBlockedSummaries([dependent.id])).has(dependent.id),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Undoing a completion                                                        */
/* -------------------------------------------------------------------------- */

describe("undoing a recurring completion", () => {
  it("withdraws the successor without disturbing any dependency", async () => {
    const tasks = taskRepo();
    const routine = await seed("Weekly check", "2026-08-24", {
      frequency: "week",
      dateKind: "scheduled",
      weekdays: [1],
    });
    const dependent = await seed("Write it up", "2026-08-26");
    await tasks.addTaskDependency(dependent.id, routine.id);

    const successor = (
      await tasks.completeTask(routine.id, { ownerTodayIso: "2026-08-24" })
    ).successor!;
    // Unblocked while the occurrence is complete...
    expect(
      (await tasks.listBlockedSummaries([dependent.id])).has(dependent.id),
    ).toBe(false);

    const reopened = await tasks.reopenTask(routine.id);
    expect(reopened.successorOutcome).toBe("removed");
    // ...and blocked again the moment it is reopened, with no reconciliation.
    expect(
      (await tasks.listBlockedSummaries([dependent.id])).get(dependent.id),
    ).toMatchObject({ blockerCount: 1 });
    // The withdrawn successor took no dependency with it.
    expect(await tasks.getTask(successor.id)).toBeNull();
    expect(await activeEdges()).toEqual([
      { source_entity_id: routine.id, target_entity_id: dependent.id },
    ]);
  });
});
