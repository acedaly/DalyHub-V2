/**
 * TASKS-09 — the optimistic patch map.
 *
 * The contract these tests hold is ADR-086's split: a patch may change what a row
 * SHOWS, and may not change anything the server is the authority on. So the record is
 * patched (and every derived display value re-derived from it), while a grouping's
 * per-bucket COUNT — which is the server's claim about records the client has never
 * seen — is left exactly as it was.
 */

import { describe, expect, it } from "vitest";

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  NO_TASK_PATCHES,
  applyTaskPatch,
  applyTaskPatches,
  applyTaskPatchesToGrouping,
  withTaskPatch,
  withoutTaskPatch,
} from "~/modules/tasks/task-optimistic";
import { toTaskCardData } from "~/modules/tasks/tasks-view-model";

function task(id: string): SerializedTaskListItem {
  return {
    id,
    title: `Task ${id}`,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    parent: null,
    waiting: null,
  };
}

describe("the patch map", () => {
  it("merges two changes to the same row rather than replacing the first", () => {
    const patches = withTaskPatch(
      withTaskPatch(NO_TASK_PATCHES, "a", { priority: "p1" }),
      "a",
      { dueDate: "2026-08-20" },
    );
    expect(patches.get("a")).toEqual({
      priority: "p1",
      dueDate: "2026-08-20",
    });
  });

  it("drops one row's patch and leaves the others", () => {
    const patches = withTaskPatch(
      withTaskPatch(NO_TASK_PATCHES, "a", { priority: "p1" }),
      "b",
      { priority: "p2" },
    );
    const after = withoutTaskPatch(patches, "a");
    expect(after.has("a")).toBe(false);
    expect(after.get("b")).toEqual({ priority: "p2" });
  });

  it("returns the same map when there is nothing to drop", () => {
    expect(withoutTaskPatch(NO_TASK_PATCHES, "a")).toBe(NO_TASK_PATCHES);
  });

  it("rolls back only the keys the REFUSED write painted", () => {
    // A due date refused after a priority was accepted must not un-paint the
    // priority — the row would then show a value the server no longer holds, and
    // under a configuration that skips the re-read nothing would correct it.
    const patches = withTaskPatch(NO_TASK_PATCHES, "a", {
      priority: "p1",
      dueDate: "2026-08-20",
    });
    const after = withoutTaskPatch(patches, "a", ["dueDate"]);
    expect(after.get("a")).toEqual({ priority: "p1" });
  });

  it("drops the row's entry entirely once its last painted key is rolled back", () => {
    const patches = withTaskPatch(NO_TASK_PATCHES, "a", { dueDate: null });
    expect(withoutTaskPatch(patches, "a", ["dueDate"]).has("a")).toBe(false);
  });
});

describe("applying a patch", () => {
  it("returns the record untouched when the patch changes nothing", () => {
    const item = task("a");
    expect(applyTaskPatch(item, undefined)).toBe(item);
    expect(applyTaskPatch(item, { priority: null })).toBe(item);
  });

  it("re-derives the DISPLAY state from the patched record, not from a second rule", () => {
    const item = task("a");
    const completed = applyTaskPatch(item, {
      completedAt: "2026-08-09T01:00:00.000Z",
    });
    expect(toTaskCardData(item).completed).toBe(false);
    expect(toTaskCardData(completed).completed).toBe(true);
    expect(toTaskCardData(completed).stateLabel).toBe(
      toTaskCardData({
        ...item,
        completedAt: "2026-08-09T01:00:00.000Z",
      }).stateLabel,
    );
  });

  it("compares a parent by id, so re-filing to the same parent is not a change", () => {
    const item = {
      ...task("a"),
      parent: { kind: "project" as const, id: "p1", title: "Kitchen" },
    };
    expect(
      applyTaskPatch(item, {
        parent: { kind: "project", id: "p1", title: "Kitchen" },
      }),
    ).toBe(item);
    const moved = applyTaskPatch(item, { parent: null });
    expect(moved).not.toBe(item);
    expect(moved.parent).toBeNull();
  });

  it("leaves a page untouched when no visible row is patched", () => {
    const items = [task("a"), task("b")];
    expect(applyTaskPatches(items, NO_TASK_PATCHES)).toBe(items);
    expect(
      applyTaskPatches(
        items,
        withTaskPatch(NO_TASK_PATCHES, "zzz", { priority: "p1" }),
      ),
    ).toBe(items);
  });
});

describe("applying patches to a server grouping", () => {
  const grouping = {
    dimension: "priority" as const,
    groups: [
      { key: "p1", count: 40, hasMore: true, label: null, items: [task("a")] },
      { key: "p2", count: 7, hasMore: false, label: null, items: [task("b")] },
    ],
  };

  it("patches the RECORDS and never the authoritative counts", () => {
    const patched = applyTaskPatchesToGrouping(
      grouping,
      withTaskPatch(NO_TASK_PATCHES, "a", {
        completedAt: "2026-08-09T01:00:00.000Z",
      }),
    );
    expect(patched?.groups[0]?.items[0]?.completedAt).not.toBeNull();
    expect(patched?.groups.map((group) => group.count)).toEqual([40, 7]);
    expect(patched?.groups[0]?.hasMore).toBe(true);
  });

  it("returns the grouping itself when nothing applies", () => {
    expect(applyTaskPatchesToGrouping(grouping, NO_TASK_PATCHES)).toBe(
      grouping,
    );
    expect(applyTaskPatchesToGrouping(null, NO_TASK_PATCHES)).toBeNull();
  });
});
