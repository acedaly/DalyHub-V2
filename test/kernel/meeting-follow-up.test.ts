import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { TaskStatus } from "~/kernel/tasks";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";
import {
  convertMeetingItemToTask,
  createMeetingFollowUpTask,
  MeetingArchivedError,
  MeetingNotFoundError,
} from "~/platform/meetings";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  FakeClock,
  countMeetingItemTaskRows,
  countActivitiesOfType,
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  makeRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_meet_followup";
const OTHER = "ws_meet_followup_other";
const START = "2026-07-27T09:00:00.000Z";

const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

interface Harness {
  readonly scope: WorkspaceScope;
  readonly spine: ReturnType<typeof makeSpineRepository>;
  readonly meetings: ReturnType<typeof makeMeetingRepository>;
  readonly tasks: ReturnType<typeof makeTaskRepository>;
  readonly entityLinks: ReturnType<typeof makeLinkRepository>;
}

/**
 * Assemble the four repositories the follow-up orchestration reads into a scope-like
 * object bound to ONE workspace context. This mirrors the composition
 * `bindWorkspaceRepositories` performs in production without needing a full env.
 */
function harness(ws: string): Harness {
  const context = makeContext(ws);
  const shared = {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  };
  const meetings = makeMeetingRepository(context, shared);
  const tasks = makeTaskRepository(context, {
    clock: new FakeClock().now,
    activityIdGenerator: nextActivityId,
  });
  const spine = makeSpineRepository(context, shared);
  const entityLinks = makeLinkRepository(context, shared);
  const entities = makeRepository(context, shared);
  const scope = {
    meetings,
    tasks,
    entityLinks,
    entities,
    spine,
  } as unknown as WorkspaceScope;
  return { scope, spine, meetings, tasks, entityLinks };
}

async function seedArea(h: Harness, title = "Operations") {
  return h.spine.createArea({ title });
}

async function seedMeeting(h: Harness, title = "Weekly sync") {
  return h.meetings.create({ title, startsAt: START, timezone: "UTC" });
}

async function countActiveTasks(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE type='task' AND deleted_at IS NULL",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

async function relatesLinkTargets(
  h: Harness,
  taskId: string,
): Promise<string[]> {
  const page = await h.entityLinks.listForEntity(taskId, { direction: "both" });
  return page.items
    .filter((x) => x.link.type === TASK_RELATES_TO)
    .map((x) =>
      x.link.sourceEntityId === taskId
        ? x.link.targetEntityId
        : x.link.sourceEntityId,
    );
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("MEET-02 — direct meeting follow-up", () => {
  it("creates a canonical Task, mapping and link with structural activity", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);

    const result = await createMeetingFollowUpTask(h.scope, meeting.id, {
      title: "Book the venue",
      parent: { kind: "area", id: area.id },
    });

    expect(result.created).toBe(true);
    const task = await h.tasks.getTask(result.taskId);
    expect(task?.title).toBe("Book the venue");
    // Durable source mapping (direct → item_id NULL).
    expect(await countMeetingItemTaskRows()).toBe(1);
    const followUps = await h.meetings.listFollowUps(meeting.id);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.itemId).toBeNull();
    // Navigable task.relates_to link to the meeting.
    expect(await relatesLinkTargets(h, result.taskId)).toContain(meeting.id);
    // Structural activity, no private content.
    expect(await countActivitiesOfType("meeting.follow_up_created")).toBe(1);
  });
});

describe("MEET-02 — item conversion", () => {
  it.each(["agenda", "decision", "outcome"] as const)(
    "converts a %s item into a canonical Task",
    async (kind) => {
      const h = harness(WS);
      const area = await seedArea(h);
      const meeting = await seedMeeting(h);
      const item = await h.meetings.addItem(meeting.id, kind, "Do the thing");

      const result = await convertMeetingItemToTask(
        h.scope,
        meeting.id,
        item.id,
        {
          title: "Do the thing",
          parent: { kind: "area", id: area.id },
        },
      );

      expect(result.created).toBe(true);
      const task = await h.tasks.getTask(result.taskId);
      expect(task?.title).toBe("Do the thing");
      const mapping = await h.meetings.getFollowUpForItem(item.id);
      expect(mapping?.taskId).toBe(result.taskId);
      expect(mapping?.itemId).toBe(item.id);
      expect(await relatesLinkTargets(h, result.taskId)).toContain(meeting.id);
      expect(
        await countActivitiesOfType("meeting.item_converted_to_task"),
      ).toBe(1);
    },
  );

  it("preserves the supplied canonical Task planning fields", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Ship v2");

    const result = await convertMeetingItemToTask(
      h.scope,
      meeting.id,
      item.id,
      {
        title: "Ship v2",
        parent: { kind: "area", id: area.id },
        priority: "p1",
        dueDate: "2026-08-01",
        scheduledDate: "2026-07-30",
        timeSector: "this_week",
        commitmentState: "someday",
        status: "in_progress",
      },
    );

    const task = await h.tasks.getTask(result.taskId);
    expect(task?.priority).toBe("p1");
    expect(task?.dueDate).toBe("2026-08-01");
    expect(task?.scheduledDate).toBe("2026-07-30");
    expect(task?.timeSector).toBe("this_week");
    expect(task?.commitmentState).toBe("someday");
    expect(task?.status).toBe("in_progress");
  });

  it("carries only structural metadata (no item text) in the activity payload", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const secret = "CONFIDENTIAL board decision text";
    const item = await h.meetings.addItem(meeting.id, "decision", secret);

    await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Follow up",
      parent: { kind: "area", id: area.id },
    });

    const row = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type='meeting.item_converted_to_task' LIMIT 1",
    ).first<{ payload_json: string }>();
    expect(row?.payload_json).toBeTruthy();
    expect(row!.payload_json).not.toContain(secret);
    expect(JSON.parse(row!.payload_json)).toEqual({ itemKind: "decision" });
  });
});

describe("MEET-02 — idempotency & duplicate prevention", () => {
  it("returns the same Task on a repeated item conversion (no duplicate)", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(
      meeting.id,
      "outcome",
      "Publish notes",
    );

    const first = await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Publish notes",
      parent: { kind: "area", id: area.id },
    });
    const second = await convertMeetingItemToTask(
      h.scope,
      meeting.id,
      item.id,
      {
        title: "Publish notes again",
        parent: { kind: "area", id: area.id },
      },
    );

    expect(second.created).toBe(false);
    expect(second.taskId).toBe(first.taskId);
    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await countActiveTasks()).toBe(1);
  });

  it("recovers the winning Task and soft-deletes the duplicate on a conversion race", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Decide");
    const first = await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Decide",
      parent: { kind: "area", id: area.id },
    });

    // Simulate a race: the idempotency read misses the mapping on the FIRST call, so
    // the orchestration proceeds to create a duplicate Task; the real unique index
    // then rejects the mapping insert, and recovery must return the winner.
    let reads = 0;
    const racing = {
      ...h.scope,
      meetings: new Proxy(h.meetings, {
        get(target, prop, receiver) {
          if (prop === "getFollowUpForItem") {
            return async (id: string) => {
              reads += 1;
              return reads === 1 ? null : target.getFollowUpForItem(id);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    } as unknown as WorkspaceScope;

    const second = await convertMeetingItemToTask(racing, meeting.id, item.id, {
      title: "Decide (dup)",
      parent: { kind: "area", id: area.id },
    });

    expect(second.created).toBe(false);
    expect(second.taskId).toBe(first.taskId);
    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await countActiveTasks()).toBe(1); // the duplicate was compensated
  });

  it("soft-deletes the created Task and rethrows when the commit fails (no orphan)", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);

    const failing = {
      ...h.scope,
      meetings: new Proxy(h.meetings, {
        get(target, prop, receiver) {
          if (prop === "linkFollowUpTask") {
            return async () => {
              throw new Error("commit fault");
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    } as unknown as WorkspaceScope;

    await expect(
      createMeetingFollowUpTask(failing, meeting.id, {
        title: "Orphan?",
        parent: { kind: "area", id: area.id },
      }),
    ).rejects.toThrow("commit fault");

    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countActiveTasks()).toBe(0); // compensated — no orphan
  });

  it("compensates the created Task when a bad status update fails (no orphan)", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Bad status");

    await expect(
      convertMeetingItemToTask(h.scope, meeting.id, item.id, {
        title: "Bad status",
        parent: { kind: "area", id: area.id },
        // An invalid status is validated by the Task authority INSIDE the
        // compensated region, so the just-created Task must be rolled back.
        status: "not_a_real_status" as TaskStatus,
      }),
    ).rejects.toBeTruthy();

    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countActiveTasks()).toBe(0);
  });

  it("re-converts an item whose Task was deleted (stale mapping cleared)", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "agenda", "Prep");
    const first = await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Prep",
      parent: { kind: "area", id: area.id },
    });
    // Delete the converted Task (canonical Task lifecycle — via the spine).
    await h.spine.softDelete(first.taskId);

    const again = await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Prep again",
      parent: { kind: "area", id: area.id },
    });
    expect(again.created).toBe(true);
    expect(again.taskId).not.toBe(first.taskId);
    // Exactly one active mapping remains (the stale one was cleared).
    expect(await countMeetingItemTaskRows()).toBe(1);
  });
});

describe("MEET-02 — lifecycle", () => {
  it("rejects a new conversion on an archived meeting and writes nothing", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Later");
    await h.meetings.archive(meeting.id);

    await expect(
      convertMeetingItemToTask(h.scope, meeting.id, item.id, {
        title: "Later",
        parent: { kind: "area", id: area.id },
      }),
    ).rejects.toBeInstanceOf(MeetingArchivedError);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countActiveTasks()).toBe(0);
  });

  it("keeps the relationship when the Task is completed", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "outcome", "Send recap");
    const result = await convertMeetingItemToTask(
      h.scope,
      meeting.id,
      item.id,
      {
        title: "Send recap",
        parent: { kind: "area", id: area.id },
      },
    );

    await h.tasks.completeTask(result.taskId);

    const mapping = await h.meetings.getFollowUpForItem(item.id);
    expect(mapping?.taskId).toBe(result.taskId);
    expect(await relatesLinkTargets(h, result.taskId)).toContain(meeting.id);
    const task = await h.tasks.getTask(result.taskId);
    expect(task?.completedAt).not.toBeNull();
  });

  it("does not delete the Task when the source meeting is deleted", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Keep me");
    const result = await convertMeetingItemToTask(
      h.scope,
      meeting.id,
      item.id,
      {
        title: "Keep me",
        parent: { kind: "area", id: area.id },
      },
    );

    await h.scope.entities.softDelete(meeting.id);

    expect(await h.meetings.get(meeting.id)).toBeNull();
    const task = await h.tasks.getTask(result.taskId);
    expect(task?.title).toBe("Keep me"); // the canonical Task survives
  });

  it("keeps the mapping identity when items are reordered", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const first = await h.meetings.addItem(meeting.id, "agenda", "First");
    const second = await h.meetings.addItem(meeting.id, "agenda", "Second");
    const conv = await convertMeetingItemToTask(
      h.scope,
      meeting.id,
      second.id,
      {
        title: "Second",
        parent: { kind: "area", id: area.id },
      },
    );

    // Reorder the items in storage (positions swap); identity is the stable id.
    await env.DB.prepare(
      "UPDATE meeting_items SET position=99 WHERE workspace_id=? AND id=?",
    )
      .bind(WS, second.id)
      .run();
    void first;

    const mapping = await h.meetings.getFollowUpForItem(second.id);
    expect(mapping?.taskId).toBe(conv.taskId);
  });
});

describe("MEET-02 — isolation", () => {
  it("scopes conversions and mappings to one workspace", async () => {
    const h = harness(WS);
    const other = harness(OTHER);
    const area = await seedArea(h);
    const meeting = await seedMeeting(h);
    const item = await h.meetings.addItem(meeting.id, "decision", "Ours");
    await convertMeetingItemToTask(h.scope, meeting.id, item.id, {
      title: "Ours",
      parent: { kind: "area", id: area.id },
    });

    // The other workspace cannot see the mapping and cannot convert the meeting.
    expect(await other.meetings.getFollowUpForItem(item.id)).toBeNull();
    expect(await other.meetings.listFollowUps(meeting.id)).toHaveLength(0);
    await expect(
      convertMeetingItemToTask(other.scope, meeting.id, item.id, {
        title: "Steal",
        parent: { kind: "area", id: area.id },
      }),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);
  });

  it("links different meetings to different Tasks without cross-contamination", async () => {
    const h = harness(WS);
    const area = await seedArea(h);
    const m1 = await seedMeeting(h, "Meeting one");
    const m2 = await seedMeeting(h, "Meeting two");
    const i1 = await h.meetings.addItem(m1.id, "decision", "One");
    const i2 = await h.meetings.addItem(m2.id, "decision", "Two");
    const r1 = await convertMeetingItemToTask(h.scope, m1.id, i1.id, {
      title: "One",
      parent: { kind: "area", id: area.id },
    });
    const r2 = await convertMeetingItemToTask(h.scope, m2.id, i2.id, {
      title: "Two",
      parent: { kind: "area", id: area.id },
    });

    const followUps1 = await h.meetings.listFollowUps(m1.id);
    const followUps2 = await h.meetings.listFollowUps(m2.id);
    expect(followUps1.map((f) => f.taskId)).toEqual([r1.taskId]);
    expect(followUps2.map((f) => f.taskId)).toEqual([r2.taskId]);
    expect(r1.taskId).not.toBe(r2.taskId);
  });
});
