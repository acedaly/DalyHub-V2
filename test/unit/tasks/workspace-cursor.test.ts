import { describe, expect, it } from "vitest";

import { InvalidSpineCursorError } from "~/kernel/spine";
import {
  decodeWorkspaceTaskCursor,
  decodeWorkspaceTaskCursorForScope,
  encodeWorkspaceTaskCursor,
  workspaceTaskCursorScopeMatches,
  workspaceTaskFiltersSignature,
  type WorkspaceTaskCursorScope,
} from "~/kernel/tasks";

const scope: WorkspaceTaskCursorScope = {
  workspaceId: "ws_1",
  view: "all",
  sort: "smart",
  direction: "natural",
  todayIso: "2026-07-25",
  filtersSignature: "p=p1",
};

const position = {
  sortValue: "0|p1|2026-08-01",
  createdAt: "2026-07-01T00:00:00.000Z",
  id: "t1",
};

describe("workspaceTaskFiltersSignature", () => {
  it("is order-independent and stable", () => {
    const a = workspaceTaskFiltersSignature({
      priority: "p1",
      timeSector: "this_week",
    });
    const b = workspaceTaskFiltersSignature({
      timeSector: "this_week",
      priority: "p1",
    });
    expect(a).toBe(b);
  });

  it("is empty for no filters", () => {
    expect(workspaceTaskFiltersSignature(undefined)).toBe("");
    expect(workspaceTaskFiltersSignature({})).toBe("");
  });

  it("distinguishes different filter sets", () => {
    expect(workspaceTaskFiltersSignature({ priority: "p1" })).not.toBe(
      workspaceTaskFiltersSignature({ priority: "p2" }),
    );
  });

  it("binds every TASKS-03 filter dimension, so a page-two cursor cannot survive one", () => {
    const base = workspaceTaskFiltersSignature({});
    for (const filters of [
      { dueState: "overdue" as const },
      { plannedState: "planned_today" as const },
      { parentKind: "project" as const },
      { delegatedTo: "Sam" },
      { createdWithin: "7d" as const },
      { updatedWithin: "30d" as const },
      { completedVisibility: "include" as const },
    ]) {
      expect(workspaceTaskFiltersSignature(filters)).not.toBe(base);
    }
    // Explicitly leaving completed visibility at the view's own rule adds no state,
    // so an existing link keeps producing the signature it always produced.
    expect(
      workspaceTaskFiltersSignature({ completedVisibility: "default" }),
    ).toBe(base);
  });

  it("distinguishes the same dimension at different values", () => {
    expect(workspaceTaskFiltersSignature({ dueState: "overdue" })).not.toBe(
      workspaceTaskFiltersSignature({ dueState: "due_today" }),
    );
    expect(workspaceTaskFiltersSignature({ delegatedTo: "Sam" })).not.toBe(
      workspaceTaskFiltersSignature({ delegatedTo: "Alex" }),
    );
  });
});

describe("workspace task cursor", () => {
  it("round-trips scope and position", () => {
    const decoded = decodeWorkspaceTaskCursor(
      encodeWorkspaceTaskCursor(scope, position),
    );
    expect(decoded.scope).toEqual(scope);
    expect(decoded.position).toEqual(position);
  });

  it("accepts a matching scope via decodeForScope", () => {
    const cursor = encodeWorkspaceTaskCursor(scope, position);
    expect(decodeWorkspaceTaskCursorForScope(cursor, scope)).toEqual(position);
  });

  it("rejects a cursor issued for a different view", () => {
    const cursor = encodeWorkspaceTaskCursor(scope, position);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, { ...scope, view: "today" }),
    ).toThrow(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for a different sort, day or filters", () => {
    const cursor = encodeWorkspaceTaskCursor(scope, position);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, { ...scope, sort: "due_date" }),
    ).toThrow(InvalidSpineCursorError);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, {
        ...scope,
        todayIso: "2026-07-26",
      }),
    ).toThrow(InvalidSpineCursorError);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, {
        ...scope,
        filtersSignature: "p=p2",
      }),
    ).toThrow(InvalidSpineCursorError);
  });

  it("rejects a cursor issued for the OPPOSITE sort direction", () => {
    // A reversed sort is a different ordering: reinterpreting a cursor across it
    // would silently skip or repeat rows.
    const cursor = encodeWorkspaceTaskCursor(scope, position);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, {
        ...scope,
        direction: "desc",
      }),
    ).toThrow(InvalidSpineCursorError);
  });

  it("rejects a cross-workspace cursor", () => {
    const cursor = encodeWorkspaceTaskCursor(scope, position);
    expect(() =>
      decodeWorkspaceTaskCursorForScope(cursor, {
        ...scope,
        workspaceId: "ws_2",
      }),
    ).toThrow(InvalidSpineCursorError);
  });

  it("rejects malformed / tampered cursors", () => {
    expect(() => decodeWorkspaceTaskCursor("")).toThrow(
      InvalidSpineCursorError,
    );
    expect(() => decodeWorkspaceTaskCursor("!!!not-base64!!!")).toThrow(
      InvalidSpineCursorError,
    );
    expect(() => decodeWorkspaceTaskCursor("YWJj")).toThrow(
      InvalidSpineCursorError,
    );
  });

  it("scopeMatches compares every bound field", () => {
    expect(workspaceTaskCursorScopeMatches(scope, { ...scope })).toBe(true);
    expect(
      workspaceTaskCursorScopeMatches(scope, { ...scope, view: "inbox" }),
    ).toBe(false);
    expect(
      workspaceTaskCursorScopeMatches(scope, { ...scope, direction: "asc" }),
    ).toBe(false);
  });
});
