import { beforeEach, describe, expect, it } from "vitest";

import {
  EntityNotFoundError,
  EntityValidationError,
  InvalidCursorError,
} from "~/kernel/entities";
import {
  FakeClock,
  countRows,
  makeRepository,
  resetEntities,
  sequentialIds,
} from "./support";

const WS_A = "ws_alpha";
const WS_B = "ws_beta";

describe("D1EntityRepository", () => {
  let clock: FakeClock;

  beforeEach(async () => {
    // Per-file storage isolation → clear rows for a deterministic empty table.
    await resetEntities();
    clock = new FakeClock("2026-07-17T00:00:00.000Z");
  });

  function repo() {
    return makeRepository({ clock: clock.now, idGenerator: sequentialIds() });
  }

  describe("create (scenarios 2, 3)", () => {
    it("persists an entity and returns the correct typed record", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "  Buy milk  ",
      });

      // Returned record is correct and title is trimmed.
      expect(created).toEqual({
        id: "id_0001",
        workspaceId: WS_A,
        type: "task",
        title: "Buy milk",
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
        updatedAt: new Date("2026-07-17T00:00:00.000Z"),
        deletedAt: null,
      });

      // And it is actually persisted.
      expect(await countRows()).toBe(1);
      const fetched = await r.getById(WS_A, "id_0001");
      expect(fetched).toEqual(created);
    });

    it("generates a unique secure id by default", async () => {
      const r = makeRepository({ clock: clock.now });
      const a = await r.create({ workspaceId: WS_A, type: "task", title: "A" });
      const b = await r.create({ workspaceId: WS_A, type: "task", title: "B" });
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("getById (scenarios 4, 5)", () => {
    it("returns the persisted entity", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "note",
        title: "A note",
      });
      expect(await r.getById(WS_A, created.id)).toEqual(created);
    });

    it("returns null for an unknown id", async () => {
      expect(await repo().getById(WS_A, "nope")).toBeNull();
    });

    it("does not leak an entity across workspaces", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "secret",
      });
      // Another workspace cannot retrieve it by id.
      expect(await r.getById(WS_B, created.id)).toBeNull();
    });
  });

  describe("update (scenarios 6, 7)", () => {
    it("changes the title and advances updatedAt", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Before",
      });

      clock.advance(60_000);
      const updated = await r.update(WS_A, created.id, { title: "  After  " });

      expect(updated.title).toBe("After");
      expect(updated.updatedAt).toEqual(new Date("2026-07-17T00:01:00.000Z"));
    });

    it("does not change identity or creation fields", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Before",
      });

      clock.advance(60_000);
      const updated = await r.update(WS_A, created.id, { title: "After" });

      expect(updated.id).toBe(created.id);
      expect(updated.workspaceId).toBe(created.workspaceId);
      expect(updated.type).toBe(created.type);
      expect(updated.createdAt).toEqual(created.createdAt);
    });

    it("throws EntityNotFoundError for an unknown id", async () => {
      await expect(repo().update(WS_A, "nope", { title: "x" })).rejects.toThrow(
        EntityNotFoundError,
      );
    });

    it("cannot update across workspaces", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "T",
      });
      await expect(
        r.update(WS_B, created.id, { title: "hijacked" }),
      ).rejects.toThrow(EntityNotFoundError);
    });

    it("rejects an invalid title without changing stored data", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Keep me",
      });
      await expect(
        r.update(WS_A, created.id, { title: "   " }),
      ).rejects.toThrow(EntityValidationError);
      expect((await r.getById(WS_A, created.id))?.title).toBe("Keep me");
    });
  });

  describe("soft delete, restore & get (scenarios 8, 9, 10, 12)", () => {
    it("soft delete sets deletedAt and advances updatedAt", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Doomed",
      });

      clock.advance(5_000);
      const result = await r.softDelete(WS_A, created.id);

      expect(result.outcome).toBe("deleted");
      expect(result.changed).toBe(true);
      expect(result.entity.deletedAt).toEqual(
        new Date("2026-07-17T00:00:05.000Z"),
      );
      expect(result.entity.updatedAt).toEqual(
        new Date("2026-07-17T00:00:05.000Z"),
      );
    });

    it("ordinary get excludes a deleted entity but explicit lookup retrieves it", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Hidden",
      });
      await r.softDelete(WS_A, created.id);

      expect(await r.getById(WS_A, created.id)).toBeNull();

      const withDeleted = await r.getById(WS_A, created.id, {
        includeDeleted: true,
      });
      expect(withDeleted?.id).toBe(created.id);
      expect(withDeleted?.deletedAt).not.toBeNull();
    });

    it("restore makes a deleted entity visible again", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Back",
      });
      await r.softDelete(WS_A, created.id);

      clock.advance(10_000);
      const result = await r.restore(WS_A, created.id);

      expect(result.outcome).toBe("restored");
      expect(result.changed).toBe(true);
      expect(result.entity.deletedAt).toBeNull();
      expect(result.entity.updatedAt).toEqual(
        new Date("2026-07-17T00:00:10.000Z"),
      );

      const fetched = await r.getById(WS_A, created.id);
      expect(fetched?.id).toBe(created.id);
    });

    it("cannot update a soft-deleted entity", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Gone",
      });
      await r.softDelete(WS_A, created.id);
      await expect(
        r.update(WS_A, created.id, { title: "revive?" }),
      ).rejects.toThrow(EntityNotFoundError);
    });

    it("distinguishes not-found from lifecycle no-ops", async () => {
      const r = repo();
      await expect(r.softDelete(WS_A, "nope")).rejects.toThrow(
        EntityNotFoundError,
      );
      await expect(r.restore(WS_A, "nope")).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe("repeated lifecycle operations (scenario 18)", () => {
    it("re-deleting is an idempotent no-op that does not churn timestamps", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "X",
      });

      clock.advance(1_000);
      const first = await r.softDelete(WS_A, created.id);
      expect(first.outcome).toBe("deleted");

      clock.advance(1_000);
      const second = await r.softDelete(WS_A, created.id);
      expect(second.outcome).toBe("already_deleted");
      expect(second.changed).toBe(false);
      // updatedAt/deletedAt unchanged from the first delete.
      expect(second.entity.updatedAt).toEqual(first.entity.updatedAt);
      expect(second.entity.deletedAt).toEqual(first.entity.deletedAt);
    });

    it("re-restoring a live entity is an idempotent no-op", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Y",
      });

      const result = await r.restore(WS_A, created.id);
      expect(result.outcome).toBe("already_active");
      expect(result.changed).toBe(false);
      expect(result.entity.updatedAt).toEqual(created.updatedAt);
    });

    it("supports delete → restore → delete cycles with defined outcomes", async () => {
      const r = repo();
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "Cycle",
      });

      clock.advance(1_000);
      expect((await r.softDelete(WS_A, created.id)).outcome).toBe("deleted");
      clock.advance(1_000);
      expect((await r.restore(WS_A, created.id)).outcome).toBe("restored");
      clock.advance(1_000);
      const redeleted = await r.softDelete(WS_A, created.id);
      expect(redeleted.outcome).toBe("deleted");
      expect(redeleted.changed).toBe(true);
      expect(await r.getById(WS_A, created.id)).toBeNull();
    });
  });

  describe("list — filtering & deletion (scenarios 11, 13)", () => {
    it("excludes deleted records by default and lists them when asked", async () => {
      const r = repo();
      const a = await r.create({ workspaceId: WS_A, type: "task", title: "A" });
      await r.create({ workspaceId: WS_A, type: "task", title: "B" });
      await r.softDelete(WS_A, a.id);

      const active = await r.list({ workspaceId: WS_A });
      expect(active.items.map((e) => e.title)).toEqual(["B"]);

      const all = await r.list({ workspaceId: WS_A, includeDeleted: true });
      expect(all.items).toHaveLength(2);
    });

    it("filters by type", async () => {
      const r = repo();
      await r.create({ workspaceId: WS_A, type: "task", title: "T1" });
      await r.create({ workspaceId: WS_A, type: "note", title: "N1" });
      await r.create({ workspaceId: WS_A, type: "task", title: "T2" });

      const tasks = await r.list({ workspaceId: WS_A, type: "task" });
      expect(tasks.items.map((e) => e.title)).toEqual(["T1", "T2"]);
      expect(tasks.items.every((e) => e.type === "task")).toBe(true);
    });

    it("scopes lists to the workspace", async () => {
      const r = repo();
      await r.create({ workspaceId: WS_A, type: "task", title: "mine" });
      await r.create({ workspaceId: WS_B, type: "task", title: "theirs" });

      const listB = await r.list({ workspaceId: WS_B });
      expect(listB.items.map((e) => e.title)).toEqual(["theirs"]);
    });

    it("returns an empty, bounded page when there is nothing", async () => {
      const page = await repo().list({ workspaceId: WS_A });
      expect(page.items).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("list — pagination (scenarios 14, 15)", () => {
    async function seed(count: number) {
      const r = repo();
      for (let i = 0; i < count; i++) {
        // Distinct timestamps for most; a deliberate tie tested separately.
        clock.advance(1_000);
        await r.create({
          workspaceId: WS_A,
          type: "task",
          title: `T${String(i).padStart(2, "0")}`,
        });
      }
      return r;
    }

    it("is deterministic and bounded by the page size", async () => {
      const r = await seed(5);
      const first = await r.list({ workspaceId: WS_A, limit: 2 });
      expect(first.items.map((e) => e.title)).toEqual(["T00", "T01"]);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      // Same query again → identical result (deterministic ordering).
      const firstAgain = await r.list({ workspaceId: WS_A, limit: 2 });
      expect(firstAgain.items.map((e) => e.id)).toEqual(
        first.items.map((e) => e.id),
      );
    });

    it("walks every record exactly once across pages (no dupes, no skips)", async () => {
      const total = 23;
      const r = await seed(total);

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await r.list({ workspaceId: WS_A, limit: 5, cursor });
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
        expect(pages).toBeLessThanOrEqual(total + 1); // guard against infinite loop
      } while (cursor);

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total); // no duplicates
      // Ordered by creation.
      const titlesInOrder = Array.from(
        { length: total },
        (_, i) => `T${String(i).padStart(2, "0")}`,
      );
      const seenTitles = await Promise.all(
        seen.map(async (id) => (await r.getById(WS_A, id))?.title),
      );
      expect(seenTitles).toEqual(titlesInOrder);
    });

    it("paginates deterministically even when createdAt ties (id tiebreaker)", async () => {
      // All rows share the SAME createdAt; only the id breaks the tie.
      const r = makeRepository({
        clock: clock.now,
        idGenerator: sequentialIds(),
      });
      for (let i = 0; i < 6; i++) {
        await r.create({
          workspaceId: WS_A,
          type: "task",
          title: `S${i}`,
        });
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await r.list({ workspaceId: WS_A, limit: 2, cursor });
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toEqual([
        "id_0001",
        "id_0002",
        "id_0003",
        "id_0004",
        "id_0005",
        "id_0006",
      ]);
    });

    it("rejects an invalid cursor", async () => {
      await expect(
        repo().list({ workspaceId: WS_A, cursor: "not-a-real-cursor!!" }),
      ).rejects.toThrow(InvalidCursorError);
    });
  });

  describe("validation & injection safety (scenarios 16, 17)", () => {
    it("rejects invalid inputs without writing any data", async () => {
      const r = repo();
      await expect(
        r.create({ workspaceId: "", type: "task", title: "x" }),
      ).rejects.toThrow(EntityValidationError);
      await expect(
        r.create({ workspaceId: WS_A, type: "Bad Type!", title: "x" }),
      ).rejects.toThrow(EntityValidationError);
      await expect(
        r.create({ workspaceId: WS_A, type: "task", title: "   " }),
      ).rejects.toThrow(EntityValidationError);

      expect(await countRows()).toBe(0);
    });

    it("rejects empty ids on reads and lifecycle ops", async () => {
      const r = repo();
      await expect(r.getById(WS_A, "")).rejects.toThrow(EntityValidationError);
      await expect(r.softDelete("", "id")).rejects.toThrow(
        EntityValidationError,
      );
    });

    it("stores SQL-like and special-character titles safely as ordinary values", async () => {
      const r = repo();
      const nasty = 'Robert\'); DROP TABLE entities;-- 😀 "quotes" \\ %_';
      const created = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: nasty,
      });

      // Stored verbatim (bound parameter, never interpolated).
      expect((await r.getById(WS_A, created.id))?.title).toBe(nasty);
      // The table is unharmed by the injection attempt.
      expect(await countRows()).toBe(1);
      const stillThere = await r.create({
        workspaceId: WS_A,
        type: "task",
        title: "second",
      });
      expect(stillThere.title).toBe("second");
    });
  });
});
