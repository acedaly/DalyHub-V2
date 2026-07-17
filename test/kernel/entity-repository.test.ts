import { beforeEach, describe, expect, it } from "vitest";

import {
  EntityNotFoundError,
  EntityValidationError,
  InvalidCursorError,
} from "~/kernel/entities";
import {
  FakeClock,
  countRows,
  makeContext,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS_A = "ws_alpha";
const WS_B = "ws_beta";
const CTX_A = makeContext(WS_A);
const CTX_B = makeContext(WS_B);

describe("D1EntityRepository (workspace-scoped)", () => {
  let clock: FakeClock;
  let rA: ReturnType<typeof makeRepository>;
  let rB: ReturnType<typeof makeRepository>;

  beforeEach(async () => {
    // Per-file storage isolation → clear rows for a deterministic empty table,
    // then re-create both workspaces so the FK is satisfiable.
    await resetTables([WS_A, WS_B]);
    clock = new FakeClock("2026-07-17T00:00:00.000Z");
    // One repository instance per workspace per test, each with its own
    // monotonic id generator so repeated create() calls never collide.
    rA = makeRepository(CTX_A, {
      clock: clock.now,
      idGenerator: sequentialIds(),
    });
    rB = makeRepository(CTX_B, {
      clock: clock.now,
      idGenerator: sequentialIds("idb"),
    });
  });

  /** The workspace-A repository for this test (stable id sequence). */
  function repoA() {
    return rA;
  }

  /** The workspace-B repository for this test (stable id sequence). */
  function repoB() {
    return rB;
  }

  describe("create (scenarios 1, 2)", () => {
    it("persists an entity and returns the correct typed record", async () => {
      const r = repoA();
      const created = await r.create({
        type: "task",
        title: "  Buy milk  ",
      });

      // Returned record is correct, title is trimmed, workspace is the bound one.
      expect(created).toEqual({
        id: "id_0001",
        workspaceId: WS_A,
        type: "task",
        title: "Buy milk",
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
        updatedAt: new Date("2026-07-17T00:00:00.000Z"),
        deletedAt: null,
      });

      // And it is actually persisted and retrievable in this workspace.
      expect(await countRows()).toBe(1);
      expect(await r.getById("id_0001")).toEqual(created);
    });

    it("always assigns the repository's bound workspace, never another", async () => {
      const created = await repoA().create({ type: "task", title: "mine" });
      expect(created.workspaceId).toBe(WS_A);
    });

    it("create input cannot specify another workspace", async () => {
      const r = repoA();
      // The create contract has no `workspaceId` field: supplying one is a type
      // error. At runtime the stray property is ignored and the bound workspace
      // is used — an attacker-supplied field can never redirect the scope.
      const created = await r.create({
        type: "task",
        title: "hijack?",
        // @ts-expect-error workspaceId is not part of the create contract
        workspaceId: WS_B,
      });
      expect(created.workspaceId).toBe(WS_A);
      // Nothing landed in workspace B.
      expect(await repoB().list()).toMatchObject({ items: [] });
    });

    it("generates a unique secure id by default", async () => {
      const r = makeRepository(CTX_A, { clock: clock.now });
      const a = await r.create({ type: "task", title: "A" });
      const b = await r.create({ type: "task", title: "B" });
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("getById & cross-workspace isolation (scenarios 3, 15)", () => {
    it("returns the persisted entity within its workspace", async () => {
      const r = repoA();
      const created = await r.create({ type: "note", title: "A note" });
      expect(await r.getById(created.id)).toEqual(created);
    });

    it("returns null for an unknown id", async () => {
      expect(await repoA().getById("nope")).toBeNull();
    });

    it("workspace A cannot retrieve workspace B's entity (no existence disclosure)", async () => {
      const created = await repoA().create({ type: "task", title: "secret" });
      // Workspace B sees exactly what it would see for a non-existent id: null.
      // There is no signal that the entity exists elsewhere.
      expect(await repoB().getById(created.id)).toBeNull();
      expect(
        await repoB().getById(created.id, { includeDeleted: true }),
      ).toBeNull();
    });
  });

  describe("update & cross-workspace isolation (scenarios 4, 6, 7)", () => {
    it("changes the title and advances updatedAt", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Before" });

      clock.advance(60_000);
      const updated = await r.update(created.id, { title: "  After  " });

      expect(updated.title).toBe("After");
      expect(updated.updatedAt).toEqual(new Date("2026-07-17T00:01:00.000Z"));
    });

    it("does not change identity or creation fields", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Before" });

      clock.advance(60_000);
      const updated = await r.update(created.id, { title: "After" });

      expect(updated.id).toBe(created.id);
      expect(updated.workspaceId).toBe(created.workspaceId);
      expect(updated.type).toBe(created.type);
      expect(updated.createdAt).toEqual(created.createdAt);
    });

    it("throws EntityNotFoundError for an unknown id", async () => {
      await expect(repoA().update("nope", { title: "x" })).rejects.toThrow(
        EntityNotFoundError,
      );
    });

    it("workspace A cannot update workspace B's entity", async () => {
      const created = await repoB().create({ type: "task", title: "T" });
      // Same generic not-found the caller would get for a truly missing id.
      await expect(
        repoA().update(created.id, { title: "hijacked" }),
      ).rejects.toThrow(EntityNotFoundError);
      // B's record is untouched.
      expect((await repoB().getById(created.id))?.title).toBe("T");
    });

    it("rejects an invalid title without changing stored data", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Keep me" });
      await expect(r.update(created.id, { title: "   " })).rejects.toThrow(
        EntityValidationError,
      );
      expect((await r.getById(created.id))?.title).toBe("Keep me");
    });
  });

  describe("soft delete, restore & get (scenarios 5)", () => {
    it("soft delete sets deletedAt and advances updatedAt", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Doomed" });

      clock.advance(5_000);
      const result = await r.softDelete(created.id);

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
      const r = repoA();
      const created = await r.create({ type: "task", title: "Hidden" });
      await r.softDelete(created.id);

      expect(await r.getById(created.id)).toBeNull();

      const withDeleted = await r.getById(created.id, { includeDeleted: true });
      expect(withDeleted?.id).toBe(created.id);
      expect(withDeleted?.deletedAt).not.toBeNull();
    });

    it("restore makes a deleted entity visible again", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Back" });
      await r.softDelete(created.id);

      clock.advance(10_000);
      const result = await r.restore(created.id);

      expect(result.outcome).toBe("restored");
      expect(result.changed).toBe(true);
      expect(result.entity.deletedAt).toBeNull();
      expect(result.entity.updatedAt).toEqual(
        new Date("2026-07-17T00:00:10.000Z"),
      );

      expect((await r.getById(created.id))?.id).toBe(created.id);
    });

    it("cannot update a soft-deleted entity", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Gone" });
      await r.softDelete(created.id);
      await expect(r.update(created.id, { title: "revive?" })).rejects.toThrow(
        EntityNotFoundError,
      );
    });

    it("distinguishes not-found from lifecycle no-ops", async () => {
      const r = repoA();
      await expect(r.softDelete("nope")).rejects.toThrow(EntityNotFoundError);
      await expect(r.restore("nope")).rejects.toThrow(EntityNotFoundError);
    });

    it("workspace A cannot soft-delete or restore workspace B's entity", async () => {
      const created = await repoB().create({ type: "task", title: "theirs" });
      await expect(repoA().softDelete(created.id)).rejects.toThrow(
        EntityNotFoundError,
      );

      // Delete it legitimately in B, then A must not be able to restore it.
      await repoB().softDelete(created.id);
      await expect(repoA().restore(created.id)).rejects.toThrow(
        EntityNotFoundError,
      );
      // B can still restore its own record.
      expect((await repoB().restore(created.id)).outcome).toBe("restored");
    });
  });

  describe("repeated lifecycle operations", () => {
    it("re-deleting is an idempotent no-op that does not churn timestamps", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "X" });

      clock.advance(1_000);
      const first = await r.softDelete(created.id);
      expect(first.outcome).toBe("deleted");

      clock.advance(1_000);
      const second = await r.softDelete(created.id);
      expect(second.outcome).toBe("already_deleted");
      expect(second.changed).toBe(false);
      expect(second.entity.updatedAt).toEqual(first.entity.updatedAt);
      expect(second.entity.deletedAt).toEqual(first.entity.deletedAt);
    });

    it("re-restoring a live entity is an idempotent no-op", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Y" });

      const result = await r.restore(created.id);
      expect(result.outcome).toBe("already_active");
      expect(result.changed).toBe(false);
      expect(result.entity.updatedAt).toEqual(created.updatedAt);
    });

    it("supports delete → restore → delete cycles with defined outcomes", async () => {
      const r = repoA();
      const created = await r.create({ type: "task", title: "Cycle" });

      clock.advance(1_000);
      expect((await r.softDelete(created.id)).outcome).toBe("deleted");
      clock.advance(1_000);
      expect((await r.restore(created.id)).outcome).toBe("restored");
      clock.advance(1_000);
      const redeleted = await r.softDelete(created.id);
      expect(redeleted.outcome).toBe("deleted");
      expect(redeleted.changed).toBe(true);
      expect(await r.getById(created.id)).toBeNull();
    });
  });

  describe("list — filtering, deletion & scoping (scenarios 7, 8, 9)", () => {
    it("excludes deleted records by default and lists them when asked (scoped)", async () => {
      const r = repoA();
      const a = await r.create({ type: "task", title: "A" });
      await r.create({ type: "task", title: "B" });
      await r.softDelete(a.id);

      const active = await r.list();
      expect(active.items.map((e) => e.title)).toEqual(["B"]);

      const all = await r.list({ includeDeleted: true });
      expect(all.items).toHaveLength(2);
    });

    it("filters by type (scoped)", async () => {
      const r = repoA();
      await r.create({ type: "task", title: "T1" });
      await r.create({ type: "note", title: "N1" });
      await r.create({ type: "task", title: "T2" });

      const tasks = await r.list({ type: "task" });
      expect(tasks.items.map((e) => e.title)).toEqual(["T1", "T2"]);
      expect(tasks.items.every((e) => e.type === "task")).toBe(true);
    });

    it("a workspace list never returns another workspace's records", async () => {
      await repoA().create({ type: "task", title: "mine" });
      await repoB().create({ type: "task", title: "theirs" });

      const listA = await repoA().list();
      expect(listA.items.map((e) => e.title)).toEqual(["mine"]);
      expect(listA.items.every((e) => e.workspaceId === WS_A)).toBe(true);

      const listB = await repoB().list();
      expect(listB.items.map((e) => e.title)).toEqual(["theirs"]);

      // include-deleted stays scoped too.
      const a = await repoA().create({ type: "task", title: "mine2" });
      await repoA().softDelete(a.id);
      const allB = await repoB().list({ includeDeleted: true });
      expect(allB.items.map((e) => e.title)).toEqual(["theirs"]);
    });

    it("returns an empty, bounded page when there is nothing", async () => {
      const page = await repoA().list();
      expect(page.items).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("list — pagination (scenario 10)", () => {
    async function seed(count: number) {
      const r = repoA();
      for (let i = 0; i < count; i++) {
        clock.advance(1_000);
        await r.create({
          type: "task",
          title: `T${String(i).padStart(2, "0")}`,
        });
      }
      return r;
    }

    it("is deterministic and bounded by the page size", async () => {
      const r = await seed(5);
      const first = await r.list({ limit: 2 });
      expect(first.items.map((e) => e.title)).toEqual(["T00", "T01"]);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      const firstAgain = await r.list({ limit: 2 });
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
        const page = await r.list({ limit: 5, cursor });
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
        expect(pages).toBeLessThanOrEqual(total + 1);
      } while (cursor);

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
      const titlesInOrder = Array.from(
        { length: total },
        (_, i) => `T${String(i).padStart(2, "0")}`,
      );
      const seenTitles = await Promise.all(
        seen.map(async (id) => (await r.getById(id))?.title),
      );
      expect(seenTitles).toEqual(titlesInOrder);
    });

    it("paginates deterministically even when createdAt ties (id tiebreaker)", async () => {
      const r = makeRepository(CTX_A, {
        clock: clock.now,
        idGenerator: sequentialIds(),
      });
      for (let i = 0; i < 6; i++) {
        await r.create({ type: "task", title: `S${i}` });
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await r.list({ limit: 2, cursor });
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

    it("rejects a malformed cursor", async () => {
      await expect(
        repoA().list({ cursor: "not-a-real-cursor!!" }),
      ).rejects.toThrow(InvalidCursorError);
    });
  });

  describe("cursor scope binding (scenarios 11, 12, 13)", () => {
    async function seedFor(
      repo: ReturnType<typeof repoA>,
      count: number,
      type = "task",
    ) {
      for (let i = 0; i < count; i++) {
        clock.advance(1_000);
        await repo.create({ type, title: `${type}${i}` });
      }
    }

    it("rejects a workspace-A cursor when replayed in workspace B", async () => {
      const a = repoA();
      await seedFor(a, 3);
      const pageA = await a.list({ limit: 1 });
      expect(pageA.nextCursor).not.toBeNull();

      // B has its own data; A's cursor must not be honoured here.
      await seedFor(repoB(), 3);
      await expect(
        repoB().list({ limit: 1, cursor: pageA.nextCursor! }),
      ).rejects.toThrow(InvalidCursorError);
    });

    it("rejects a cursor generated under a different type filter", async () => {
      const a = repoA();
      await seedFor(a, 2, "task");
      await seedFor(a, 2, "note");

      const taskPage = await a.list({ type: "task", limit: 1 });
      expect(taskPage.nextCursor).not.toBeNull();

      // Same workspace, different type filter → rejected.
      await expect(
        a.list({ type: "note", cursor: taskPage.nextCursor! }),
      ).rejects.toThrow(InvalidCursorError);
      // And the unfiltered listing also rejects it (filter shape differs).
      await expect(a.list({ cursor: taskPage.nextCursor! })).rejects.toThrow(
        InvalidCursorError,
      );
    });

    it("rejects a deleted-mode-mismatched cursor", async () => {
      const a = repoA();
      await seedFor(a, 3);
      const inclPage = await a.list({ includeDeleted: true, limit: 1 });
      expect(inclPage.nextCursor).not.toBeNull();

      // A cursor generated with includeDeleted:true is not accepted by the
      // default active-only query.
      await expect(a.list({ cursor: inclPage.nextCursor! })).rejects.toThrow(
        InvalidCursorError,
      );
    });

    it("accepts a cursor replayed under its own exact scope", async () => {
      const a = repoA();
      await seedFor(a, 3, "task");
      const first = await a.list({ type: "task", limit: 1 });
      const second = await a.list({
        type: "task",
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    });
  });

  describe("validation & injection safety", () => {
    it("rejects invalid inputs without writing any data", async () => {
      const r = repoA();
      await expect(r.create({ type: "Bad Type!", title: "x" })).rejects.toThrow(
        EntityValidationError,
      );
      await expect(r.create({ type: "task", title: "   " })).rejects.toThrow(
        EntityValidationError,
      );

      expect(await countRows()).toBe(0);
    });

    it("rejects empty ids on reads and lifecycle ops", async () => {
      const r = repoA();
      await expect(r.getById("")).rejects.toThrow(EntityValidationError);
      await expect(r.softDelete("")).rejects.toThrow(EntityValidationError);
    });

    it("stores SQL-like and special-character titles safely as ordinary values", async () => {
      const r = repoA();
      const nasty = 'Robert\'); DROP TABLE entities;-- 😀 "quotes" \\ %_';
      const created = await r.create({ type: "task", title: nasty });

      expect((await r.getById(created.id))?.title).toBe(nasty);
      expect(await countRows()).toBe(1);
      const stillThere = await r.create({ type: "task", title: "second" });
      expect(stillThere.title).toBe("second");
    });
  });
});
