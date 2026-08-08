/**
 * AUDIT-13 — rollback, idempotency, concurrency and workspace-isolation evidence
 * for the two compound mutations the August 2026 audit found non-atomic.
 *
 * Real Workers runtime, real isolated D1, the real committed migrations. D1 is
 * NOT mocked: an atomicity claim proved against a fake transaction proves nothing
 * about the transaction that actually runs.
 *
 * The two operations:
 *
 *   1. **Meeting item → Task.** Was five transactions with a compensating
 *      soft-delete. Now one batch.
 *   2. **Asset obligation → linked Task completion.** Completed the Task in its
 *      own transaction and THEN opened the obligation's. Now one batch.
 *
 * For each, the same five questions are asked: does success commit everything,
 * does failure commit nothing, does a retry produce exactly one logical result,
 * can two concurrent requests contradict each other, and can another workspace
 * take part. Plus the sixth the audit cared about most: does Activity describe
 * only what actually committed.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ASSET_OBLIGATION_COMPLETED,
  AssetNotFoundError,
} from "~/kernel/assets";
import {
  MeetingArchivedError,
  MeetingItemNotFoundError,
  MeetingNotFoundError,
} from "~/kernel/meetings";
import { SpineParentUnavailableError } from "~/kernel/spine";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";

import {
  FakeClock,
  countActivitiesOfType,
  countMeetingItemTaskRows,
  latestActivityPayload,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  makeMeetingTaskConversionRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_audit13";
const OTHER = "ws_audit13_other";
const START = "2026-07-27T09:00:00.000Z";

const MEETING_ITEM_CONVERTED_TO_TASK = "meeting.item_converted_to_task";
const ENTITY_CREATED = "entity.created";
const TASK_COMPLETED = "task.completed";

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Direct row counts — the only way to tell "rolled back" from "compensated"   */
/* -------------------------------------------------------------------------- */

/** EVERY Task row, including soft-deleted ones. */
async function countAllTaskRows(ws = WS): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE workspace_id=? AND type='task'",
  )
    .bind(ws)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countTaskDetailRows(ws = WS): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM task_details WHERE workspace_id=?",
  )
    .bind(ws)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countRelatesLinkRows(ws = WS): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entity_links WHERE workspace_id=? AND type=? AND deleted_at IS NULL",
  )
    .bind(ws, TASK_RELATES_TO)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* -------------------------------------------------------------------------- */
/* 1. Meeting item → Task                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Distinct id sequences per harness. Two harnesses in one test represent two
 * REQUESTS, and two requests never share an id generator — giving them the same
 * `sequentialIds` prefix makes them collide on the `activities` primary key and
 * turns every race test into a uniqueness error that hides what it meant to probe.
 */
let harnessSeq = 0;

function meetingHarness(
  ws: string,
  options: Parameters<typeof makeMeetingTaskConversionRepository>[1] = {},
) {
  harnessSeq += 1;
  const tag = `${ws}-h${harnessSeq}`;
  const context = makeContext(ws);
  const shared = {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`${tag}-ent`),
    activityIdGenerator: sequentialIds(`${tag}-act`),
  };
  const meetings = makeMeetingRepository(context, shared);
  const tasks = makeTaskRepository(context, {
    clock: shared.clock,
    activityIdGenerator: shared.activityIdGenerator,
  });
  const entityLinks = makeLinkRepository(context, shared);
  const spine = makeSpineRepository(context, shared);
  const conversions = makeMeetingTaskConversionRepository(
    context,
    { clock: shared.clock, ...options },
    { tasks, meetings, entityLinks },
  );
  return { context, meetings, tasks, entityLinks, spine, conversions };
}

async function seedMeetingAndItem(h: ReturnType<typeof meetingHarness>) {
  const area = await h.spine.createArea({ title: "Operations" });
  const meeting = await h.meetings.create({
    title: "Weekly sync",
    startsAt: START,
    timezone: "UTC",
  });
  const item = await h.meetings.addItem(meeting.id, "action", "Publish notes");
  return { area, meeting, item };
}

describe("AUDIT-13 — meeting item → Task is one transaction", () => {
  it("success: the Task, its details, the mapping, the relationship and all Activity commit together", async () => {
    const h = meetingHarness(WS);
    const { area, meeting, item } = await seedMeetingAndItem(h);

    const result = await h.conversions.convert({
      meetingId: meeting.id,
      itemId: item.id,
      task: {
        title: "Publish the notes",
        parent: { kind: "area", id: area.id },
        status: "on_hold",
        description: "Send to the team channel.",
        priority: "p1",
      },
    });

    expect(result.created).toBe(true);
    const task = await h.tasks.getTask(result.taskId);
    // status and description used to be TWO further transactions after the
    // create; they are now written by the create's own statement.
    expect(task?.status).toBe("on_hold");
    expect(String(task?.description)).toBe("Send to the team channel.");
    expect(task?.priority).toBe("p1");
    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await countRelatesLinkRows()).toBe(1);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(1);
  });

  it.each(["after-task", "after-mapping", "after-link"] as const)(
    "failure at %s: NOTHING commits — no Task row at all, no details, no mapping, no link, no Activity",
    async (fault) => {
      const seed = meetingHarness(WS);
      const { area, meeting, item } = await seedMeetingAndItem(seed);
      const before = await countActivitiesOfType(ENTITY_CREATED);

      const faulty = meetingHarness(WS, { fault });
      await expect(
        faulty.conversions.convert({
          meetingId: meeting.id,
          itemId: item.id,
          task: {
            title: "Publish the notes",
            parent: { kind: "area", id: area.id },
            description: "Send to the team channel.",
          },
        }),
      ).rejects.toBeTruthy();

      // Not "soft-deleted", not "compensated" — never written.
      expect(await countAllTaskRows()).toBe(0);
      expect(await countTaskDetailRows()).toBe(0);
      expect(await countMeetingItemTaskRows()).toBe(0);
      expect(await countRelatesLinkRows()).toBe(0);
      expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(
        0,
      );
      // The Task's own `entity.created` did not survive either.
      expect(await countActivitiesOfType(ENTITY_CREATED)).toBe(before);

      // The source item is untouched and still convertible.
      const meetingAfter = await seed.meetings.get(meeting.id);
      expect(meetingAfter?.items.map((i) => i.id)).toEqual([item.id]);
    },
  );

  it("retry after a failure produces exactly ONE Task, ONE mapping, ONE link, ONE event", async () => {
    const seed = meetingHarness(WS);
    const { area, meeting, item } = await seedMeetingAndItem(seed);

    await expect(
      meetingHarness(WS, { fault: "after-mapping" }).conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: { title: "Publish", parent: { kind: "area", id: area.id } },
      }),
    ).rejects.toBeTruthy();

    const retry = await seed.conversions.convert({
      meetingId: meeting.id,
      itemId: item.id,
      task: { title: "Publish", parent: { kind: "area", id: area.id } },
    });
    expect(retry.created).toBe(true);

    // ...and a THIRD attempt is the idempotent no-op, not a second Task.
    const again = await seed.conversions.convert({
      meetingId: meeting.id,
      itemId: item.id,
      task: { title: "Publish (again)", parent: null },
    });
    expect(again.created).toBe(false);
    expect(again.taskId).toBe(retry.taskId);

    expect(await countAllTaskRows()).toBe(1);
    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await countRelatesLinkRows()).toBe(1);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(1);
  });

  it("concurrency: two conversions of one item cannot produce two Tasks or two events", async () => {
    const seed = meetingHarness(WS);
    const { area, meeting, item } = await seedMeetingAndItem(seed);

    // The racer's idempotency read runs before the winner commits, so it reaches
    // its batch and the unique index refuses it there.
    let winnerId: string | null = null;
    const racer = meetingHarness(WS, {
      raceHook: async () => {
        if (winnerId) return;
        winnerId = (
          await seed.conversions.convert({
            meetingId: meeting.id,
            itemId: item.id,
            task: { title: "Winner", parent: { kind: "area", id: area.id } },
          })
        ).taskId;
      },
    });

    const loser = await racer.conversions.convert({
      meetingId: meeting.id,
      itemId: item.id,
      task: { title: "Loser", parent: { kind: "area", id: area.id } },
    });

    expect(loser.created).toBe(false);
    expect(loser.taskId).toBe(winnerId);
    expect(await countAllTaskRows()).toBe(1);
    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(1);
    expect((await seed.tasks.getTask(loser.taskId))?.title).toBe("Winner");
  });

  it("a Meeting archived between the read and the batch commits NOTHING", async () => {
    const seed = meetingHarness(WS);
    const { area, meeting, item } = await seedMeetingAndItem(seed);

    // The lifecycle check happens before the batch. Archive the Meeting in that
    // gap: the batch must refuse rather than convert against a read-only record.
    const racing = meetingHarness(WS, {
      raceHook: async () => {
        await seed.meetings.archive(meeting.id);
      },
    });

    await expect(
      racing.conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: { title: "Too late", parent: { kind: "area", id: area.id } },
      }),
    ).rejects.toBeInstanceOf(MeetingArchivedError);

    expect(await countAllTaskRows()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countRelatesLinkRows()).toBe(0);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(0);
  });

  it("a source item removed between the read and the batch commits NOTHING", async () => {
    const seed = meetingHarness(WS);
    const { area, meeting, item } = await seedMeetingAndItem(seed);

    // `meeting_item_tasks.item_id` has NO foreign key to `meeting_items`, so
    // nothing in the schema stops a mapping pointing at an item that is gone.
    const racing = meetingHarness(WS, {
      raceHook: async () => {
        await seed.meetings.removeItem(meeting.id, item.id);
      },
    });

    await expect(
      racing.conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: {
          title: "Orphan mapping?",
          parent: { kind: "area", id: area.id },
        },
      }),
    ).rejects.toBeInstanceOf(MeetingItemNotFoundError);

    expect(await countAllTaskRows()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countRelatesLinkRows()).toBe(0);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(0);
  });

  it("an unavailable parent raises the TYPED parent error, not a raw storage failure", async () => {
    const h = meetingHarness(WS);
    const { meeting, item } = await seedMeetingAndItem(h);
    const foreignArea = await meetingHarness(OTHER).spine.createArea({
      title: "Their area",
    });

    // The Task's entity insert is parent-gated and changes no row. Everything
    // after it must decline too — including the conversion event, whose Task
    // SUBJECT would otherwise fail an `activity_subjects → entities` foreign key
    // and surface as an opaque storage error instead of "choose another parent".
    await expect(
      h.conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: {
          title: "Cross-workspace parent",
          parent: { kind: "area", id: foreignArea.id },
        },
      }),
    ).rejects.toBeInstanceOf(SpineParentUnavailableError);

    expect(await countAllTaskRows()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(0);
  });

  it("workspace isolation: another workspace cannot convert this meeting's item", async () => {
    const h = meetingHarness(WS);
    const { meeting, item } = await seedMeetingAndItem(h);
    const stranger = meetingHarness(OTHER);

    await expect(
      stranger.conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: { title: "Steal", parent: null },
      }),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);

    expect(await countAllTaskRows(OTHER)).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
  });

  it("workspace isolation: a parent from another workspace refuses, and writes nothing", async () => {
    const h = meetingHarness(WS);
    const { meeting, item } = await seedMeetingAndItem(h);
    const foreignArea = await meetingHarness(OTHER).spine.createArea({
      title: "Their area",
    });

    await expect(
      h.conversions.convert({
        meetingId: meeting.id,
        itemId: item.id,
        task: {
          title: "Cross-workspace parent",
          parent: { kind: "area", id: foreignArea.id },
        },
      }),
    ).rejects.toBeTruthy();

    // The Task's entity insert is parent-gated, so it changed no row — and the
    // mapping and link that would have followed rolled back with it.
    expect(await countAllTaskRows()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countRelatesLinkRows()).toBe(0);
    expect(await countActivitiesOfType(MEETING_ITEM_CONVERTED_TO_TASK)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Asset obligation → linked Task completion                                */
/* -------------------------------------------------------------------------- */

function assetHarness(
  ws: string,
  options: Parameters<typeof makeAssetHistoryRepository>[1] = {},
) {
  const context = makeContext(ws);
  const tasks = makeTaskRepository(context);
  const history = makeAssetHistoryRepository(context, {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`${ws}-h`),
    taskCompletionPlanner: tasks,
    ...options,
  });
  const assets = makeAssetRepository(context, {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`${ws}-a`),
  });
  return { context, tasks, history, assets };
}

async function seedObligationWithTask(
  h: ReturnType<typeof assetHarness>,
  overrides: { readonly recurrence?: boolean } = {},
) {
  const asset = await h.assets.create({ title: "Ute", assetType: "vehicle" });
  const obligation = await h.history.createObligation(asset.id, {
    category: "service",
    title: "Service",
    dueDate: "2026-07-01",
    ...(overrides.recurrence
      ? { recurrenceKind: "months" as const, recurrenceInterval: 6 }
      : {}),
  });
  const task = await h.tasks.createTask({ title: "Book the service" });
  await h.history.linkObligationTask(obligation.id, task.id);
  return { asset, obligation, taskId: task.id };
}

describe("AUDIT-13 — obligation completion and its linked Task are one transaction", () => {
  it("success: the obligation closes, the proof event lands and the Task is completed together", async () => {
    const h = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(h);

    const result = await h.history.completeObligation(obligation.id);

    expect(result.obligation.status).toBe("completed");
    expect(result.taskOutcome).toBe("completed");
    expect((await h.tasks.getTask(taskId))?.completedAt).not.toBeNull();
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
  });

  it("failure BEFORE the Task statements: nothing commits — obligation open, Task open", async () => {
    const seed = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(seed);

    const faulty = assetHarness(WS, { mutationFault: "after-domain" });
    await expect(
      faulty.history.completeObligation(obligation.id),
    ).rejects.toBeTruthy();

    expect((await seed.history.getObligation(obligation.id))?.status).toBe(
      "open",
    );
    // The defect this replaces: the Task was completed in its own transaction
    // FIRST, so it stayed completed against a still-open obligation.
    expect((await seed.tasks.getTask(taskId))?.completedAt).toBeNull();
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(0);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
  });

  it("failure AFTER the Task statements: nothing commits either — the whole batch rolls back", async () => {
    const seed = assetHarness(WS);
    const { asset, obligation, taskId } = await seedObligationWithTask(seed, {
      recurrence: true,
    });

    const faulty = assetHarness(WS, { obligationTaskFault: true });
    await expect(
      faulty.history.completeObligation(obligation.id),
    ).rejects.toBeTruthy();

    expect((await seed.history.getObligation(obligation.id))?.status).toBe(
      "open",
    );
    expect((await seed.tasks.getTask(taskId))?.completedAt).toBeNull();
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(0);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
    // No successor occurrence was left behind either.
    const page = await seed.history.listObligations({ assetId: asset.id });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.status).toBe("open");
  });

  it("retry after a failure yields exactly ONE completion, ONE event and ONE completed Task", async () => {
    const seed = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(seed);

    await expect(
      assetHarness(WS, {
        obligationTaskFault: true,
      }).history.completeObligation(obligation.id),
    ).rejects.toBeTruthy();

    const first = await seed.history.completeObligation(obligation.id);
    const second = await seed.history.completeObligation(obligation.id);

    expect(first.obligation.status).toBe("completed");
    expect(second.event.id).toBe(first.event.id);
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect((await seed.tasks.getTask(taskId))?.completedAt).not.toBeNull();
  });

  it("concurrency: two completions of one obligation commit one event and one Task completion", async () => {
    const h = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(h);

    const [a, b] = await Promise.all([
      h.history.completeObligation(obligation.id),
      h.history.completeObligation(obligation.id),
    ]);

    expect(a.obligation.status).toBe("completed");
    expect(b.obligation.status).toBe("completed");
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect((await h.tasks.getTask(taskId))?.completedAt).not.toBeNull();
  });

  it("the reported outcome tells the truth: an open linked Task reads `completed`", async () => {
    const h = assetHarness(WS);
    const linked = await seedObligationWithTask(h);

    const result = await h.history.completeObligation(linked.obligation.id);

    expect(result.taskOutcome).toBe("completed");
    // And the Task's own event — the authority — was appended by the same batch.
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
    expect((await h.tasks.getTask(linked.taskId))?.completedAt).not.toBeNull();
  });

  it("the reported outcome tells the truth: an already-ticked Task reads `already_closed`, with no second task.completed", async () => {
    const h = assetHarness(WS);
    const closed = await seedObligationWithTask(h);
    await h.tasks.completeTask(closed.taskId);
    const before = await countActivitiesOfType(TASK_COMPLETED);

    const result = await h.history.completeObligation(closed.obligation.id);

    expect(result.taskOutcome).toBe("already_closed");
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(before);
  });

  it("the reported outcome tells the truth: an obligation with no Task reads `none`", async () => {
    const h = assetHarness(WS);
    const asset = await h.assets.create({
      title: "Mower",
      assetType: "equipment",
    });
    const bare = await h.history.createObligation(asset.id, {
      category: "service",
      title: "Blade sharpen",
      dueDate: "2026-07-01",
    });

    const result = await h.history.completeObligation(bare.id);

    expect(result.taskOutcome).toBe("none");
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
  });

  it("a Task closed by another request in the gap is reported as already_closed, not completed", async () => {
    const h = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(h);

    // The planner reads the Task as OPEN, then it is closed before the batch runs.
    // The Task's completion gate (`completed_at IS NULL`) changes no row, so this
    // operation did NOT close it — and must not say it did.
    const planner = h.tasks;
    const racing = assetHarness(WS, {
      taskCompletionPlanner: {
        async planCompletion(id, options) {
          const plan = await planner.planCompletion(id, options);
          await planner.completeTask(id);
          return plan;
        },
      },
    });

    const result = await racing.history.completeObligation(obligation.id);

    expect(result.obligation.status).toBe("completed");
    expect(result.taskOutcome).toBe("already_closed");
    expect((await h.tasks.getTask(taskId))?.completedAt).not.toBeNull();
    // Exactly ONE `task.completed` — the racer's. This operation invented none.
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
  });

  it("a Task deleted in the gap is reported as missing, not completed", async () => {
    const h = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(h);
    const spine = makeSpineRepository(makeContext(WS));

    const planner = h.tasks;
    const racing = assetHarness(WS, {
      taskCompletionPlanner: {
        async planCompletion(id, options) {
          const plan = await planner.planCompletion(id, options);
          await spine.softDelete(id);
          return plan;
        },
      },
    });

    const result = await racing.history.completeObligation(obligation.id);

    expect(result.obligation.status).toBe("completed");
    // This is the case the pre-batch value got outright wrong: it claimed the
    // operation completed a Task that no longer existed.
    expect(result.taskOutcome).toBe("missing");
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
    expect(taskId).toBeTruthy();
  });

  it("the obligation event no longer restates the Task's outcome — the Task's own event is the authority", async () => {
    const h = assetHarness(WS);
    const { obligation } = await seedObligationWithTask(h);

    await h.history.completeObligation(obligation.id);

    const payload: unknown = JSON.parse(
      (await latestActivityPayload(ASSET_OBLIGATION_COMPLETED)) ?? "{}",
    );
    // Structural facts only, and NOT a second copy of "was the Task completed" —
    // a payload serialised before the batch cannot know, and two events asserting
    // one fact is how they come to disagree.
    expect(payload).not.toHaveProperty("taskOutcome");
    expect(payload).toMatchObject({ createdSuccessor: false });
    // The authority is the Task's own event, appended by the SAME batch.
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(1);
  });

  it("workspace isolation: another workspace's obligation cannot be completed, and its Task is untouched", async () => {
    const mine = assetHarness(WS);
    const { obligation, taskId } = await seedObligationWithTask(mine);
    const stranger = assetHarness(OTHER);

    await expect(
      stranger.history.completeObligation(obligation.id),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    expect((await mine.history.getObligation(obligation.id))?.status).toBe(
      "open",
    );
    expect((await mine.tasks.getTask(taskId))?.completedAt).toBeNull();
    expect(await countActivitiesOfType(TASK_COMPLETED)).toBe(0);
  });
});
