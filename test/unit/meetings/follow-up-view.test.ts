import { describe, expect, it } from "vitest";

import type { SerializedTaskView } from "~/shared/task-record/task-view";
import {
  allFollowUpsComplete,
  followUpGroupOf,
  groupFollowUps,
  hasNoFollowUps,
  meetingItemKindLabel,
  resolveItemConversions,
  type FollowUpTaskEntry,
} from "~/modules/meetings/follow-up-view";

function task(
  over: Partial<SerializedTaskView> & { id: string },
): SerializedTaskView {
  return {
    title: over.id,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    deletedAt: null,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    description: null,
    project: null,
    goal: null,
    area: null,
    waiting: null,
    ...over,
  };
}

function entry(
  t: SerializedTaskView,
  itemId: string | null = null,
): FollowUpTaskEntry {
  return { task: t, itemId };
}

describe("followUpGroupOf", () => {
  it("bands by the canonical display state, never a cached meeting field", () => {
    expect(followUpGroupOf(task({ id: "a" }))).toBe("open");
    expect(followUpGroupOf(task({ id: "b", status: "in_progress" }))).toBe(
      "open",
    );
    expect(followUpGroupOf(task({ id: "c", commitmentState: "someday" }))).toBe(
      "open",
    );
    expect(
      followUpGroupOf(
        task({
          id: "d",
          waiting: {
            since: "2026-07-27T00:00:00.000Z",
            subject: { kind: "text", note: "Sarah" },
          },
        }),
      ),
    ).toBe("waiting");
    expect(followUpGroupOf(task({ id: "e", status: "on_hold" }))).toBe(
      "waiting",
    );
    expect(
      followUpGroupOf(
        task({ id: "f", completedAt: "2026-07-27T00:00:00.000Z" }),
      ),
    ).toBe("done");
    expect(followUpGroupOf(task({ id: "g", status: "cancelled" }))).toBe(
      "done",
    );
  });
});

describe("groupFollowUps", () => {
  it("returns the three ordered bands, each may be empty", () => {
    const groups = groupFollowUps([
      entry(task({ id: "open1", status: "in_progress" })),
      entry(task({ id: "wait1", status: "on_hold" })),
      entry(task({ id: "done1", completedAt: "2026-07-27T00:00:00.000Z" })),
      entry(task({ id: "done2", status: "cancelled" })),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["open", "waiting", "done"]);
    expect(groups[0]?.entries.map((e) => e.task.id)).toEqual(["open1"]);
    expect(groups[1]?.entries.map((e) => e.task.id)).toEqual(["wait1"]);
    expect(groups[2]?.entries.map((e) => e.task.id)).toEqual([
      "done1",
      "done2",
    ]);
  });

  it("keeps empty bands present with a calm hint", () => {
    const groups = groupFollowUps([entry(task({ id: "only" }))]);
    expect(groups[1]?.entries).toHaveLength(0);
    expect(groups[1]?.emptyHint).toBeTruthy();
  });
});

describe("hasNoFollowUps / allFollowUpsComplete", () => {
  it("detects empty and all-complete states", () => {
    expect(hasNoFollowUps([])).toBe(true);
    expect(allFollowUpsComplete([])).toBe(false);
    expect(
      allFollowUpsComplete([
        entry(task({ id: "d", completedAt: "2026-07-27T00:00:00.000Z" })),
        entry(task({ id: "c", status: "cancelled" })),
      ]),
    ).toBe(true);
    expect(
      allFollowUpsComplete([
        entry(task({ id: "d", completedAt: "2026-07-27T00:00:00.000Z" })),
        entry(task({ id: "o" })),
      ]),
    ).toBe(false);
  });
});

describe("meetingItemKindLabel", () => {
  it("labels each stable kind textually", () => {
    expect(meetingItemKindLabel("agenda")).toBe("Agenda item");
    expect(meetingItemKindLabel("decision")).toBe("Decision");
    expect(meetingItemKindLabel("outcome")).toBe("Outcome");
  });
});

describe("resolveItemConversions", () => {
  it("marks each item converted or unconverted from the live-task map", () => {
    const items = [
      { id: "i1", kind: "decision" as const, bodyMarkdown: "One", position: 0 },
      { id: "i2", kind: "outcome" as const, bodyMarkdown: "Two", position: 0 },
    ];
    const live = new Map([["i1", task({ id: "t1", status: "in_progress" })]]);
    const resolved = resolveItemConversions(items, live);
    expect(resolved[0]).toMatchObject({
      itemId: "i1",
      taskId: "t1",
      taskStateLabel: "In progress",
    });
    expect(resolved[1]).toMatchObject({
      itemId: "i2",
      taskId: null,
      taskStateLabel: null,
    });
  });
});
