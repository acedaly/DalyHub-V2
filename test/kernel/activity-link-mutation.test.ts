import { beforeEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  countActivities,
  countActivitiesOfType,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

// FND-05: every successful, meaningful EntityLink mutation appends exactly one
// event with BOTH endpoints as subjects (source/target); no-ops append nothing
// (ADR-012). The same event appears in both endpoints' timelines.

const WS = "ws_lm";
const CTX = makeContext(WS);

describe("EntityLink mutation Activity events", () => {
  let clock: FakeClock;
  let entities: ReturnType<typeof makeRepository>;
  let links: ReturnType<typeof makeLinkRepository>;
  let activity: ReturnType<typeof makeActivityRepository>;

  beforeEach(async () => {
    await resetTables([WS]);
    clock = new FakeClock("2026-07-18T00:00:00.000Z");
    entities = makeRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("e"),
      activityIdGenerator: sequentialIds("eact"),
    });
    links = makeLinkRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("lnk"),
      activityIdGenerator: sequentialIds("lact"),
    });
    activity = makeActivityRepository(CTX);
  });

  async function pair() {
    const a = await entities.create({ type: "meeting", title: "A" });
    const b = await entities.create({ type: "task", title: "B" });
    return { a, b };
  }

  it("new link appends one entity_link.created with source & target subjects", async () => {
    const { a, b } = await pair();
    const { link } = await links.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    });

    expect(await countActivitiesOfType("entity_link.created")).toBe(1);
    const event = (
      await activity.listForWorkspace({ type: "entity_link.created" })
    ).items[0]!;
    // Both endpoints are subjects, with the correct roles.
    expect(event.subjects).toEqual([
      { entityId: a.id, role: "source" },
      { entityId: b.id, role: "target" },
    ]);
    expect(event.payload).toEqual({
      linkId: link.id,
      linkType: "meeting.produced_task",
      sourceEntityId: a.id,
      targetEntityId: b.id,
    });
  });

  it("a duplicate active create appends no event", async () => {
    const { a, b } = await pair();
    const input = {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    };
    await links.create(input);
    const before = await countActivities();
    const again = await links.create(input);
    expect(again.outcome).toBe("already_exists");
    expect(await countActivities()).toBe(before);
  });

  it("unlink appends one entity_link.unlinked; repeated unlink appends nothing", async () => {
    const { a, b } = await pair();
    const { link } = await links.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    });
    await links.unlink(link.id);
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(1);

    const repeat = await links.unlink(link.id);
    expect(repeat.outcome).toBe("already_unlinked");
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(1);
  });

  it("direct restore appends one entity_link.restored; repeated restore appends nothing", async () => {
    const { a, b } = await pair();
    const { link } = await links.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    });
    await links.unlink(link.id);
    await links.restore(link.id);
    expect(await countActivitiesOfType("entity_link.restored")).toBe(1);

    const repeat = await links.restore(link.id);
    expect(repeat.outcome).toBe("already_active");
    expect(await countActivitiesOfType("entity_link.restored")).toBe(1);
  });

  it("create-after-unlink appends entity_link.restored (same link id)", async () => {
    const { a, b } = await pair();
    const input = {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    };
    const { link } = await links.create(input);
    await links.unlink(link.id);
    const before = await countActivitiesOfType("entity_link.restored");
    const restored = await links.create(input);
    expect(restored.outcome).toBe("restored");
    expect(restored.link.id).toBe(link.id);
    expect(await countActivitiesOfType("entity_link.restored")).toBe(
      before + 1,
    );
  });

  it("a link event appears in BOTH endpoint timelines with the same Activity id", async () => {
    const { a, b } = await pair();
    await links.create({
      sourceEntityId: a.id,
      targetEntityId: b.id,
      type: "meeting.produced_task",
    });

    const fromA = await activity.listForEntity(a.id, {
      type: "entity_link.created",
    });
    const fromB = await activity.listForEntity(b.id, {
      type: "entity_link.created",
    });
    expect(fromA.items).toHaveLength(1);
    expect(fromB.items).toHaveLength(1);
    expect(fromA.items[0]!.id).toBe(fromB.items[0]!.id);
    // Each side sees the full subject set, not just its own endpoint.
    expect(fromA.items[0]!.subjects).toEqual([
      { entityId: a.id, role: "source" },
      { entityId: b.id, role: "target" },
    ]);
  });

  it("a failed link mutation (inactive endpoint) appends no event", async () => {
    const { a, b } = await pair();
    await entities.softDelete(b.id);
    const before = await countActivities();
    await expect(
      links.create({
        sourceEntityId: a.id,
        targetEntityId: b.id,
        type: "meeting.produced_task",
      }),
    ).rejects.toThrow();
    expect(await countActivities()).toBe(before);
  });
});
