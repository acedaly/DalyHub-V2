import { beforeEach, describe, expect, it } from "vitest";

import {
  countActivitiesOfType,
  countLinkRows,
  countRows,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

// FND-05: under real concurrent D1 races, exactly one event is appended per actual
// state change — the append is coupled to the changed-row outcome, not deduplicated
// after the fact (ADR-012).

const WS = "ws_cc";
const CTX = makeContext(WS);

describe("Activity recording under concurrency (real D1 races)", () => {
  let entities: ReturnType<typeof makeRepository>;
  let links: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS]);
    entities = makeRepository(CTX, { idGenerator: sequentialIds("e") });
    links = makeLinkRepository(CTX, { idGenerator: sequentialIds("lnk") });
  });

  it("concurrent entity delete produces exactly one entity.deleted event", async () => {
    const e = await entities.create({ type: "task", title: "T" });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => entities.softDelete(e.id)),
    );
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_deleted")).toHaveLength(
      7,
    );
    expect(await countActivitiesOfType("entity.deleted")).toBe(1);
  });

  it("concurrent entity restore produces exactly one entity.restored event", async () => {
    const e = await entities.create({ type: "task", title: "T" });
    await entities.softDelete(e.id);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => entities.restore(e.id)),
    );
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await countActivitiesOfType("entity.restored")).toBe(1);
  });

  it("concurrent identical link create produces one link, one id, one created event", async () => {
    const a = await entities.create({ type: "meeting", title: "A" });
    const b = await entities.create({ type: "task", title: "B" });
    const input = {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => links.create(input)),
    );
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(new Set(results.map((r) => r.link.id)).size).toBe(1);
    expect(await countLinkRows()).toBe(1);
    expect(await countActivitiesOfType("entity_link.created")).toBe(1);
  });

  it("concurrent unlink produces exactly one entity_link.unlinked event", async () => {
    const a = await entities.create({ type: "meeting", title: "A" });
    const b = await entities.create({ type: "task", title: "B" });
    const { link } = await links.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => links.unlink(link.id)),
    );
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(1);
  });

  it("concurrent restore and concurrent create-after-unlink each produce one restored event", async () => {
    const a = await entities.create({ type: "meeting", title: "A" });
    const b = await entities.create({ type: "task", title: "B" });
    const input = {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    };
    const { link } = await links.create(input);
    await links.unlink(link.id);

    // Concurrent direct restore.
    const restores = await Promise.all(
      Array.from({ length: 6 }, () => links.restore(link.id)),
    );
    expect(restores.filter((r) => r.changed)).toHaveLength(1);
    expect(await countActivitiesOfType("entity_link.restored")).toBe(1);

    // Unlink again, then concurrent create-after-unlink.
    await links.unlink(link.id);
    const creates = await Promise.all(
      Array.from({ length: 6 }, () => links.create(input)),
    );
    expect(creates.filter((r) => r.outcome === "restored")).toHaveLength(1);
    expect(creates.filter((r) => r.outcome === "already_exists")).toHaveLength(
      5,
    );
    expect(new Set(creates.map((r) => r.link.id)).size).toBe(1);
    expect(await countLinkRows()).toBe(1);
    // One more restored event from the create-after-unlink winner.
    expect(await countActivitiesOfType("entity_link.restored")).toBe(2);
  });

  it("all concurrent callers receive documented outcomes with no unexpected errors", async () => {
    const e = await entities.create({ type: "task", title: "T" });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => entities.softDelete(e.id)),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    // One entity + one create event + exactly one deleted event.
    expect(await countRows()).toBe(1);
    expect(await countActivitiesOfType("entity.deleted")).toBe(1);
  });
});
