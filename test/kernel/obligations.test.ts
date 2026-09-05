/**
 * V2.10 LIFE-01 — the ONE Obligation store, against real D1.
 *
 * Real Workers runtime, real isolated D1, the real committed migrations. This
 * file is `asset-history.test.ts`'s obligation half, moved with the domain it
 * proves and extended with what the shared store made possible: an obligation
 * about NOTHING, an obligation about a Person, an expected amount that is not a
 * payment, and the subject's two representations kept in step.
 *
 * The load-bearing guarantees are unchanged and are asserted unchanged — date
 * and meter recurrence, EXACTLY ONE successor under retry and concurrency, the
 * Task authority contract (a ticked Task is not proof the work happened),
 * cross-workspace rejection, the bounded attention read — because "the Asset
 * record behaves exactly as it did" is this item's whole acceptance criterion.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { evaluateAssetObligation } from "~/kernel/assets";
import type { ObligationTaskGateway } from "~/kernel/assets";
import {
  OBLIGATION_COMPLETED,
  OBLIGATION_CREATED,
  ObligationValidationError,
} from "~/kernel/obligations";
import { ObligationNotFoundError } from "~/platform/storage/d1";

import {
  FakeClock,
  countActivitiesOfType,
  countAssetEventRows,
  countObligationRows,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeObligationRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_obligations_other";

function assets(ws = WS, prefix = "a") {
  return makeAssetRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

/** A recording gateway, so the Task RESCHEDULE contract is asserted, not assumed. */
function recordingGateway(
  behaviour: Partial<ObligationTaskGateway> = {},
): ObligationTaskGateway & {
  readonly rescheduled: [string, string | null][];
} {
  const rescheduled: [string, string | null][] = [];
  return {
    rescheduled,
    async rescheduleTask(taskId, dueDate) {
      rescheduled.push([taskId, dueDate]);
      return behaviour.rescheduleTask
        ? behaviour.rescheduleTask(taskId, dueDate)
        : true;
    },
  };
}

/**
 * The obligation repository as the composition root wires it: with the Assets
 * adapter as its PROOF GATEWAY, so an Asset-subject completion still writes its
 * logbook row and advances the Asset's canonical dates (ADR-083).
 */
function obligations(
  ws = WS,
  prefix = "h",
  options: Parameters<typeof makeObligationRepository>[1] = {},
) {
  const context = makeContext(ws);
  return makeObligationRepository(context, {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    proofGateway: makeAssetHistoryRepository(context, {
      clock: new FakeClock().now,
      idGenerator: sequentialIds(`${prefix}e`),
    }),
    meterUnits: ["km", "mi", "hours", "cycles", "count"],
    ...options,
  });
}

/** The Assets history repository, for the logbook assertions. */
function history(
  ws = WS,
  prefix = "h",
  options: Parameters<typeof makeAssetHistoryRepository>[1] = {},
) {
  return makeAssetHistoryRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    ...options,
  });
}

async function ute(ws = WS, prefix = "a") {
  return assets(ws, prefix).create({ title: "Ute", assetType: "vehicle" });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("createObligation", () => {
  it("creates a date obligation with one asset.obligation_created", async () => {
    const asset = await ute();
    const obligation = await obligations().create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-09-30",
    });
    expect(obligation.status).toBe("open");
    expect(obligation.sequence).toBe(0);
    expect(obligation.seriesId).toBe(obligation.id);
    expect(await countObligationRows()).toBe(1);
    expect(await countActivitiesOfType(OBLIGATION_CREATED)).toBe(1);
  });

  it("refuses an obligation with neither a due date nor a meter target", async () => {
    const asset = await ute();
    await expect(
      obligations().create({
        subjectEntityId: asset.id,
        category: "reminder",
        title: "Something",
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
    expect(await countObligationRows()).toBe(0);
  });

  it("refuses a meter target with no unit, and a meter repeat with no interval", async () => {
    const asset = await ute();
    const repo = obligations();
    await expect(
      repo.create({
        subjectEntityId: asset.id,
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
    await expect(
      repo.create({
        subjectEntityId: asset.id,
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
        meterUnit: "km",
        recurrenceKind: "meter",
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
  });

  it("refuses a date repeat with no due date to advance from", async () => {
    const asset = await ute();
    await expect(
      obligations().create({
        subjectEntityId: asset.id,
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
        meterUnit: "km",
        recurrenceKind: "months",
        recurrenceInterval: 6,
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
  });

  /*
   * The refusal CHANGED SHAPE deliberately in V2.10 LIFE-01, and the change is
   * an improvement rather than a regression. The subject used to be the
   * obligation's mandatory parent, so a foreign one meant "no such Asset" — a
   * 404. It is now an optional FIELD, so a foreign one is a field-level refusal
   * that names the field and reveals nothing about the other workspace. The
   * Assets route is unaffected either way: it still fails closed on the Asset
   * before any dispatch, so a foreign id there is still a 404.
   */
  it("refuses an obligation whose subject is in another workspace", async () => {
    const asset = await ute(OTHER, "o");
    await expect(
      obligations(WS).create({
        subjectEntityId: asset.id,
        category: "service",
        title: "Service",
        dueDate: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
  });
});

describe("date-based recurrence", () => {
  it("completes, records the proof, and creates EXACTLY ONE successor", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "6-monthly service",
      dueDate: "2026-07-01",
      recurrenceKind: "months",
      recurrenceInterval: 6,
    });

    const result = await repo.complete(obligation.id, {
      completedOn: "2026-07-05",
      completedAmount: "489.50",
      currencyCode: "AUD",
      subject: {
        provider: "Northside Auto",
        meterValue: 61_200,
        meterUnit: "km",
      },
    });

    expect(result.obligation.status).toBe("completed");
    expect(result.successor).not.toBeNull();
    // Anchored on the day the work was ACTUALLY done, not the day it was due.
    expect(result.successor?.dueDate).toBe("2027-01-05");
    expect(result.successor?.sequence).toBe(1);
    expect(result.successor?.seriesId).toBe(obligation.seriesId);

    // The proof exists as history, in the right category.
    const event = await history().getEvent(result.proof!.id);
    expect(event?.category).toBe("service");
    expect(event?.costMinor).toBe(48_950);
    expect(event?.obligationId).toBe(obligation.id);

    // Canonical facts moved.
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.nextServiceDate).toBe("2027-01-05");
    expect(refreshed?.currentMeterValue).toBe(61_200);

    expect(await countObligationRows()).toBe(2);
    expect(await countActivitiesOfType(OBLIGATION_COMPLETED)).toBe(1);
  });

  it("is idempotent under a retry — no second event, no second successor", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });

    const first = await repo.complete(obligation.id, {
      completedOn: "2026-09-20",
    });
    const retry = await repo.complete(obligation.id, {
      completedOn: "2026-09-20",
    });

    expect(retry.proof!.id).toBe(first.proof!.id);
    expect(retry.successor?.id).toBe(first.successor?.id);
    expect(await countAssetEventRows()).toBe(1);
    expect(await countObligationRows()).toBe(2);
    expect(await countActivitiesOfType(OBLIGATION_COMPLETED)).toBe(1);
  });

  it("creates exactly one successor under concurrent completion", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "inspection",
      title: "Annual inspection",
      dueDate: "2026-07-01",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });

    const [a, b] = await Promise.all([
      repo.complete(obligation.id, { completedOn: "2026-07-01" }),
      repo.complete(obligation.id, { completedOn: "2026-07-01" }),
    ]);

    // One of them won; both report the SAME completion.
    expect(a.obligation.status).toBe("completed");
    expect(b.obligation.status).toBe("completed");
    expect(await countObligationRows()).toBe(2);
    expect(await countAssetEventRows()).toBe(1);
  });

  it("honours an explicit next due date over the calculated one", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });
    const result = await repo.complete(obligation.id, {
      completedOn: "2026-09-20",
      // The date printed on the new certificate beats arithmetic.
      nextDueDate: "2027-10-15",
    });
    expect(result.successor?.dueDate).toBe("2027-10-15");
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.renewalDate).toBe("2027-10-15");
  });

  it("creates no successor for a one-off obligation", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Sell the roof rack",
      dueDate: "2026-08-01",
    });
    const result = await repo.complete(obligation.id);
    expect(result.successor).toBeNull();
    expect(await countObligationRows()).toBe(1);
  });
});

describe("meter-based recurrence", () => {
  it("advances the threshold by the interval from the reading at completion", async () => {
    const asset = await ute();
    const repo = obligations();
    await history().recordMeterReading({
      assetId: asset.id,
      value: 59_500,
      unit: "km",
      readingDate: "2026-06-01",
    });
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service every 10,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
      meterInterval: 10_000,
      recurrenceKind: "meter",
    });

    const result = await repo.complete(obligation.id, {
      completedOn: "2026-07-01",
      subject: {
        meterValue: 60_400,
        meterUnit: "km",
      },
    });

    // 60,400 (the reading the work was done at) + 10,000 — not 60,000 + 10,000,
    // so being 400 km late does not permanently shift the schedule early.
    expect(result.successor?.meterThreshold).toBe(70_400);
    expect(result.successor?.meterUnit).toBe("km");
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.currentMeterValue).toBe(60_400);
  });

  it("reads as 'reading required', never overdue, with no current reading", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const evaluation = evaluateAssetObligation(obligation, "2026-07-01", null);
    expect(evaluation.state).toBe("unknown");
    expect(evaluation.text).toBe("Current meter reading needed");
  });

  it("does not compare incompatible units", async () => {
    const asset = await ute();
    const repo = obligations();
    await history().recordMeterReading({
      assetId: asset.id,
      value: 40_000,
      unit: "mi",
      readingDate: "2026-06-01",
    });
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const evaluation = evaluateAssetObligation(obligation, "2026-07-01", {
      value: 40_000,
      unit: "mi",
    });
    expect(evaluation.meterState).toBe("incompatible");
    expect(evaluation.text).toContain("mi");
  });
});

describe("obligation lifecycle", () => {
  /*
   * An id that names nothing is a caller error, not an empty result: every
   * write path has to say so rather than silently succeeding against nothing.
   * A soft-deleted obligation is the same answer — the row survives, but the
   * obligation does not.
   */
  it("refuses every write against an id that names no obligation", async () => {
    const asset = await ute();
    const repo = obligations();
    await expect(
      repo.update("no_such_obligation", { title: "x" }),
    ).rejects.toBeInstanceOf(ObligationNotFoundError);
    await expect(
      repo.setStatus("no_such_obligation", "dismissed"),
    ).rejects.toBeInstanceOf(ObligationNotFoundError);
    await expect(repo.complete("no_such_obligation")).rejects.toBeInstanceOf(
      ObligationNotFoundError,
    );
    expect(await repo.get("no_such_obligation")).toBeNull();

    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Gone",
      dueDate: "2026-08-01",
    });
    await repo.delete(obligation.id);
    expect(await repo.get(obligation.id)).toBeNull();
    await expect(
      repo.update(obligation.id, { title: "x" }),
    ).rejects.toBeInstanceOf(ObligationNotFoundError);
  });

  it("dismisses, holds and reopens; refuses to reopen a completed occurrence", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Check the tyres",
      dueDate: "2026-08-01",
    });

    const held = await repo.setStatus(obligation.id, "on_hold");
    expect(held.obligation.status).toBe("on_hold");
    const reopened = await repo.setStatus(obligation.id, "open");
    expect(reopened.obligation.status).toBe("open");
    const dismissed = await repo.setStatus(obligation.id, "dismissed");
    expect(dismissed.obligation.status).toBe("dismissed");
    expect((await repo.setStatus(obligation.id, "dismissed")).changed).toBe(
      false,
    );

    await repo.setStatus(obligation.id, "open");
    await repo.complete(obligation.id);
    await expect(repo.setStatus(obligation.id, "open")).rejects.toBeInstanceOf(
      ObligationValidationError,
    );
  });

  it("keeps the completed obligation as history when its proof is deleted", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
      recurrenceKind: "months",
      recurrenceInterval: 6,
    });
    const result = await repo.complete(obligation.id, {
      completedOn: "2026-07-01",
    });
    await history().deleteEvent(result.proof!.id);

    const reread = await repo.get(obligation.id);
    expect(reread?.status).toBe("completed");
    expect(reread?.completedEventId).toBeNull();
    // The successor — and therefore the recurrence — is untouched.
    const successor = await repo.get(result.successor!.id);
    expect(successor?.status).toBe("open");
    expect(successor?.sequence).toBe(1);
  });

  it("sorts open work before completed in the obligations list", async () => {
    const asset = await ute();
    const repo = obligations();
    const done = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Old thing",
      dueDate: "2026-01-01",
    });
    await repo.complete(done.id);
    await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Next thing",
      dueDate: "2026-12-01",
    });

    const page = await repo.list({
      subjectEntityId: asset.id,
    });
    expect(page.items[0].title).toBe("Next thing");
    expect(page.items.at(-1)!.title).toBe("Old thing");
  });
});

/* -------------------------------------------------------------------------- */
/* Task integration (§7 — the authority contract)                             */
/* -------------------------------------------------------------------------- */

describe("linked Task authority", () => {
  async function taskFor(title: string): Promise<string> {
    const tasks = makeTaskRepository(makeContext(WS));
    const task = await tasks.createTask({ title });
    return task.id;
  }

  it("links a Task and rejects a Task from another workspace", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
    });
    const taskId = await taskFor("Renew the rego");

    const linked = await repo.linkTask(obligation.id, taskId);
    expect(linked.created).toBe(true);
    expect(linked.obligation.taskId).toBe(taskId);
    expect((await repo.linkTask(obligation.id, taskId)).created).toBe(false);

    const stranger = await makeTaskRepository(makeContext(OTHER)).createTask({
      title: "Elsewhere",
    });
    await expect(
      repo.linkTask(obligation.id, stranger.id),
    ).rejects.toBeInstanceOf(ObligationValidationError);
  });

  it("does NOT complete the obligation when the Task is ticked off", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkTask(obligation.id, taskId);

    await makeTaskRepository(makeContext(WS)).completeTask(taskId);

    const reconciled = await repo.reconcileTask(obligation.id);
    expect(reconciled.taskState).toBe("completed");
    // The obligation is STILL OPEN: ticking a task is not proof of servicing.
    expect(reconciled.obligation.status).toBe("open");
    expect(await countAssetEventRows()).toBe(0);
  });

  it("heals a pointer to a deleted Task so a fresh one can be created", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkTask(obligation.id, taskId);

    await makeSpineRepository(makeContext(WS)).softDelete(taskId);

    const reconciled = await repo.reconcileTask(obligation.id);
    expect(reconciled.taskState).toBe("missing");
    expect(reconciled.obligation.taskId).toBeNull();
    expect(reconciled.changed).toBe(true);
  });

  it("completes the open linked Task when the obligation is completed", async () => {
    const asset = await ute();
    const tasks = makeTaskRepository(makeContext(WS));
    // AUDIT-13 — the REAL Task adapter plans the completion, and the obligation's
    // own batch runs it. Asserting the Task row itself, not a spy, is the point:
    // the two writes now share one transaction.
    const repo = obligations(WS, "h", { taskCompletionPlanner: tasks });
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkTask(obligation.id, taskId);

    const result = await repo.complete(obligation.id);
    expect(result.taskOutcome).toBe("completed");
    expect((await tasks.getTask(taskId))?.completedAt).not.toBeNull();
  });

  it("moves the linked Task's due date when the obligation is rescheduled", async () => {
    const asset = await ute();
    const gateway = recordingGateway();
    const repo = obligations(WS, "h", { taskGateway: gateway });
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkTask(obligation.id, taskId);

    await repo.update(obligation.id, { dueDate: "2026-08-15" });
    expect(gateway.rescheduled).toEqual([[taskId, "2026-08-15"]]);
  });

  it("keeps the obligation when the linked Task is deleted", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkTask(obligation.id, taskId);
    await makeSpineRepository(makeContext(WS)).softDelete(taskId);

    expect(await repo.get(obligation.id)).not.toBeNull();
    expect(await countObligationRows()).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Today attention query and collection summaries                             */
/* -------------------------------------------------------------------------- */

describe("listAttention (the Today read seam)", () => {
  it("returns overdue and due-soon obligations with the asset context", async () => {
    const asset = await ute();
    const repo = obligations();
    await repo.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-07-10",
      leadDays: 14,
    });
    await repo.create({
      subjectEntityId: asset.id,
      category: "insurance",
      title: "Insurance renewal",
      dueDate: "2028-01-01",
    });

    const items = await repo.listAttention({ today: "2026-07-01" });
    expect(items).toHaveLength(1);
    expect(items[0].subject?.title).toBe("Ute");
    expect(items[0].subject?.type).toBe("asset");
    // The Asset's own subtype, which is what a glyph is drawn from.
    expect(items[0].subjectSubtype).toBe("vehicle");
    expect(items[0].obligation.title).toBe("Renew registration");
  });

  it("excludes obligations on an ARCHIVED asset", async () => {
    const asset = await ute();
    const repo = obligations();
    await repo.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-07-02",
    });
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(1);

    await assets().archive(asset.id);
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(0);
  });

  it("excludes completed, dismissed and on-hold obligations", async () => {
    const asset = await ute();
    const repo = obligations();
    const a = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "One",
      dueDate: "2026-07-02",
    });
    const b = await repo.create({
      subjectEntityId: asset.id,
      category: "reminder",
      title: "Two",
      dueDate: "2026-07-02",
    });
    await repo.complete(a.id);
    await repo.setStatus(b.id, "on_hold");
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(0);
  });

  it("reports whether a linked Task is still open, for deduplication", async () => {
    const asset = await ute();
    const repo = obligations();
    const obligation = await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-02",
    });
    const task = await makeTaskRepository(makeContext(WS)).createTask({
      title: "Book the service",
    });
    await repo.linkTask(obligation.id, task.id);

    let items = await repo.listAttention({ today: "2026-07-01" });
    expect(items[0].hasOpenTask).toBe(true);

    await makeTaskRepository(makeContext(WS)).completeTask(task.id);
    items = await repo.listAttention({ today: "2026-07-01" });
    expect(items[0].hasOpenTask).toBe(false);
  });

  it("never reaches across workspaces", async () => {
    const mine = await ute();
    const theirs = await ute(OTHER, "o");
    await obligations().create({
      subjectEntityId: mine.id,
      category: "reminder",
      title: "Mine",
      dueDate: "2026-07-02",
    });
    await obligations(OTHER, "oh").create({
      subjectEntityId: theirs.id,
      category: "reminder",
      title: "Theirs",
      dueDate: "2026-07-02",
    });
    const items = await obligations().listAttention({ today: "2026-07-01" });
    expect(items.map((i) => i.obligation.title)).toEqual(["Mine"]);
  });
});

describe("summariseObligations (the collection signal)", () => {
  it("counts overdue and due-soon per asset in ONE query", async () => {
    const repo = obligations();
    const a = await ute(WS, "a");
    const b = await assets(WS, "b").create({
      title: "Mower",
      assetType: "equipment",
    });
    await repo.create({
      subjectEntityId: a.id,
      category: "registration",
      title: "Rego",
      dueDate: "2026-06-01",
    });
    await repo.create({
      subjectEntityId: a.id,
      category: "service",
      title: "Service",
      dueDate: "2026-07-05",
      leadDays: 14,
    });
    await repo.create({
      subjectEntityId: b.id,
      category: "service",
      title: "Blade sharpen",
      dueDate: "2029-01-01",
    });

    const summary = await repo.summariseBySubject([a.id, b.id], "2026-07-01");
    expect(summary.get(a.id)).toMatchObject({
      openCount: 2,
      overdueCount: 1,
      dueSoonCount: 1,
      nextDueDate: "2026-06-01",
    });
    expect(summary.get(b.id)).toMatchObject({
      openCount: 1,
      overdueCount: 0,
      dueSoonCount: 0,
    });
  });

  it("flags an asset whose meter obligation has no reading", async () => {
    const asset = await ute();
    const repo = obligations();
    await repo.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const summary = await repo.summariseBySubject([asset.id], "2026-07-01");
    expect(summary.get(asset.id)?.needsMeterReading).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Asset lifecycle                                                            */
/* -------------------------------------------------------------------------- */
