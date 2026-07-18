import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ActivitySubjectUnavailableError,
  InvalidActivityCursorError,
} from "~/kernel/activity";
import { createActivityRepository } from "~/platform/storage/d1";
import {
  FakeClock,
  countingDb,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

// FND-05: Activity queries are workspace-isolated, bounded, cursor-paginated,
// newest-first and free of N+1 subject lookups (ADR-012).

const WS = "ws_q";
const OTHER = "ws_q_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);

describe("Activity queries", () => {
  let clock: FakeClock;
  let entities: ReturnType<typeof makeRepository>;
  let activity: ReturnType<typeof makeActivityRepository>;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    clock = new FakeClock("2026-07-18T00:00:00.000Z");
    entities = makeRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("e"),
      activityIdGenerator: sequentialIds("act"),
    });
    activity = makeActivityRepository(CTX);
  });

  /** Create `n` entities, advancing the clock between each so occurredAt differs. */
  async function createN(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = await entities.create({ type: "task", title: `T${i}` });
      ids.push(e.id);
      clock.advance(1000);
    }
    return ids;
  }

  it("workspace feed returns events newest-first", async () => {
    await createN(3);
    const page = await activity.listForWorkspace();
    const times = page.items.map((e) => e.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.items).toHaveLength(3);
  });

  it("uses the id as a deterministic tiebreaker for identical timestamps", async () => {
    // Do NOT advance the clock: all three events share one occurredAt.
    for (let i = 0; i < 3; i++) {
      await entities.create({ type: "task", title: `T${i}` });
    }
    const page = await activity.listForWorkspace();
    const ids = page.items.map((e) => e.id);
    // Newest-first with equal timestamps ⇒ descending id order.
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("applies a safe default and an enforced maximum page size", async () => {
    // Default: created 3, default limit 50 ⇒ all returned, no more pages.
    await createN(3);
    const def = await activity.listForWorkspace();
    expect(def.items.length).toBe(3);
    expect(def.hasMore).toBe(false);

    // Requesting an over-large limit is clamped (no unbounded array).
    const clamped = await activity.listForWorkspace({ limit: 10_000 });
    expect(clamped.items.length).toBe(3);
  });

  it("paginates with no duplicates or omissions across pages", async () => {
    await createN(5);
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let guard = 0;
    do {
      const page = await activity.listForWorkspace({
        limit: 2,
        cursor: cursor ?? undefined,
      });
      seen.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor;
      expect(guard++).toBeLessThan(10);
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("filters the feed by event type", async () => {
    const [id] = await createN(1);
    await entities.softDelete(id!);
    const created = await activity.listForWorkspace({ type: "entity.created" });
    const deleted = await activity.listForWorkspace({ type: "entity.deleted" });
    expect(created.items.every((e) => e.type === "entity.created")).toBe(true);
    expect(deleted.items.every((e) => e.type === "entity.deleted")).toBe(true);
    expect(created.items).toHaveLength(1);
    expect(deleted.items).toHaveLength(1);
  });

  it("returns an entity Timeline with all associated events and subjects", async () => {
    const [id] = await createN(1);
    await entities.update(id!, { title: "renamed" });
    const timeline = await activity.listForEntity(id!);
    expect(timeline.items.map((e) => e.type).sort()).toEqual([
      "entity.created",
      "entity.updated",
    ]);
    for (const event of timeline.items) {
      expect(event.subjects).toEqual([{ entityId: id, role: "subject" }]);
    }
  });

  it("keeps a soft-deleted entity's Timeline queryable", async () => {
    const [id] = await createN(1);
    await entities.softDelete(id!);
    // The entity is gone from normal reads, but its Timeline still resolves.
    expect(await entities.getById(id!)).toBeNull();
    const timeline = await activity.listForEntity(id!);
    expect(timeline.items.map((e) => e.type).sort()).toEqual([
      "entity.created",
      "entity.deleted",
    ]);
  });

  it("never returns another workspace's events, and cannot query its entity", async () => {
    await createN(2);
    const otherEntities = makeRepository(CTX_OTHER, {
      idGenerator: sequentialIds("o"),
    });
    const foreign = await otherEntities.create({ type: "task", title: "F" });

    // WS feed contains only WS events.
    const feed = await activity.listForWorkspace();
    expect(feed.items).toHaveLength(2);

    // WS cannot query an entity that lives in OTHER — indistinguishable from
    // nonexistent.
    await expect(activity.listForEntity(foreign.id)).rejects.toBeInstanceOf(
      ActivitySubjectUnavailableError,
    );
    await expect(
      activity.listForEntity("totally-unknown"),
    ).rejects.toBeInstanceOf(ActivitySubjectUnavailableError);
  });

  it("does not issue an N+1 subject query", async () => {
    // Seed several link events (2 subjects each) plus entity events.
    const links = makeLinkRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("lnk"),
      activityIdGenerator: sequentialIds("lact"),
    });
    const ids = await createN(6);
    for (let i = 0; i + 1 < ids.length; i += 2) {
      await links.create({
        sourceEntityId: ids[i]!,
        targetEntityId: ids[i + 1]!,
        type: "task.relates_to",
      });
    }

    const counting = countingDb(env.DB);
    const repo = createActivityRepository(counting.db, CTX);

    counting.reset();
    const page = await repo.listForWorkspace({ limit: 100 });
    expect(page.items.length).toBeGreaterThan(3);
    // Exactly two prepared statements regardless of page size: one for the
    // activities page, one for all subjects. No per-event lookup.
    expect(counting.prepareCount()).toBe(2);

    counting.reset();
    await repo.listForEntity(ids[0]!, { limit: 100 });
    // Three: anchor existence check, activities page, all subjects.
    expect(counting.prepareCount()).toBe(3);
  });

  it("rejects malformed and cross-scope cursors through the repository", async () => {
    const ids = await createN(3);
    const wsPage = await activity.listForWorkspace({ limit: 1 });
    const entityPage = await activity.listForEntity(ids[0]!, { limit: 1 });

    // Malformed cursor.
    await expect(
      activity.listForWorkspace({ cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);

    // Workspace cursor rejected on an entity Timeline, and vice versa.
    await expect(
      activity.listForEntity(ids[0]!, { cursor: wsPage.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);
    await expect(
      activity.listForWorkspace({ cursor: entityPage.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);

    // Entity A's cursor rejected for entity B.
    await expect(
      activity.listForEntity(ids[1]!, { cursor: entityPage.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);

    // A filtered cursor rejected under a different filter.
    const filtered = await activity.listForWorkspace({
      type: "entity.created",
      limit: 1,
    });
    await expect(
      activity.listForWorkspace({
        type: "entity.deleted",
        cursor: filtered.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);
  });
});
