import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ActivitySubjectUnavailableError,
  ActivityValidationError,
  InvalidActivityCursorError,
  MAX_ACTIVITY_ANCHORS,
  activityAnchorKey,
  validateActivityAnchorIds,
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

// PEOPLE-02 (FND-05): `listForEntities` reads the ONE Activity stream at a
// bounded SET of anchor entities as a single, correctly-ordered, cursor-paginated
// stream. It is the read a unified relationship history is built from — it adds no
// second event model — and it must stay workspace-isolated and fail closed.

const WS = "ws_multi";
const OTHER = "ws_multi_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);

describe("Activity multi-anchor listing", () => {
  let clock: FakeClock;
  let entities: ReturnType<typeof makeRepository>;
  let links: ReturnType<typeof makeLinkRepository>;
  let activity: ReturnType<typeof makeActivityRepository>;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    clock = new FakeClock("2026-07-18T00:00:00.000Z");
    entities = makeRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("e"),
      activityIdGenerator: sequentialIds("act"),
    });
    links = makeLinkRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("l"),
      activityIdGenerator: sequentialIds("lact"),
    });
    activity = makeActivityRepository(CTX);
  });

  async function create(title: string, type = "widget"): Promise<string> {
    const entity = await entities.create({ type, title });
    clock.advance(1000);
    return entity.id;
  }

  it("returns the union of the anchors' events, newest-first", async () => {
    const a = await create("A");
    const b = await create("B");
    await entities.update(a, { title: "A renamed" });
    clock.advance(1000);

    const page = await activity.listForEntities([a, b]);
    const times = page.items.map((event) => event.occurredAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    // A: created + updated. B: created.
    expect(page.items).toHaveLength(3);

    const single = await activity.listForEntities([a]);
    expect(single.items).toHaveLength(2);
  });

  it("returns an event shared by several anchors EXACTLY once, with all subjects", async () => {
    const a = await create("A");
    const b = await create("B");
    // One link event whose subjects are BOTH anchors.
    await links.create({ sourceEntityId: a, targetEntityId: b, type: "x.rel" });

    const page = await activity.listForEntities([a, b], {
      type: "entity_link.created",
    });
    expect(page.items).toHaveLength(1);
    expect(
      page.items[0].subjects.map((subject) => subject.entityId).sort(),
    ).toEqual([a, b].sort());
  });

  it("carries every subject of an event, not only the matched anchors", async () => {
    const a = await create("A");
    const outsider = await create("Outsider");
    await links.create({
      sourceEntityId: a,
      targetEntityId: outsider,
      type: "x.rel",
    });

    const page = await activity.listForEntities([a], {
      type: "entity_link.created",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].subjects).toHaveLength(2);
  });

  it("orders deterministically by descending id when timestamps tie", async () => {
    const a = await create("A");
    const b = await entities.create({ type: "widget", title: "B" });
    const c = await entities.create({ type: "widget", title: "C" });

    const page = await activity.listForEntities([a, b.id, c.id]);
    const tied = page.items.filter(
      (event) => event.occurredAt.getTime() === clock.now().getTime(),
    );
    const ids = tied.map((event) => event.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("paginates with no duplicates or omissions", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(await create(`E${index}`));
    }
    for (const id of ids) {
      await entities.update(id, { title: `${id}!` });
      clock.advance(1000);
    }

    const seen: string[] = [];
    let cursor: string | null | undefined;
    let guard = 0;
    do {
      const page = await activity.listForEntities(ids, {
        limit: 3,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor;
      guard += 1;
    } while (cursor && guard < 20);

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(8);
  });

  it("binds a cursor to the ANCHOR SET, rejecting replay against another set", async () => {
    const a = await create("A");
    const b = await create("B");
    const c = await create("C");
    for (const id of [a, b, c]) {
      await entities.update(id, { title: `${id}!` });
      clock.advance(1000);
    }

    const first = await activity.listForEntities([a, b], { limit: 2 });
    expect(first.nextCursor).not.toBeNull();

    // Same set, different ORDER: accepted (the set is what scopes the query).
    await expect(
      activity.listForEntities([b, a], {
        limit: 2,
        cursor: first.nextCursor!,
      }),
    ).resolves.toBeDefined();

    // A different set: rejected rather than silently skipping events.
    await expect(
      activity.listForEntities([a, b, c], {
        limit: 2,
        cursor: first.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);

    // A single-entity Timeline cursor cannot be replayed here either.
    const timeline = await activity.listForEntity(a, { limit: 1 });
    await expect(
      activity.listForEntities([a, b], {
        limit: 2,
        cursor: timeline.nextCursor!,
      }),
    ).rejects.toBeInstanceOf(InvalidActivityCursorError);
  });

  it("is workspace-isolated: another workspace’s anchor is unavailable", async () => {
    const mine = await create("Mine");
    const otherEntities = makeRepository(CTX_OTHER, {
      clock: clock.now,
      idGenerator: sequentialIds("o"),
      activityIdGenerator: sequentialIds("oact"),
    });
    const theirs = await otherEntities.create({
      type: "widget",
      title: "Theirs",
    });

    await expect(
      activity.listForEntities([mine, theirs.id]),
    ).rejects.toBeInstanceOf(ActivitySubjectUnavailableError);

    // And the other workspace's repository sees none of my events.
    const otherActivity = createActivityRepository(env.DB, CTX_OTHER);
    const page = await otherActivity.listForEntities([theirs.id]);
    expect(page.items.every((event) => event.workspaceId === OTHER)).toBe(true);
  });

  it("fails closed for a nonexistent anchor, disclosing nothing", async () => {
    const a = await create("A");
    await expect(
      activity.listForEntities([a, "does-not-exist"]),
    ).rejects.toBeInstanceOf(ActivitySubjectUnavailableError);
  });

  it("keeps a soft-deleted anchor’s history queryable", async () => {
    const a = await create("A");
    const b = await create("B");
    await entities.softDelete(b);
    clock.advance(1000);

    const page = await activity.listForEntities([a, b]);
    expect(page.items.some((event) => event.type === "entity.deleted")).toBe(
      true,
    );
  });

  it("rejects an empty or oversized anchor set", async () => {
    const a = await create("A");
    await expect(activity.listForEntities([])).rejects.toBeInstanceOf(
      ActivityValidationError,
    );
    const tooMany = Array.from(
      { length: MAX_ACTIVITY_ANCHORS + 1 },
      (_unused, index) => `${a}-${index}`,
    );
    await expect(activity.listForEntities(tooMany)).rejects.toBeInstanceOf(
      ActivityValidationError,
    );
  });

  it("clamps the page size and never returns an unbounded array", async () => {
    const a = await create("A");
    const page = await activity.listForEntities([a], { limit: 10_000 });
    expect(page.items.length).toBeLessThanOrEqual(100);
  });

  it("reads a page in a bounded number of queries (no N+1 over anchors)", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      ids.push(await create(`E${index}`));
    }
    const counting = countingDb(env.DB);
    const counted = createActivityRepository(counting.db, CTX);
    counting.reset();
    await counted.listForEntities(ids);
    // Anchor existence + the page + one batched subject fetch — never one query
    // per anchor.
    expect(counting.prepareCount()).toBeLessThanOrEqual(3);
  });
});

describe("anchor-set validation and keying", () => {
  it("dedupes and sorts, so caller order never changes the scope", () => {
    expect(validateActivityAnchorIds(["b", "a", "b"])).toEqual(["a", "b"]);
    expect(activityAnchorKey(["b", "a"])).toBe(activityAnchorKey(["a", "b"]));
    expect(activityAnchorKey(["a", "b"])).not.toBe(activityAnchorKey(["a"]));
  });

  it("distinguishes sets that concatenate to the same text", () => {
    // Without length-prefixing, {"ab","c"} and {"a","bc"} would collide.
    expect(activityAnchorKey(["ab", "c"])).not.toBe(
      activityAnchorKey(["a", "bc"]),
    );
  });

  it("rejects non-array, empty and invalid members", () => {
    expect(() => validateActivityAnchorIds("a")).toThrow(
      ActivityValidationError,
    );
    expect(() => validateActivityAnchorIds([])).toThrow(
      ActivityValidationError,
    );
    expect(() => validateActivityAnchorIds([""])).toThrow(
      ActivityValidationError,
    );
  });
});
