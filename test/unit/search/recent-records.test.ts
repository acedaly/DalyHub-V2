/**
 * FIND-01 — the recency RULE and its presentation, over synthetic rows.
 *
 * The real-D1 half is `test/kernel/recent-records.test.ts`. This file proves
 * the pure halves exhaustively and cheaply: the ordering rule, the exclusion
 * set, and the mapping onto the result shape Search already renders.
 */

import { describe, expect, it } from "vitest";

import {
  isRecencyListableType,
  orderRecentRecords,
  RECENCY_EXCLUDED_TYPES,
  RECENCY_LISTABLE_TYPES,
  RECENT_ACTIVITY_SCAN_LIMIT,
  RECENT_RECORD_LIMIT,
  type RecentRecord,
} from "~/kernel/recent-records";
import {
  RECENT_GROUP_ID,
  RECENT_GROUP_LABEL,
  recentRecordsOutcome,
  recentRecordToResult,
} from "~/shared/search/recent-outcome";
import { decodeSearchOutcome } from "~/shared/search/decode";
import { entityDestination } from "~/shared/entity/destination";

function record(
  id: string,
  lastWorkedAt: string,
  overrides: Partial<RecentRecord> = {},
): RecentRecord {
  return {
    id,
    type: "project",
    title: `Record ${id}`,
    lastWorkedAt,
    // Equal by default, so a test that says nothing about creation exercises
    // the `id` key — the last resort — rather than accidentally the second.
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("the recency rule", () => {
  it("orders newest first", () => {
    const ordered = orderRecentRecords([
      record("a", "2026-08-01T00:00:00.000Z"),
      record("b", "2026-08-03T00:00:00.000Z"),
      record("c", "2026-08-02T00:00:00.000Z"),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks an exact tie by the more recently CREATED record", () => {
    const at = "2026-08-03T09:15:22.481Z";
    const ordered = orderRecentRecords([
      record("a", at, {
        createdAt: "2026-02-01T00:00:00.000Z",
        title: "Older",
      }),
      record("b", at, {
        createdAt: "2026-07-01T00:00:00.000Z",
        title: "Newer",
      }),
    ]);
    /*
     * The common real case: creating a Task inside a Project makes both
     * subjects of ONE event at ONE instant. The owner is looking at the thing
     * they just made, so it leads.
     */
    expect(ordered.map((r) => r.title)).toEqual(["Newer", "Older"]);
  });

  it("never lets creation date outrank a genuinely newer touch", () => {
    const ordered = orderRecentRecords([
      // Ancient record, touched a millisecond ago.
      record("old", "2026-08-03T09:15:22.482Z", {
        createdAt: "2020-01-01T00:00:00.000Z",
        title: "Ancient but just touched",
      }),
      // Brand-new record, touched a millisecond earlier.
      record("new", "2026-08-03T09:15:22.481Z", {
        createdAt: "2026-08-03T09:00:00.000Z",
        title: "New but touched earlier",
      }),
    ]);
    // `createdAt` is a TIE-BREAK, never a second recency signal.
    expect(ordered.map((r) => r.title)).toEqual([
      "Ancient but just touched",
      "New but touched earlier",
    ]);
  });

  it("falls back to id when the instant AND the creation date tie", () => {
    const at = "2026-08-03T09:15:22.481Z";
    const ordered = orderRecentRecords([
      record("a", at),
      record("c", at),
      record("b", at),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("is stable under input order — the same set always yields the same list", () => {
    const at = "2026-08-03T09:15:22.481Z";
    const rows = [
      record("a", at),
      record("b", "2026-08-04T00:00:00.000Z"),
      record("c", at),
    ];
    const forwards = orderRecentRecords(rows).map((r) => r.id);
    const backwards = orderRecentRecords([...rows].reverse()).map((r) => r.id);
    expect(backwards).toEqual(forwards);
    expect(forwards).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      record("a", "2026-08-01T00:00:00.000Z"),
      record("b", "2026-08-03T00:00:00.000Z"),
    ];
    orderRecentRecords(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("consults nothing but the date and the id", () => {
    /*
     * A record carrying every shape a frequency signal might arrive in — and
     * the rule still puts the newer one first. `orderRecentRecords` reads two
     * fields; there is no third input it could be weighting by.
     */
    const noisy = {
      ...record("a", "2026-08-01T00:00:00.000Z"),
      touchCount: 9999,
      score: 1,
      openCount: 500,
    } as unknown as RecentRecord;
    const plain = record("b", "2026-08-02T00:00:00.000Z");
    expect(orderRecentRecords([noisy, plain]).map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("excludes Diary and the Finance transaction, and nothing else", () => {
    /*
     * V2.12 FIN-00 added the second exclusion, and the two are excluded for the
     * same reason: the recency list is what Search shows BEFORE anything is
     * typed, so it is the surface most likely to be read over someone's
     * shoulder. A diary entry's title and a transaction's payee are both
     * statements about the owner's private life, and a list of the last eight is
     * a statement about their week.
     *
     * A Finance ACCOUNT is deliberately NOT excluded, for the same reason a
     * Person is not: a name is not a confession, and it is the Finance record an
     * owner most wants to re-find.
     */
    expect([...RECENCY_EXCLUDED_TYPES].sort()).toEqual([
      "diary",
      "finance_transaction",
    ]);
    expect(isRecencyListableType("finance_transaction")).toBe(false);
    expect(isRecencyListableType("finance_account")).toBe(true);
    expect(isRecencyListableType("diary")).toBe(false);
    for (const type of [
      "task",
      "project",
      "goal",
      "area",
      "note",
      "person",
      // `habit` is here because it was NOT, and that was a real defect: it had
      // a record page and no entry in the shared destination map, so the
      // recency list dropped every Habit and could render empty. See the
      // regression in `test/kernel/recent-records.test.ts`.
      "habit",
    ]) {
      expect(isRecencyListableType(type)).toBe(true);
    }
  });

  it("treats a type with no destination as unlistable, not merely unexcluded", () => {
    /*
     * `isRecencyListableType` asks "can this be listed AND opened?", not "is it
     * absent from the exclusion set?". A type the product does not have — the
     * shape any future routeless entity type would take — is unlistable, which
     * is what keeps unopenable rows from spending the query's limit.
     */
    expect(isRecencyListableType("not_a_real_record_type")).toBe(false);
    expect(RECENCY_EXCLUDED_TYPES.has("not_a_real_record_type")).toBe(false);
  });

  it("keeps every listable type openable", () => {
    for (const type of RECENCY_LISTABLE_TYPES) {
      expect(
        entityDestination(type, "id-1"),
        `${type} is listable but has no destination`,
      ).not.toBeNull();
    }
  });

  it("keeps its bounds small and its horizon larger than its page", () => {
    expect(RECENT_RECORD_LIMIT).toBe(8);
    expect(RECENT_ACTIVITY_SCAN_LIMIT).toBeGreaterThan(RECENT_RECORD_LIMIT);
  });
});

describe("recent records as search results", () => {
  it("maps a record onto the canonical destination for its type", () => {
    const result = recentRecordToResult(
      record("p1", "2026-08-03T00:00:00.000Z", { type: "project" }),
      0,
    );
    expect(result?.target).toEqual({ kind: "route", to: "/projects/p1" });
    expect(result?.entityType).toBe("project");
  });

  it("opens a Task in the shared Drawer over its home route", () => {
    const result = recentRecordToResult(
      record("t1", "2026-08-03T00:00:00.000Z", { type: "task" }),
      0,
    );
    // The existing Task Drawer, not a fourth Task anatomy (ADR-112 §7).
    expect(result?.target).toEqual({
      kind: "drawer",
      drawerKey: "task:t1",
      canonicalPath: "/tasks",
    });
  });

  it("carries no subtitle and no signals, whatever the type", () => {
    for (const type of ["task", "project", "person", "note"]) {
      const result = recentRecordToResult(
        record(`${type}-1`, "2026-08-03T00:00:00.000Z", { type }),
        0,
      );
      expect(result?.subtitle).toBeUndefined();
      expect(result?.signals).toBeUndefined();
    }
  });

  it("drops a record whose type has no real destination", () => {
    expect(
      recentRecordToResult(
        record("x", "2026-08-03T00:00:00.000Z", { type: "workspace" }),
        0,
      ),
    ).toBeNull();
  });

  it("builds ONE group, in recency order, with no ranking applied", () => {
    const outcome = recentRecordsOutcome([
      record("a", "2026-08-01T00:00:00.000Z", { title: "Oldest" }),
      record("c", "2026-08-03T00:00:00.000Z", { title: "Newest" }),
      record("b", "2026-08-02T00:00:00.000Z", { title: "Middle" }),
    ]);

    expect(outcome.groups).toHaveLength(1);
    const group = outcome.groups[0];
    expect(group.id).toBe(RECENT_GROUP_ID);
    expect(group.kind).toBe("recent");
    expect(group.label).toBe(RECENT_GROUP_LABEL);
    expect(group.results.map((r) => r.title)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
    ]);
    // Every score is zero: the order is a date, not a ranking.
    expect(group.results.every((r) => r.score === 0)).toBe(true);
    expect(outcome.query).toBe("");
    expect(outcome.status).toBe("ok");
    expect(outcome.totalCount).toBe(3);
  });

  it("does not group by entity type — one order, not ten", () => {
    const outcome = recentRecordsOutcome([
      record("t", "2026-08-04T00:00:00.000Z", { type: "task", title: "T" }),
      record("p", "2026-08-03T00:00:00.000Z", { type: "project", title: "P" }),
      record("t2", "2026-08-02T00:00:00.000Z", { type: "task", title: "T2" }),
    ]);
    expect(outcome.groups).toHaveLength(1);
    // The Task/Project/Task interleaving survives — grouping would reorder it.
    expect(outcome.groups[0].results.map((r) => r.title)).toEqual([
      "T",
      "P",
      "T2",
    ]);
  });

  it("is an honest, calm empty outcome for a workspace with no history", () => {
    const outcome = recentRecordsOutcome([]);
    expect(outcome.groups).toEqual([]);
    expect(outcome.totalCount).toBe(0);
    // Not an error: nothing went wrong, there is simply nothing yet.
    expect(outcome.status).toBe("ok");
  });

  it("survives the browser's own decoder unchanged", () => {
    /*
     * The client treats every response as untrusted and re-validates it. If the
     * `recent` group kind were not accepted there, the surface would show a
     * calm failure instead of the list — so this asserts the round trip rather
     * than the shape alone.
     */
    const outcome = recentRecordsOutcome([
      record("a", "2026-08-01T00:00:00.000Z", { title: "A" }),
      record("t", "2026-08-02T00:00:00.000Z", { type: "task", title: "T" }),
    ]);
    const decoded = decodeSearchOutcome(JSON.parse(JSON.stringify(outcome)));
    expect(decoded).not.toBeNull();
    expect(decoded?.groups[0].kind).toBe("recent");
    expect(decoded?.groups[0].results.map((r) => r.title)).toEqual(["T", "A"]);
  });
});
