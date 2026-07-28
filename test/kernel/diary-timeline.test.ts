import { beforeEach, describe, expect, it } from "vitest";

import { InvalidDiaryCursorError, groupEntriesByDay } from "~/kernel/diary";

import {
  FakeClock,
  makeContext,
  makeDiaryRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_diary_timeline_other";

/**
 * Seed entries at controlled `occurredAt` instants. Ids are sequential so the
 * `(occurredAt, id)` tiebreaker is deterministic.
 */
function repoFor(ws: string, prefix: string) {
  return makeDiaryRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-24T00:00:00.000Z").now,
    idGenerator: sequentialIds(prefix),
  });
}

async function seed(
  ws: string,
  prefix: string,
  specs: { type: string; at: string }[],
) {
  const repo = repoFor(ws, prefix);
  for (const spec of specs) {
    await repo.create({
      entryType: spec.type,
      title: `${spec.type} @ ${spec.at}`,
      occurredAt: new Date(spec.at),
    });
  }
  return repo;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Timeline ordering", () => {
  it("lists newest-first by occurredAt by default", async () => {
    const repo = await seed(WS, "n", [
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-22T10:00:00.000Z" },
      { type: "note", at: "2026-07-21T10:00:00.000Z" },
    ]);
    const page = await repo.list();
    expect(page.items.map((e) => e.occurredAt.toISOString())).toEqual([
      "2026-07-22T10:00:00.000Z",
      "2026-07-21T10:00:00.000Z",
      "2026-07-20T10:00:00.000Z",
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("lists oldest-first when asked", async () => {
    const repo = await seed(WS, "o", [
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-22T10:00:00.000Z" },
    ]);
    const page = await repo.list({ order: "oldest" });
    expect(page.items.map((e) => e.occurredAt.toISOString())).toEqual([
      "2026-07-20T10:00:00.000Z",
      "2026-07-22T10:00:00.000Z",
    ]);
  });
});

describe("Bounded cursor pagination", () => {
  it("paginates deterministically with a stable (occurredAt, id) tiebreaker", async () => {
    // Three entries sharing ONE occurredAt exercise the id tiebreaker.
    const repo = await seed(WS, "p", [
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-19T10:00:00.000Z" },
    ]);

    const first = await repo.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await repo.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(false);

    const allIds = [...first.items, ...second.items].map((e) => e.id);
    expect(new Set(allIds).size).toBe(4); // no duplicates, no gaps
  });

  it("rejects a cursor from a different query scope", async () => {
    const repo = await seed(WS, "c", [
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "meeting", at: "2026-07-19T10:00:00.000Z" },
    ]);
    const page = await repo.list({ limit: 1 });
    // Same cursor, but replayed under a different order → rejected.
    await expect(
      repo.list({ limit: 1, order: "oldest", cursor: page.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidDiaryCursorError);
  });
});

describe("Filtering hooks", () => {
  it("filters by entry type (any-of)", async () => {
    const repo = await seed(WS, "f", [
      { type: "meeting", at: "2026-07-22T10:00:00.000Z" },
      { type: "note", at: "2026-07-21T10:00:00.000Z" },
      { type: "decision", at: "2026-07-20T10:00:00.000Z" },
    ]);
    const page = await repo.list({ entryTypes: ["meeting", "decision"] });
    expect(page.items.map((e) => e.entryType).sort()).toEqual([
      "decision",
      "meeting",
    ]);
  });

  it("filters by an occurred-at range (inclusive bounds)", async () => {
    const repo = await seed(WS, "r", [
      { type: "note", at: "2026-07-18T10:00:00.000Z" },
      { type: "note", at: "2026-07-20T10:00:00.000Z" },
      { type: "note", at: "2026-07-22T10:00:00.000Z" },
    ]);
    const page = await repo.list({
      occurredFrom: new Date("2026-07-19T00:00:00.000Z"),
      occurredTo: new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(page.items.map((e) => e.occurredAt.toISOString())).toEqual([
      "2026-07-20T10:00:00.000Z",
    ]);
  });

  it("excludes soft-deleted entries unless includeDeleted is set", async () => {
    const repo = repoFor(WS, "d");
    const kept = await repo.create({
      entryType: "note",
      title: "kept",
      occurredAt: new Date("2026-07-20T10:00:00.000Z"),
    });
    const gone = await repo.create({
      entryType: "note",
      title: "gone",
      occurredAt: new Date("2026-07-21T10:00:00.000Z"),
    });
    // Soft-delete via the generic entity repository (header lifecycle).
    await makeRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("x"),
    }).softDelete(gone.id);

    const visible = await repo.list();
    expect(visible.items.map((e) => e.id)).toEqual([kept.id]);

    const all = await repo.list({ includeDeleted: true });
    expect(all.items.map((e) => e.id).sort()).toEqual(
      [kept.id, gone.id].sort(),
    );
  });
});

describe("Workspace isolation", () => {
  it("never returns another workspace’s entries", async () => {
    await seed(WS, "a", [{ type: "note", at: "2026-07-20T10:00:00.000Z" }]);
    await seed(OTHER, "b", [{ type: "note", at: "2026-07-20T10:00:00.000Z" }]);
    const page = await repoFor(WS, "z").list();
    expect(page.items).toHaveLength(1);
    for (const entry of page.items) {
      expect(entry.workspaceId).toBe(WS);
    }
  });
});

describe("Day grouping composes with a Timeline page", () => {
  it("groups a returned page into contiguous UTC-day groups", async () => {
    const repo = await seed(WS, "g", [
      { type: "note", at: "2026-07-20T18:00:00.000Z" },
      { type: "note", at: "2026-07-20T09:00:00.000Z" },
      { type: "note", at: "2026-07-19T22:00:00.000Z" },
    ]);
    const page = await repo.list();
    const groups = groupEntriesByDay(page.items, "UTC");
    expect(groups.map((g) => g.day)).toEqual(["2026-07-20", "2026-07-19"]);
    expect(groups[0]!.entries).toHaveLength(2);
  });
});
