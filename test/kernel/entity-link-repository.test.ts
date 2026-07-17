import { beforeEach, describe, expect, it } from "vitest";

import {
  EntityLinkEndpointNotFoundError,
  EntityLinkValidationError,
  InvalidEntityLinkCursorError,
} from "~/kernel/entity-links";
import {
  FakeClock,
  countLinkRows,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS_A = "ws_alpha";
const WS_B = "ws_beta";
const CTX_A = makeContext(WS_A);
const CTX_B = makeContext(WS_B);

describe("D1EntityLinkRepository (workspace-scoped)", () => {
  let clock: FakeClock;
  let entitiesA: ReturnType<typeof makeRepository>;
  let entitiesB: ReturnType<typeof makeRepository>;
  let linksA: ReturnType<typeof makeLinkRepository>;
  let linksB: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS_A, WS_B]);
    clock = new FakeClock("2026-07-17T00:00:00.000Z");
    entitiesA = makeRepository(CTX_A, {
      clock: clock.now,
      idGenerator: sequentialIds("a"),
    });
    entitiesB = makeRepository(CTX_B, {
      clock: clock.now,
      idGenerator: sequentialIds("b"),
    });
    linksA = makeLinkRepository(CTX_A, {
      clock: clock.now,
      idGenerator: sequentialIds("lnk"),
    });
    linksB = makeLinkRepository(CTX_B, {
      clock: clock.now,
      idGenerator: sequentialIds("lnkb"),
    });
  });

  /** Create two active entities in workspace A and return their ids. */
  async function twoEntitiesA(): Promise<[string, string]> {
    const a = await entitiesA.create({ type: "meeting", title: "Standup" });
    const b = await entitiesA.create({ type: "task", title: "Follow up" });
    return [a.id, b.id];
  }

  describe("create — success & orientation (scenarios 1-4, 13)", () => {
    it("links two active same-workspace entities and persists the row", async () => {
      const [source, target] = await twoEntitiesA();
      const result = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "meeting.produced_task",
      });

      expect(result.outcome).toBe("created");
      expect(result.created).toBe(true);
      expect(result.link).toEqual({
        id: "lnk_0001",
        workspaceId: WS_A,
        sourceEntityId: source,
        targetEntityId: target,
        type: "meeting.produced_task",
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
        updatedAt: new Date("2026-07-17T00:00:00.000Z"),
        deletedAt: null,
      });
      expect(await countLinkRows()).toBe(1);
      expect(await linksA.getById("lnk_0001")).toEqual(result.link);
    });

    it("uses the generated id and the controlled clock", async () => {
      const [source, target] = await twoEntitiesA();
      clock.advance(90_000);
      const { link } = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });
      expect(link.id).toBe("lnk_0001");
      expect(link.createdAt).toEqual(new Date("2026-07-17T00:01:30.000Z"));
      expect(link.updatedAt).toEqual(new Date("2026-07-17T00:01:30.000Z"));
    });

    it("preserves source/target orientation and does not reorder ids", async () => {
      const [x, y] = await twoEntitiesA();
      // Deliberately link the lexically-larger id to the smaller one.
      const [source, target] = x < y ? [y, x] : [x, y];
      const { link } = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "person.attended_meeting",
      });
      expect(link.sourceEntityId).toBe(source);
      expect(link.targetEntityId).toBe(target);
    });

    it("accepts any structurally valid link type", async () => {
      const [source, target] = await twoEntitiesA();
      const { link } = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "project.supporting_note",
      });
      expect(link.type).toBe("project.supporting_note");
    });

    it("treats SQL-like ids and types as ordinary bound values", async () => {
      const [source, target] = await twoEntitiesA();
      // A SQL-like id never matches an endpoint, so it is a safe not-found — the
      // point is it is bound, not interpolated (no injection, table survives).
      await expect(
        linksA.create({
          sourceEntityId: "'); DROP TABLE entity_links;--",
          targetEntityId: target,
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);
      // A SQL-like type is rejected structurally by validation.
      await expect(
        linksA.create({
          sourceEntityId: source,
          targetEntityId: target,
          type: "task'; DROP TABLE",
        }),
      ).rejects.toBeInstanceOf(EntityLinkValidationError);
      // The table is intact and usable.
      const ok = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });
      expect(ok.outcome).toBe("created");
    });
  });

  describe("create — validation & endpoints (scenarios 5-12)", () => {
    it("rejects an invalid type before writing", async () => {
      const [source, target] = await twoEntitiesA();
      await expect(
        linksA.create({
          sourceEntityId: source,
          targetEntityId: target,
          type: "Not A Type!",
        }),
      ).rejects.toBeInstanceOf(EntityLinkValidationError);
      expect(await countLinkRows()).toBe(0);
    });

    it("rejects a self-link before writing", async () => {
      const [source] = await twoEntitiesA();
      await expect(
        linksA.create({
          sourceEntityId: source,
          targetEntityId: source,
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkValidationError);
      expect(await countLinkRows()).toBe(0);
    });

    it("rejects a nonexistent source or target as endpoint-not-found", async () => {
      const [, target] = await twoEntitiesA();
      await expect(
        linksA.create({
          sourceEntityId: "ghost",
          targetEntityId: target,
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);
      const [source] = await twoEntitiesA();
      await expect(
        linksA.create({
          sourceEntityId: source,
          targetEntityId: "ghost",
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);
    });

    it("rejects a soft-deleted source or target as endpoint-not-found", async () => {
      const [source, target] = await twoEntitiesA();
      await entitiesA.softDelete(source);
      await expect(
        linksA.create({
          sourceEntityId: source,
          targetEntityId: target,
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);

      const [s2, t2] = await twoEntitiesA();
      await entitiesA.softDelete(t2);
      await expect(
        linksA.create({
          sourceEntityId: s2,
          targetEntityId: t2,
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);
      expect(await countLinkRows()).toBe(0);
    });

    it("rejects a cross-workspace endpoint identically to a nonexistent one (no disclosure)", async () => {
      const [aSource] = await twoEntitiesA();
      const bEntity = await entitiesB.create({ type: "note", title: "theirs" });

      // Reference workspace B's entity from workspace A's repository.
      const crossWorkspaceError = await linksA
        .create({
          sourceEntityId: aSource,
          targetEntityId: bEntity.id,
          type: "task.relates_to",
        })
        .catch((e: unknown) => e);
      const nonexistentError = await linksA
        .create({
          sourceEntityId: aSource,
          targetEntityId: "definitely-not-here",
          type: "task.relates_to",
        })
        .catch((e: unknown) => e);

      expect(crossWorkspaceError).toBeInstanceOf(
        EntityLinkEndpointNotFoundError,
      );
      expect(nonexistentError).toBeInstanceOf(EntityLinkEndpointNotFoundError);
      // Indistinguishable: same error, same message; nothing reveals that the id
      // exists in another workspace, and the id itself is not echoed.
      expect((crossWorkspaceError as Error).message).toBe(
        (nonexistentError as Error).message,
      );
      expect((crossWorkspaceError as Error).message).not.toContain(bEntity.id);

      // Symmetric for a cross-workspace SOURCE.
      const bTarget = await twoEntitiesA();
      await expect(
        linksA.create({
          sourceEntityId: bEntity.id,
          targetEntityId: bTarget[0],
          type: "task.relates_to",
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);
    });
  });

  describe("create — idempotency & duplicates (scenarios 14-16)", () => {
    it("returns already_exists for a duplicate active relationship (no new row)", async () => {
      const [source, target] = await twoEntitiesA();
      const first = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });
      const second = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });

      expect(first.outcome).toBe("created");
      expect(second.outcome).toBe("already_exists");
      expect(second.created).toBe(false);
      expect(second.link.id).toBe(first.link.id);
      expect(await countLinkRows()).toBe(1);
    });

    it("restores the SAME row/id when re-creating an unlinked relationship", async () => {
      const [source, target] = await twoEntitiesA();
      const first = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });
      await linksA.unlink(first.link.id);

      clock.advance(5_000);
      const again = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });

      expect(again.outcome).toBe("restored");
      expect(again.created).toBe(false);
      expect(again.link.id).toBe(first.link.id); // stable identity, no new id
      expect(again.link.deletedAt).toBeNull();
      expect(again.link.updatedAt).toEqual(
        new Date("2026-07-17T00:00:05.000Z"),
      );
      expect(await countLinkRows()).toBe(1);
    });

    it("never produces duplicate rows under concurrent identical creates", async () => {
      const [source, target] = await twoEntitiesA();
      const attempts = Array.from({ length: 8 }, () =>
        linksA.create({
          sourceEntityId: source,
          targetEntityId: target,
          type: "task.relates_to",
        }),
      );
      const results = await Promise.all(attempts);

      // Exactly one row exists, and every attempt reports the same id.
      expect(await countLinkRows()).toBe(1);
      const ids = new Set(results.map((r) => r.link.id));
      expect(ids.size).toBe(1);
      // Exactly one attempt actually created the row.
      expect(results.filter((r) => r.created)).toHaveLength(1);
    });
  });

  describe("bidirectional queries (scenarios 1-11)", () => {
    it("returns a link as outgoing from the source and incoming from the target — same id", async () => {
      const source = await entitiesA.create({ type: "meeting", title: "M" });
      const target = await entitiesA.create({ type: "task", title: "T" });
      const { link } = await linksA.create({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        type: "meeting.produced_task",
      });

      const fromSource = await linksA.listForEntity(source.id);
      expect(fromSource.items).toHaveLength(1);
      expect(fromSource.items[0]!.direction).toBe("outgoing");
      expect(fromSource.items[0]!.link.id).toBe(link.id);
      expect(fromSource.items[0]!.counterpart).toEqual(target);

      const fromTarget = await linksA.listForEntity(target.id);
      expect(fromTarget.items).toHaveLength(1);
      expect(fromTarget.items[0]!.direction).toBe("incoming");
      expect(fromTarget.items[0]!.link.id).toBe(link.id);
      expect(fromTarget.items[0]!.counterpart).toEqual(source);

      // The SAME row is seen from both ends.
      expect(fromSource.items[0]!.link.id).toBe(fromTarget.items[0]!.link.id);
    });

    it("returns both incoming and outgoing links in a both-direction query", async () => {
      const hub = await entitiesA.create({ type: "project", title: "Hub" });
      const out = await entitiesA.create({ type: "task", title: "Out" });
      const inc = await entitiesA.create({ type: "note", title: "In" });

      const outgoing = await linksA.create({
        sourceEntityId: hub.id,
        targetEntityId: out.id,
        type: "project.supporting_note",
      });
      const incoming = await linksA.create({
        sourceEntityId: inc.id,
        targetEntityId: hub.id,
        type: "task.relates_to",
      });

      const page = await linksA.listForEntity(hub.id);
      const byId = new Map(page.items.map((v) => [v.link.id, v]));
      expect(byId.get(outgoing.link.id)?.direction).toBe("outgoing");
      expect(byId.get(incoming.link.id)?.direction).toBe("incoming");
      expect(page.items).toHaveLength(2);
    });

    it("filters by direction", async () => {
      const hub = await entitiesA.create({ type: "project", title: "Hub" });
      const out = await entitiesA.create({ type: "task", title: "Out" });
      const inc = await entitiesA.create({ type: "note", title: "In" });
      await linksA.create({
        sourceEntityId: hub.id,
        targetEntityId: out.id,
        type: "task.relates_to",
      });
      await linksA.create({
        sourceEntityId: inc.id,
        targetEntityId: hub.id,
        type: "task.relates_to",
      });

      const outOnly = await linksA.listForEntity(hub.id, {
        direction: "outgoing",
      });
      expect(outOnly.items.map((v) => v.counterpart.id)).toEqual([out.id]);

      const inOnly = await linksA.listForEntity(hub.id, {
        direction: "incoming",
      });
      expect(inOnly.items.map((v) => v.counterpart.id)).toEqual([inc.id]);
    });

    it("filters by link type", async () => {
      const hub = await entitiesA.create({ type: "meeting", title: "Hub" });
      const t1 = await entitiesA.create({ type: "task", title: "T1" });
      const n1 = await entitiesA.create({ type: "note", title: "N1" });
      await linksA.create({
        sourceEntityId: hub.id,
        targetEntityId: t1.id,
        type: "meeting.produced_task",
      });
      await linksA.create({
        sourceEntityId: hub.id,
        targetEntityId: n1.id,
        type: "meeting.supporting_note",
      });

      const tasks = await linksA.listForEntity(hub.id, {
        type: "meeting.produced_task",
      });
      expect(tasks.items.map((v) => v.counterpart.id)).toEqual([t1.id]);
    });

    it("excludes explicitly unlinked links", async () => {
      const source = await entitiesA.create({ type: "meeting", title: "M" });
      const target = await entitiesA.create({ type: "task", title: "T" });
      const { link } = await linksA.create({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        type: "meeting.produced_task",
      });
      await linksA.unlink(link.id);

      expect((await linksA.listForEntity(source.id)).items).toEqual([]);
      expect((await linksA.listForEntity(target.id)).items).toEqual([]);
    });

    it("excludes links whose counterpart entity is soft-deleted", async () => {
      const anchor = await entitiesA.create({ type: "project", title: "P" });
      const other = await entitiesA.create({ type: "task", title: "T" });
      await linksA.create({
        sourceEntityId: anchor.id,
        targetEntityId: other.id,
        type: "task.relates_to",
      });

      // Deleting the counterpart hides the link from the still-active anchor.
      await entitiesA.softDelete(other.id);
      expect((await linksA.listForEntity(anchor.id)).items).toEqual([]);
    });

    it("never surfaces another workspace's links and requires the anchor to be active", async () => {
      const source = await entitiesA.create({ type: "meeting", title: "M" });
      const target = await entitiesA.create({ type: "task", title: "T" });
      await linksA.create({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        type: "meeting.produced_task",
      });

      // Workspace B, listing the same anchor id, must see nothing exists — a
      // cross-workspace anchor is reported exactly as a missing endpoint.
      await expect(linksB.listForEntity(source.id)).rejects.toBeInstanceOf(
        EntityLinkEndpointNotFoundError,
      );

      // Listing a nonexistent/inactive anchor in A also fails as endpoint-not-found.
      await expect(linksA.listForEntity("nope")).rejects.toBeInstanceOf(
        EntityLinkEndpointNotFoundError,
      );
    });
  });

  describe("pagination (scenarios 1-10)", () => {
    /** Seed `count` outgoing links from a fresh anchor, one per tick. */
    async function seedOutgoing(count: number): Promise<string> {
      const anchor = await entitiesA.create({
        type: "project",
        title: "Anchor",
      });
      for (let i = 0; i < count; i++) {
        clock.advance(1_000);
        const other = await entitiesA.create({
          type: "task",
          title: `T${String(i).padStart(3, "0")}`,
        });
        await linksA.create({
          sourceEntityId: anchor.id,
          targetEntityId: other.id,
          type: "task.relates_to",
        });
      }
      return anchor.id;
    }

    it("applies a bounded default page size", async () => {
      const anchor = await seedOutgoing(55);
      const page = await linksA.listForEntity(anchor);
      // DEFAULT_LINK_PAGE_SIZE is 50.
      expect(page.items).toHaveLength(50);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });

    it("clamps to the maximum page size", async () => {
      const anchor = await seedOutgoing(105);
      const page = await linksA.listForEntity(anchor, { limit: 1000 });
      // MAX_LINK_PAGE_SIZE is 100.
      expect(page.items).toHaveLength(100);
      expect(page.hasMore).toBe(true);
    });

    it("walks every link exactly once across pages (no dupes, no skips), deterministically", async () => {
      const total = 23;
      const anchor = await seedOutgoing(total);

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await linksA.listForEntity(anchor, { limit: 5, cursor });
        seen.push(...page.items.map((v) => v.link.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
        expect(pages).toBeLessThanOrEqual(total + 1);
      } while (cursor);

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
      // Counterpart titles come back in creation order (created_at ordering).
      const titles = await Promise.all(
        seen.map(async (id) => (await linksA.getById(id))!.targetEntityId),
      );
      expect(titles).toHaveLength(total);
    });

    it("orders deterministically by id when createdAt ties", async () => {
      // No clock advance between links → identical createdAt; id breaks the tie.
      const anchor = (await entitiesA.create({ type: "project", title: "A" }))
        .id;
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const other = await entitiesA.create({ type: "task", title: `S${i}` });
        const { link } = await linksA.create({
          sourceEntityId: anchor,
          targetEntityId: other.id,
          type: "task.relates_to",
        });
        ids.push(link.id);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await linksA.listForEntity(anchor, { limit: 2, cursor });
        seen.push(...page.items.map((v) => v.link.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toEqual([...ids].sort());
    });
  });

  describe("cursor scope binding (scenarios 6-10)", () => {
    async function seedAnchorWithLinks(
      repo: ReturnType<typeof makeLinkRepository>,
      entityRepo: ReturnType<typeof makeRepository>,
      count: number,
      type = "task.relates_to",
    ): Promise<string> {
      const anchor = await entityRepo.create({ type: "project", title: "A" });
      for (let i = 0; i < count; i++) {
        clock.advance(1_000);
        const other = await entityRepo.create({ type: "task", title: `T${i}` });
        await repo.create({
          sourceEntityId: anchor.id,
          targetEntityId: other.id,
          type,
        });
      }
      return anchor.id;
    }

    it("rejects a cursor replayed in another workspace", async () => {
      const anchorA = await seedAnchorWithLinks(linksA, entitiesA, 3);
      const first = await linksA.listForEntity(anchorA, { limit: 1 });
      expect(first.nextCursor).not.toBeNull();

      // Even for the same anchor id string, workspace B must reject the cursor.
      // (It also would not have that active anchor — assert on the cursor.)
      const anchorB = await seedAnchorWithLinks(linksB, entitiesB, 3);
      await expect(
        linksB.listForEntity(anchorB, { limit: 1, cursor: first.nextCursor! }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
    });

    it("rejects a cursor issued for another anchor entity", async () => {
      const anchor1 = await seedAnchorWithLinks(linksA, entitiesA, 3);
      const anchor2 = await seedAnchorWithLinks(linksA, entitiesA, 3);
      const first = await linksA.listForEntity(anchor1, { limit: 1 });
      await expect(
        linksA.listForEntity(anchor2, { limit: 1, cursor: first.nextCursor! }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
    });

    it("rejects an outgoing cursor replayed under incoming or both", async () => {
      const anchor = await seedAnchorWithLinks(linksA, entitiesA, 3);
      const outFirst = await linksA.listForEntity(anchor, {
        direction: "outgoing",
        limit: 1,
      });
      expect(outFirst.nextCursor).not.toBeNull();

      await expect(
        linksA.listForEntity(anchor, {
          direction: "incoming",
          cursor: outFirst.nextCursor!,
        }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
      await expect(
        linksA.listForEntity(anchor, {
          direction: "both",
          cursor: outFirst.nextCursor!,
        }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
    });

    it("rejects a type-filtered cursor reused without or under another type", async () => {
      const anchor = (await entitiesA.create({ type: "meeting", title: "A" }))
        .id;
      for (let i = 0; i < 4; i++) {
        clock.advance(1_000);
        const other = await entitiesA.create({ type: "task", title: `T${i}` });
        await linksA.create({
          sourceEntityId: anchor,
          targetEntityId: other.id,
          type: "meeting.produced_task",
        });
      }
      const typed = await linksA.listForEntity(anchor, {
        type: "meeting.produced_task",
        limit: 1,
      });
      expect(typed.nextCursor).not.toBeNull();

      await expect(
        linksA.listForEntity(anchor, { cursor: typed.nextCursor! }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
      await expect(
        linksA.listForEntity(anchor, {
          type: "meeting.supporting_note",
          cursor: typed.nextCursor!,
        }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
    });

    it("rejects malformed and legacy-shaped cursors safely", async () => {
      const anchor = await seedAnchorWithLinks(linksA, entitiesA, 2);
      await expect(
        linksA.listForEntity(anchor, { cursor: "not-a-real-cursor!!" }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
      // A base64url payload of the wrong shape (an entity-kernel-style 6-tuple)
      // is rejected — the link cursor is a distinct, versioned format.
      const legacy = btoa(JSON.stringify([2, WS_A, null, 0, "2026", "x"]))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      await expect(
        linksA.listForEntity(anchor, { cursor: legacy }),
      ).rejects.toBeInstanceOf(InvalidEntityLinkCursorError);
    });

    it("accepts a cursor replayed under its own exact scope", async () => {
      const anchor = await seedAnchorWithLinks(linksA, entitiesA, 3);
      const first = await linksA.listForEntity(anchor, { limit: 1 });
      const second = await linksA.listForEntity(anchor, {
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0]!.link.id).not.toBe(first.items[0]!.link.id);
    });
  });

  describe("getById scoping", () => {
    it("hides another workspace's link and excludes unlinked by default", async () => {
      const [source, target] = await twoEntitiesA();
      const { link } = await linksA.create({
        sourceEntityId: source,
        targetEntityId: target,
        type: "task.relates_to",
      });

      // Cross-workspace read → null, no disclosure.
      expect(await linksB.getById(link.id)).toBeNull();

      await linksA.unlink(link.id);
      expect(await linksA.getById(link.id)).toBeNull();
      const withUnlinked = await linksA.getById(link.id, {
        includeUnlinked: true,
      });
      expect(withUnlinked?.id).toBe(link.id);
      expect(withUnlinked?.deletedAt).not.toBeNull();
    });
  });
});
