/**
 * TASKS-13 — the checklist's ROUTE: the one authenticated authority every
 * surface reaches, and the offline replay that shares it.
 *
 * Nothing here is mocked. The submissions go through the same
 * `/tasks/:taskId` action the record posts to, against the committed migrations
 * and the real domain, so what is proven is what actually ships:
 *
 *   - the five intents, their answers, and that every answer carries the WHOLE
 *     checklist so a surface reconciles rather than accumulating an opinion;
 *   - a refusal is worded, never a status code, and a CONFLICT refusal carries
 *     the truth so the surface can correct itself;
 *   - a replayed offline tick applies exactly once however many times it is
 *     delivered, and a duplicate is a truthful no-op;
 *   - a replay whose item changed elsewhere is a CONFLICT with the server's
 *     value, and a change to a DIFFERENT item merges rather than conflicting;
 *   - a receipt for one item cannot be satisfied by a request naming another.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import type { AuthenticatedSession } from "~/kernel/auth";
import type { OfflineReplayReport } from "~/kernel/offline";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskAction } from "~/modules/tasks/routes/task-detail";
import { loader as taskLoader } from "~/modules/tasks/routes/task-detail";

import {
  FakeClock,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "dev@dalyhub.test";

const nextEntityId = sequentialIds("clr_ent");
const nextActivityId = sequentialIds("clr_act");

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-18T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function authedContext(subject = OWNER): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject, email: subject, displayName: null },
  } as AuthenticatedSession;
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

interface ChecklistItemBody {
  readonly id: string;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
}

type ActionBody = Record<string, unknown> & {
  readonly kind?: string;
  readonly status?: string;
  readonly formError?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly checklist?: readonly ChecklistItemBody[];
  readonly item?: ChecklistItemBody;
  readonly offline?: OfflineReplayReport;
};

async function post(
  taskId: string,
  fields: Record<string, string>,
  repeated?: readonly [string, readonly string[]],
  subject = OWNER,
): Promise<ActionBody> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  if (repeated)
    for (const value of repeated[1]) form.append(repeated[0], value);
  const response = (await taskAction({
    request: new Request(`https://app.test/tasks/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(subject),
    params: { taskId },
  } as unknown as Parameters<typeof taskAction>[0])) as Response;
  return (await response.json()) as ActionBody;
}

async function loadRecord(taskId: string): Promise<ActionBody> {
  const response = (await taskLoader({
    request: new Request(`https://app.test/tasks/${taskId}`),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskLoader>[0])) as Response;
  return (await response.json()) as ActionBody;
}

let keyCounter = 0;

function key(): string {
  keyCounter += 1;
  return `22222222-2222-4222-8222-${String(keyCounter).padStart(12, "0")}`;
}

async function seedTask(title = "Prepare camper for trip"): Promise<string> {
  const task = await taskRepo().createTask({ title, parent: null });
  return task.id;
}

async function seedItems(
  taskId: string,
  titles: readonly string[],
): Promise<readonly ChecklistItemBody[]> {
  for (const title of titles) {
    await post(taskId, { intent: "checklist_add", title });
  }
  return (await loadRecord(taskId)).checklist!;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("the record's loader", () => {
  it("carries the checklist WITH the record, in the owner's order", async () => {
    const taskId = await seedTask();
    await seedItems(taskId, ["Check tyres", "Fill water", "Charge batteries"]);
    const body = await loadRecord(taskId);
    expect(body.checklist!.map((item) => item.title)).toEqual([
      "Check tyres",
      "Fill water",
      "Charge batteries",
    ]);
    expect(body.checklist!.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("carries an EMPTY checklist for a Task with no steps", async () => {
    const body = await loadRecord(await seedTask());
    expect(body.checklist).toEqual([]);
  });
});

describe("the five intents", () => {
  it("adds an item and answers with the whole checklist", async () => {
    const taskId = await seedTask();
    const body = await post(taskId, {
      intent: "checklist_add",
      title: "Check tyre pressures",
    });
    expect(body.kind).toBe("checklist");
    expect(body.status).toBe("success");
    expect(body.item!.title).toBe("Check tyre pressures");
    expect(body.checklist!.map((item) => item.title)).toEqual([
      "Check tyre pressures",
    ]);
  });

  it("renames, ticks, deletes and reorders through the SAME result shape", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A", "B", "C"]);

    const renamed = await post(taskId, {
      intent: "checklist_rename",
      itemId: items[0]!.id,
      title: "A renamed",
    });
    expect(renamed.checklist!.map((item) => item.title)).toEqual([
      "A renamed",
      "B",
      "C",
    ]);

    const ticked = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[1]!.id,
      completed: "1",
    });
    expect(ticked.checklist!.map((item) => item.completed)).toEqual([
      false,
      true,
      false,
    ]);

    const reordered = await post(taskId, { intent: "checklist_reorder" }, [
      "itemId",
      [items[2]!.id, items[1]!.id, items[0]!.id],
    ]);
    expect(reordered.checklist!.map((item) => item.title)).toEqual([
      "C",
      "B",
      "A renamed",
    ]);

    const deleted = await post(taskId, {
      intent: "checklist_delete",
      itemId: items[1]!.id,
    });
    expect(deleted.checklist!.map((item) => item.title)).toEqual([
      "C",
      "A renamed",
    ]);
    expect(deleted.checklist!.map((item) => item.position)).toEqual([0, 1]);
  });

  it("unticks with the same intent and an empty flag", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A"]);
    await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
    });
    const undone = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "",
    });
    expect(undone.checklist![0]!.completed).toBe(false);
  });

  it("refuses a blank title with a FIELD message and changes nothing", async () => {
    const taskId = await seedTask();
    const body = await post(taskId, { intent: "checklist_add", title: "   " });
    expect(body.status).toBe("error");
    expect(body.fieldErrors!.checklistTitle).toMatch(/enter the step/i);
    // A validation refusal does not carry the checklist: nothing moved, and the
    // owner's draft is the only thing to change.
    expect(body.checklist).toBeUndefined();
    expect((await loadRecord(taskId)).checklist).toEqual([]);
  });

  it("refuses a STALE reorder and hands back the truth so the surface corrects itself", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A", "B"]);
    // Another device adds a step; this device's order is one short.
    await post(taskId, { intent: "checklist_add", title: "C" });

    const body = await post(taskId, { intent: "checklist_reorder" }, [
      "itemId",
      [items[1]!.id, items[0]!.id],
    ]);
    expect(body.status).toBe("error");
    expect(body.formError).toMatch(/changed somewhere else/i);
    // The refusal carries the current list, because retrying is not the fix.
    expect(body.checklist!.map((item) => item.title)).toEqual(["A", "B", "C"]);
  });

  it("says an item is gone in words rather than as a status code", async () => {
    const taskId = await seedTask();
    const body = await post(taskId, {
      intent: "checklist_rename",
      itemId: "ghost",
      title: "Anything",
    });
    expect(body.status).toBe("error");
    expect(body.formError).toMatch(/no longer there/i);
    expect(body.formError).not.toMatch(/\d{3}/);
  });

  it("never completes the parent Task, however many steps are ticked", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A", "B"]);
    for (const item of items) {
      await post(taskId, {
        intent: "checklist_set_completed",
        itemId: item.id,
        completed: "1",
      });
    }
    const record = (await loadRecord(taskId)) as unknown as {
      task: { completedAt: string | null };
    };
    expect(record.task.completedAt).toBeNull();
  });
});

describe("offline replay of a checklist tick", () => {
  it("applies exactly once however many times it is delivered", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A"]);
    const idempotencyKey = key();

    const first = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: idempotencyKey,
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    expect(first.offline).toEqual({ kind: "applied", replayed: false });
    expect(first.checklist![0]!.completed).toBe(true);

    // The SAME key again: the receipt answers, nothing is applied a second time,
    // and the answer is still the truth rather than an error.
    const again = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: idempotencyKey,
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    expect(again.offline).toEqual({ kind: "applied", replayed: true });
    expect(again.checklist![0]!.completed).toBe(true);
  });

  it("reports a CONFLICT when the same item changed on the server", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A"]);
    // The other device ticked it while this one was offline...
    await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
    });
    // ...and this device queued an UNTICK from a base of "done".
    const body = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "",
      offlineKey: key(),
      offlineOperation: "set_checklist_completed",
      offlineBase: "1",
    });
    // Not a conflict: the base ("1") still matches the server, so the owner's
    // untick is applied. This is the merge case, asserted.
    expect(body.offline).toEqual({ kind: "applied", replayed: false });

    // Now a genuine conflict: the server moves under a queued change whose base
    // no longer matches.
    await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
    });
    const conflicted = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "",
      offlineKey: key(),
      offlineOperation: "set_checklist_completed",
      // The device believed it was NOT done; the server says it is, and the
      // intent ("not done") is a third value from the base's point of view.
      offlineBase: "",
    });
    const report = conflicted.offline as Extract<
      OfflineReplayReport,
      { kind: "conflict" }
    >;
    expect(report.kind).toBe("conflict");
    expect(report.conflict.field).toBe("checklistItemCompleted");
    expect(report.conflict.serverValue).toBe("1");
    expect(report.conflict.message).toMatch(/another device/i);
  });

  it("MERGES a queued tick with a server change to a DIFFERENT item", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A", "B"]);
    // The other device ticked B.
    await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[1]!.id,
      completed: "1",
    });
    // This device's queued tick of A must not be reported as conflicting: the
    // contended thing is (item, completed), not "the checklist".
    const body = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: key(),
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    expect(body.offline).toEqual({ kind: "applied", replayed: false });
    expect(body.checklist!.map((item) => item.completed)).toEqual([true, true]);
  });

  it("is terminal when the ITEM was deleted elsewhere, and says which thing went", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A"]);
    await post(taskId, {
      intent: "checklist_delete",
      itemId: items[0]!.id,
    });
    const body = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: key(),
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    expect((body.offline as { kind: string }).kind).toBe("gone");
    // The TASK is still there, so the message must not claim it was deleted.
    expect(body.formError).toMatch(/checklist item was deleted/i);
  });

  it("cannot satisfy one item's receipt with a request naming another", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A", "B"]);
    const idempotencyKey = key();

    await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: idempotencyKey,
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    // The SAME key, a DIFFERENT item. The receipt is filed under the item, so
    // this cannot be answered by the first one's outcome.
    const body = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[1]!.id,
      completed: "1",
      offlineKey: idempotencyKey,
      offlineOperation: "set_checklist_completed",
      offlineBase: "",
    });
    expect((body.offline as { kind: string }).kind).not.toBe("applied");
    // Nothing was written for B under A's key.
    const record = await loadRecord(taskId);
    expect(record.checklist!.map((item) => item.completed)).toEqual([
      true,
      false,
    ]);
  });

  it("refuses a replay whose declared operation does not match its intent", async () => {
    const taskId = await seedTask();
    const items = await seedItems(taskId, ["A"]);
    const body = await post(taskId, {
      intent: "checklist_set_completed",
      itemId: items[0]!.id,
      completed: "1",
      offlineKey: key(),
      // A hand-made key attached to an operation this intent does not perform.
      offlineOperation: "set_title",
      offlineBase: "",
    });
    expect((body.offline as { kind: string }).kind).toBe("invalid");
    expect((await loadRecord(taskId)).checklist![0]!.completed).toBe(false);
  });
});
