/**
 * TASKS-09 — the `/tasks` page accumulator, and the regression it was written for.
 *
 * The defect: the reset was keyed on the loader's first page, which is a fresh array
 * on every revalidation. Three pages of scrolling therefore collapsed back to one the
 * moment anything was mutated, and the owner lost their place on the surface they were
 * least likely to forgive it on.
 *
 * The first test below is that regression, stated in the terms the brief did: three
 * loaded pages survive a revalidation.
 */

import { describe, expect, it } from "vitest";

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  initialTaskPagination,
  mergeTaskPages,
  taskPaginationReducer,
  type TaskPaginationAction,
  type TaskPaginationState,
} from "~/modules/tasks/task-pagination";

function task(id: string, title = id): SerializedTaskListItem {
  return {
    id,
    title,
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

function page(ids: readonly string[]): readonly SerializedTaskListItem[] {
  return ids.map((id) => task(id));
}

function run(
  actions: readonly TaskPaginationAction[],
  from: TaskPaginationState,
): TaskPaginationState {
  return actions.reduce(taskPaginationReducer, from);
}

const CONFIG = '{"systemView":"active"}';

describe("taskPaginationReducer", () => {
  it("keeps three loaded pages across a revalidation of the SAME query", () => {
    const state = run(
      [
        { type: "page", items: page(["b1", "b2"]), nextCursor: "cursor-2" },
        { type: "page", items: page(["c1", "c2"]), nextCursor: null },
        // The loader re-ran. Same configuration, same first-page cursor — only the
        // JSON identity changed, which is exactly what used to wipe the accumulator.
        { type: "sync", resetKey: CONFIG, initialCursor: "cursor-1" },
      ],
      initialTaskPagination(CONFIG, "cursor-1"),
    );

    expect(state.appended.map((item) => item.id)).toEqual([
      "b1",
      "b2",
      "c1",
      "c2",
    ]);
    // A structurally-equal but freshly-deserialised first page, as a revalidation
    // produces it.
    expect(mergeTaskPages(page(["a1", "a2"]), state.appended)).toHaveLength(6);
  });

  it("resets when the CONFIGURATION changes, because those rows are gone", () => {
    const state = run(
      [
        { type: "page", items: page(["b1"]), nextCursor: "cursor-2" },
        {
          type: "sync",
          resetKey: '{"systemView":"today"}',
          initialCursor: "cursor-1",
        },
      ],
      initialTaskPagination(CONFIG, "cursor-1"),
    );

    expect(state.appended).toEqual([]);
    expect(state.cursor).toBe("cursor-1");
    expect(state.resetKey).toBe('{"systemView":"today"}');
  });

  it("does NOT reset when only the first page's cursor moved", () => {
    // A keyset cursor is derived from page one's tail, so capturing or completing a
    // task moves it under any recency-ordered list. Treating that as a reset was the
    // quieter form of the same defect — 92 accumulated rows fell back to 50 after one
    // capture, in the browser.
    const state = run(
      [
        { type: "page", items: page(["b1"]), nextCursor: "cursor-2" },
        { type: "sync", resetKey: CONFIG, initialCursor: "cursor-1b" },
      ],
      initialTaskPagination(CONFIG, "cursor-1"),
    );

    expect(state.appended.map((item) => item.id)).toEqual(["b1"]);
    expect(state.cursor).toBe("cursor-2");
    // It is still RECORDED, so a later configuration change seeds from the current
    // first page rather than a stale one.
    expect(state.initialCursor).toBe("cursor-1b");
  });

  it("seeds a later configuration reset from the CURRENT first-page cursor", () => {
    const state = run(
      [
        { type: "page", items: page(["b1"]), nextCursor: "cursor-2" },
        { type: "sync", resetKey: CONFIG, initialCursor: "cursor-1b" },
        {
          type: "sync",
          resetKey: '{"systemView":"today"}',
          initialCursor: "cursor-9",
        },
      ],
      initialTaskPagination(CONFIG, "cursor-1"),
    );

    expect(state.appended).toEqual([]);
    expect(state.cursor).toBe("cursor-9");
  });

  it("tracks the cursor forward and exhausts it", () => {
    const state = run(
      [
        { type: "page", items: page(["b1"]), nextCursor: "cursor-2" },
        { type: "page", items: page(["c1"]), nextCursor: null },
      ],
      initialTaskPagination(CONFIG, "cursor-1"),
    );
    expect(state.cursor).toBeNull();
  });

  it("records a failed page without moving the cursor, so a retry is possible", () => {
    const before = run(
      [{ type: "page", items: page(["b1"]), nextCursor: "cursor-2" }],
      initialTaskPagination(CONFIG, "cursor-1"),
    );
    const failed = taskPaginationReducer(before, { type: "page_failed" });
    expect(failed.loadFailed).toBe(true);
    expect(failed.cursor).toBe("cursor-2");
    expect(taskPaginationReducer(failed, { type: "retry" }).loadFailed).toBe(
      false,
    );
  });
});

describe("mergeTaskPages", () => {
  it("collapses a duplicate id to its FIRST appearance, so a re-sorted row moves", () => {
    const merged = mergeTaskPages(page(["z", "a"]), page(["a", "b"]));
    expect(merged.map((item) => item.id)).toEqual(["z", "a", "b"]);
  });

  it("keeps the FRESH copy of a duplicated row rather than the accumulated one", () => {
    const merged = mergeTaskPages(
      [task("a", "renamed")],
      [task("a", "stale"), task("b")],
    );
    expect(merged.map((item) => item.title)).toEqual(["renamed", "b"]);
  });

  it("returns the first page unchanged when nothing has been appended", () => {
    const first = page(["a"]);
    expect(mergeTaskPages(first, [])).toBe(first);
  });
});
