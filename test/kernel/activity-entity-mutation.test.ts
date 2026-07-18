import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  FakeClock,
  countActivities,
  countActivitiesOfType,
  countRows,
  ensureWorkspace,
  makeActivityRepository,
  makeContext,
  makeRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

// FND-05: every successful, meaningful Entity mutation appends exactly one uniform
// Activity event, atomically; no-ops and failures append nothing (ADR-012).

const WS = "ws_em";
const OTHER = "ws_em_other";
const CTX = makeContext(WS);

describe("Entity mutation Activity events", () => {
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

  it("create appends one entity.created with a subject and rich payload", async () => {
    const created = await entities.create({ type: "task", title: "Write it" });

    expect(await countActivitiesOfType("entity.created")).toBe(1);
    const page = await activity.listForWorkspace();
    expect(page.items).toHaveLength(1);
    const event = page.items[0]!;
    expect(event.type).toBe("entity.created");
    expect(event.subjects).toEqual([{ entityId: created.id, role: "subject" }]);
    expect(event.payload).toEqual({ entityType: "task", title: "Write it" });
    // Mutation timestamp and event timestamp derive from the same clock call.
    expect(event.occurredAt).toEqual(created.createdAt);
  });

  it("update appends one entity.updated with accurate before/after title", async () => {
    const created = await entities.create({ type: "task", title: "Old" });
    clock.advance(1000);
    const updated = await entities.update(created.id, { title: "New" });

    expect(await countActivitiesOfType("entity.updated")).toBe(1);
    const event = (await activity.listForWorkspace({ type: "entity.updated" }))
      .items[0]!;
    expect(event.payload).toEqual({
      changes: { title: { before: "Old", after: "New" } },
    });
    expect(event.subjects).toEqual([{ entityId: created.id, role: "subject" }]);
    expect(event.occurredAt).toEqual(updated.updatedAt);
  });

  it("a same-title update is a no-op: no event, no updatedAt churn", async () => {
    const created = await entities.create({ type: "task", title: "Same" });
    clock.advance(5000);
    // Submitting the already-stored title (even with surrounding whitespace that
    // trims to the same value) changes nothing meaningful.
    const result = await entities.update(created.id, { title: "  Same  " });

    expect(result.title).toBe("Same");
    expect(result.updatedAt).toEqual(created.updatedAt); // not advanced
    expect(await countActivitiesOfType("entity.updated")).toBe(0);
    // Only the create event exists.
    expect(await countActivities()).toBe(1);
  });

  it("soft-delete appends one entity.deleted; repeated delete appends nothing", async () => {
    const created = await entities.create({ type: "note", title: "N" });
    await entities.softDelete(created.id);
    expect(await countActivitiesOfType("entity.deleted")).toBe(1);

    const repeat = await entities.softDelete(created.id);
    expect(repeat.outcome).toBe("already_deleted");
    expect(await countActivitiesOfType("entity.deleted")).toBe(1);

    const event = (await activity.listForWorkspace({ type: "entity.deleted" }))
      .items[0]!;
    expect(event.subjects).toEqual([{ entityId: created.id, role: "subject" }]);
  });

  it("restore appends one entity.restored; repeated restore appends nothing", async () => {
    const created = await entities.create({ type: "note", title: "N" });
    await entities.softDelete(created.id);
    await entities.restore(created.id);
    expect(await countActivitiesOfType("entity.restored")).toBe(1);

    const repeat = await entities.restore(created.id);
    expect(repeat.outcome).toBe("already_active");
    expect(await countActivitiesOfType("entity.restored")).toBe(1);
  });

  it("a failed (not-found / soft-deleted) update appends no event", async () => {
    const created = await entities.create({ type: "task", title: "T" });
    await entities.softDelete(created.id);
    const before = await countActivities();

    await expect(entities.update(created.id, { title: "X" })).rejects.toThrow();
    await expect(entities.update("missing", { title: "X" })).rejects.toThrow();
    expect(await countActivities()).toBe(before);
  });

  it("a cross-workspace mutation appends no event", async () => {
    await seedEntity(OTHER, "foreign");
    const before = await countActivities();
    await expect(entities.update("foreign", { title: "X" })).rejects.toThrow();
    await expect(entities.softDelete("foreign")).rejects.toThrow();
    expect(await countActivities()).toBe(before);
  });

  it("the event actor comes from the trusted composition context", async () => {
    // Default is the system actor.
    const created = await entities.create({ type: "task", title: "sys" });
    const sysEvent = await activity.getById(
      (await activity.listForWorkspace()).items[0]!.id,
    );
    expect(sysEvent?.actor).toEqual({ type: "system", id: null });
    expect(created.id).toBeTruthy();

    // A different trusted actor context (as FND-09 would supply) is recorded.
    const asUser = makeRepository(CTX, {
      clock: clock.now,
      idGenerator: sequentialIds("u"),
      activityIdGenerator: sequentialIds("uact"),
      actorContext: createActivityActorContext({ type: "user", id: "user_7" }),
    });
    const u = await asUser.create({ type: "task", title: "byuser" });
    const events = await activity.listForEntity(u.id);
    expect(events.items[0]!.actor).toEqual({ type: "user", id: "user_7" });
  });

  it("an invalid generated Activity id writes nothing (validated before mutation)", async () => {
    const broken = makeRepository(CTX, {
      idGenerator: sequentialIds("e"),
      activityIdGenerator: () => "", // invalid: empty id
    });
    await expect(
      broken.create({ type: "task", title: "nope" }),
    ).rejects.toThrow();
    expect(await countRows()).toBe(0);
    expect(await countActivities()).toBe(0);
    await ensureWorkspace(WS);
  });
});
