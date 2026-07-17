import { beforeEach, describe, expect, it } from "vitest";

import {
  EntityLinkEndpointNotFoundError,
  EntityLinkNotFoundError,
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

describe("EntityLink lifecycle & endpoint-deletion behaviour", () => {
  let clock: FakeClock;
  let entitiesA: ReturnType<typeof makeRepository>;
  let linksA: ReturnType<typeof makeLinkRepository>;
  let linksB: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS_A, WS_B]);
    clock = new FakeClock("2026-07-17T00:00:00.000Z");
    entitiesA = makeRepository(CTX_A, {
      clock: clock.now,
      idGenerator: sequentialIds("a"),
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

  /** Create A and B active in workspace A and an active link A→B. */
  async function linkedPair(type = "task.relates_to") {
    const a = await entitiesA.create({ type: "meeting", title: "A" });
    const b = await entitiesA.create({ type: "task", title: "B" });
    const { link } = await linksA.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type,
    });
    return { a, b, link };
  }

  describe("unlink", () => {
    it("sets deletedAt and advances updatedAt", async () => {
      const { link } = await linkedPair();
      clock.advance(7_000);
      const result = await linksA.unlink(link.id);

      expect(result.outcome).toBe("unlinked");
      expect(result.changed).toBe(true);
      expect(result.link.deletedAt).toEqual(
        new Date("2026-07-17T00:00:07.000Z"),
      );
      expect(result.link.updatedAt).toEqual(
        new Date("2026-07-17T00:00:07.000Z"),
      );
    });

    it("is idempotent (already_unlinked) and does not churn timestamps", async () => {
      const { link } = await linkedPair();
      clock.advance(1_000);
      const first = await linksA.unlink(link.id);
      clock.advance(1_000);
      const second = await linksA.unlink(link.id);

      expect(second.outcome).toBe("already_unlinked");
      expect(second.changed).toBe(false);
      expect(second.link.updatedAt).toEqual(first.link.updatedAt);
      expect(second.link.deletedAt).toEqual(first.link.deletedAt);
    });

    it("does not modify either endpoint entity", async () => {
      const { a, b, link } = await linkedPair();
      const beforeA = await entitiesA.getById(a.id);
      const beforeB = await entitiesA.getById(b.id);
      await linksA.unlink(link.id);
      expect(await entitiesA.getById(a.id)).toEqual(beforeA);
      expect(await entitiesA.getById(b.id)).toEqual(beforeB);
    });

    it("throws not-found for an unknown id and never discloses another workspace's link", async () => {
      const { link } = await linkedPair();
      await expect(linksA.unlink("nope")).rejects.toBeInstanceOf(
        EntityLinkNotFoundError,
      );
      // Workspace B cannot unlink workspace A's link — same generic not-found.
      await expect(linksB.unlink(link.id)).rejects.toBeInstanceOf(
        EntityLinkNotFoundError,
      );
    });
  });

  describe("restore", () => {
    it("clears deletedAt and advances updatedAt", async () => {
      const { link } = await linkedPair();
      await linksA.unlink(link.id);
      clock.advance(9_000);
      const result = await linksA.restore(link.id);

      expect(result.outcome).toBe("restored");
      expect(result.changed).toBe(true);
      expect(result.link.deletedAt).toBeNull();
      expect(result.link.updatedAt).toEqual(
        new Date("2026-07-17T00:00:09.000Z"),
      );
      expect(result.link.id).toBe(link.id);
    });

    it("is idempotent on an already-active link (already_active)", async () => {
      const { link } = await linkedPair();
      const result = await linksA.restore(link.id);
      expect(result.outcome).toBe("already_active");
      expect(result.changed).toBe(false);
    });

    it("fails safely when an endpoint is soft-deleted", async () => {
      const { b, link } = await linkedPair();
      await linksA.unlink(link.id);
      await entitiesA.softDelete(b.id);

      await expect(linksA.restore(link.id)).rejects.toBeInstanceOf(
        EntityLinkEndpointNotFoundError,
      );
      // Still unlinked, nothing silently changed.
      const stored = await linksA.getById(link.id, { includeUnlinked: true });
      expect(stored?.deletedAt).not.toBeNull();
    });

    it("throws not-found for an unknown id", async () => {
      await expect(linksA.restore("nope")).rejects.toBeInstanceOf(
        EntityLinkNotFoundError,
      );
    });

    it("create-after-unlink cannot re-activate a relationship when an endpoint is inactive", async () => {
      const { b, link } = await linkedPair();
      await linksA.unlink(link.id);
      await entitiesA.softDelete(b.id);

      // Re-creating the same relationship must fail safely (endpoint-not-found)
      // and must NOT resurrect the row — the endpoint check is enforced in the
      // restore statement, not merely a stale pre-check.
      await expect(
        linksA.create({
          sourceEntityId: link.sourceEntityId,
          targetEntityId: link.targetEntityId,
          type: link.type,
        }),
      ).rejects.toBeInstanceOf(EntityLinkEndpointNotFoundError);

      const stored = await linksA.getById(link.id, { includeUnlinked: true });
      expect(stored?.deletedAt).not.toBeNull();
      expect(await countLinkRows()).toBe(1);
    });
  });

  describe("endpoint soft-delete hides but preserves the relationship (central contract)", () => {
    it("hides on endpoint delete, reveals with the SAME id on restore", async () => {
      // 1-2. A and B linked; both endpoints see the link.
      const { a, b, link } = await linkedPair();
      expect((await linksA.listForEntity(a.id)).items).toHaveLength(1);
      expect((await linksA.listForEntity(b.id)).items).toHaveLength(1);

      // 3-4. Soft-delete A; querying B no longer returns the link (counterpart
      // inactive). B is still active so the query itself succeeds.
      await entitiesA.softDelete(a.id);
      expect((await linksA.listForEntity(b.id)).items).toEqual([]);

      // 5. The underlying link row is untouched — still active, id preserved.
      const rowWhileHidden = await linksA.getById(link.id);
      expect(rowWhileHidden?.id).toBe(link.id);
      expect(rowWhileHidden?.deletedAt).toBeNull();

      // 6-8. Restore A; the link reappears from both ends with the original id.
      await entitiesA.restore(a.id);
      const fromA = await linksA.listForEntity(a.id);
      const fromB = await linksA.listForEntity(b.id);
      expect(fromA.items).toHaveLength(1);
      expect(fromB.items).toHaveLength(1);
      expect(fromA.items[0]!.link.id).toBe(link.id);
      expect(fromB.items[0]!.link.id).toBe(link.id);
      expect(await countLinkRows()).toBe(1);
    });

    it("keeps an explicitly-unlinked relationship unlinked through endpoint delete & restore", async () => {
      // 1-2. Linked, then explicitly unlinked.
      const { a, link } = await linkedPair();
      await linksA.unlink(link.id);

      // 3. Endpoint soft-deleted and restored.
      await entitiesA.softDelete(a.id);
      await entitiesA.restore(a.id);

      // 4. The relationship remains unlinked — restoration did not resurrect it.
      expect((await linksA.listForEntity(a.id)).items).toEqual([]);
      const stored = await linksA.getById(link.id, { includeUnlinked: true });
      expect(stored?.deletedAt).not.toBeNull();
    });

    it("does not physically delete link rows when an endpoint is soft-deleted", async () => {
      const { a } = await linkedPair();
      expect(await countLinkRows()).toBe(1);
      await entitiesA.softDelete(a.id);
      // The link row is preserved, merely hidden by queries.
      expect(await countLinkRows()).toBe(1);
    });
  });

  describe("idempotency under concurrency (real D1 races)", () => {
    it("concurrent unlink: one unlinked, the rest already_unlinked, no storage error", async () => {
      const { link } = await linkedPair();

      const results = await Promise.all(
        Array.from({ length: 8 }, () => linksA.unlink(link.id)),
      );

      const outcomes = results.map((r) => r.outcome);
      expect(outcomes.filter((o) => o === "unlinked")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "already_unlinked")).toHaveLength(7);
      // Exactly one real change; the row is unlinked; the id is stable.
      expect(results.filter((r) => r.changed)).toHaveLength(1);
      expect(new Set(results.map((r) => r.link.id))).toEqual(
        new Set([link.id]),
      );
      expect(await countLinkRows()).toBe(1);
      const stored = await linksA.getById(link.id, { includeUnlinked: true });
      expect(stored?.deletedAt).not.toBeNull();
    });

    it("concurrent restore: one restored, the rest already_active, no storage error", async () => {
      const { link } = await linkedPair();
      await linksA.unlink(link.id);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => linksA.restore(link.id)),
      );

      const outcomes = results.map((r) => r.outcome);
      expect(outcomes.filter((o) => o === "restored")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "already_active")).toHaveLength(7);
      expect(results.filter((r) => r.changed)).toHaveLength(1);
      expect(new Set(results.map((r) => r.link.id))).toEqual(
        new Set([link.id]),
      );
      expect(await countLinkRows()).toBe(1);
      expect((await linksA.getById(link.id))?.deletedAt).toBeNull();
    });
  });
});
