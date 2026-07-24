import { beforeEach, describe, expect, it } from "vitest";

import { DiaryNotFoundError, DiaryValidationError } from "~/kernel/diary";
import { ReservedEntityTypeError } from "~/kernel/entities";

import {
  countActivitiesOfType,
  countDiaryEntryRows,
  countRows,
  FakeClock,
  makeContext,
  makeDiaryRepository,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_diary_other";

function diary(ws = WS, options?: Parameters<typeof makeDiaryRepository>[1]) {
  return makeDiaryRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(ws === WS ? "d" : "od"),
    ...options,
  });
}

function entities(ws = WS, prefix = "e") {
  return makeRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("DiaryRepository.create", () => {
  it("captures an entry atomically: entities row + detail row + one diary_entry.created event", async () => {
    const repo = diary();
    const entry = await repo.create({
      entryType: "meeting",
      title: "Meeting with Operations",
      body: "Discussed Q3 plan.",
    });

    expect(entry.entryType).toBe("meeting");
    expect(entry.title).toBe("Meeting with Operations");
    expect(entry.body).toBe("Discussed Q3 plan.");
    expect(entry.timezone).toBe("UTC");
    expect(entry.source).toEqual({ channel: "manual", reference: null });
    expect(entry.deletedAt).toBeNull();

    expect(await countRows()).toBe(1);
    expect(await countDiaryEntryRows()).toBe(1);
    expect(await countActivitiesOfType("diary_entry.created")).toBe(1);
  });

  it("is capture-first: occurredAt defaults to the capture time", async () => {
    const clock = new FakeClock("2026-07-17T08:30:00.000Z");
    const repo = diary(WS, { clock: clock.now });
    const entry = await repo.create({
      entryType: "note",
      title: "Quick thought",
    });
    expect(entry.occurredAt.toISOString()).toBe("2026-07-17T08:30:00.000Z");
    expect(entry.createdAt.getTime()).toBe(entry.occurredAt.getTime());
  });

  it("supports Memory Mode backdating: occurredAt may precede createdAt", async () => {
    const clock = new FakeClock("2026-07-17T00:00:00.000Z");
    const repo = diary(WS, { clock: clock.now });
    const past = new Date("2020-01-01T12:00:00.000Z");
    const entry = await repo.create({
      entryType: "travel",
      title: "Trip to Kyoto",
      occurredAt: past,
      timezone: "Asia/Tokyo",
    });
    expect(entry.occurredAt.getTime()).toBe(past.getTime());
    expect(entry.occurredAt.getTime()).toBeLessThan(entry.createdAt.getTime());
    expect(entry.timezone).toBe("Asia/Tokyo");
  });

  it("treats the body as optional — an empty/omitted body stores null", async () => {
    const repo = diary();
    const a = await repo.create({
      entryType: "idea",
      title: "A spark",
      body: "",
    });
    const b = await repo.create({ entryType: "idea", title: "Another" });
    expect(a.body).toBeNull();
    expect(b.body).toBeNull();
  });

  it("rejects a malformed entry type and an invalid timezone, writing nothing", async () => {
    const repo = diary();
    await expect(
      repo.create({ entryType: "Bad Type", title: "x" }),
    ).rejects.toBeInstanceOf(DiaryValidationError);
    await expect(
      repo.create({ entryType: "note", title: "x", timezone: "Mars/Base" }),
    ).rejects.toBeInstanceOf(DiaryValidationError);
    expect(await countRows()).toBe(0);
    expect(await countDiaryEntryRows()).toBe(0);
  });
});

describe("generic EntityRepository reservation", () => {
  it("refuses to CREATE a bare diary entity (it would bypass the detail slice)", async () => {
    await expect(
      entities().create({ type: "diary", title: "Illegal" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
    expect(await countRows()).toBe(0);
  });

  it("still owns a Diary Entry's header lifecycle: rename, soft-delete and restore", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "note", title: "Draft" });
    const generic = entities();

    const renamed = await generic.update(entry.id, { title: "Final" });
    expect(renamed.title).toBe("Final");

    const deleted = await generic.softDelete(entry.id);
    expect(deleted.outcome).toBe("deleted");
    // The detail row survives soft-deletion (ON DELETE RESTRICT, no cascade).
    expect(await countDiaryEntryRows()).toBe(1);

    const restored = await generic.restore(entry.id);
    expect(restored.outcome).toBe("restored");
  });
});

describe("DiaryRepository.get", () => {
  it("fails closed (null) for missing, deleted, wrong-type and cross-workspace ids", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "note", title: "Mine" });
    const wrongType = await entities().create({
      type: "widget",
      title: "Not diary",
    });
    await entities().softDelete(entry.id);

    const otherRepo = diary(OTHER);
    const otherEntry = await otherRepo.create({
      entryType: "note",
      title: "Theirs",
    });

    for (const id of ["nope", entry.id, wrongType.id, otherEntry.id]) {
      expect(await repo.get(id)).toBeNull();
    }
  });

  it("returns a soft-deleted entry when includeDeleted is set", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "note", title: "Kept" });
    await entities().softDelete(entry.id);
    expect(await repo.get(entry.id)).toBeNull();
    const withDeleted = await repo.get(entry.id, { includeDeleted: true });
    expect(withDeleted?.id).toBe(entry.id);
    expect(withDeleted?.deletedAt).toBeInstanceOf(Date);
  });
});

describe("DiaryRepository.update", () => {
  it("edits the detail slice and records diary_entry.updated exactly once", async () => {
    const clock = new FakeClock("2026-07-17T00:00:00.000Z");
    const repo = diary(WS, { clock: clock.now });
    const entry = await repo.create({ entryType: "note", title: "Log" });

    clock.advance(60_000);
    const result = await repo.update(entry.id, {
      entryType: "decision",
      body: "Chose option B.",
      occurredAt: new Date("2026-07-16T09:00:00.000Z"),
      source: { channel: "mobile", reference: "msg-1" },
    });

    expect(result.changed).toBe(true);
    expect(result.entry.entryType).toBe("decision");
    expect(result.entry.body).toBe("Chose option B.");
    expect(result.entry.occurredAt.toISOString()).toBe(
      "2026-07-16T09:00:00.000Z",
    );
    expect(result.entry.source).toEqual({
      channel: "mobile",
      reference: "msg-1",
    });
    // Effective updatedAt reflects the detail edit.
    expect(result.entry.updatedAt.toISOString()).toBe(
      "2026-07-17T00:01:00.000Z",
    );
    expect(await countActivitiesOfType("diary_entry.updated")).toBe(1);
  });

  it("clears the body when body: null is supplied", async () => {
    const repo = diary();
    const entry = await repo.create({
      entryType: "note",
      title: "x",
      body: "text",
    });
    const result = await repo.update(entry.id, { body: null });
    expect(result.changed).toBe(true);
    expect(result.entry.body).toBeNull();
  });

  it("is an idempotent no-op (no write, no Activity) when nothing changes", async () => {
    const repo = diary();
    const entry = await repo.create({
      entryType: "note",
      title: "x",
      body: "same",
    });
    const before = await countActivitiesOfType("diary_entry.updated");
    const result = await repo.update(entry.id, {
      body: "same",
      entryType: "note",
    });
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("diary_entry.updated")).toBe(before);
  });

  it("rejects an empty edit and fails closed for a missing/deleted entry", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "note", title: "x" });
    await expect(repo.update(entry.id, {})).rejects.toBeInstanceOf(
      DiaryValidationError,
    );
    await entities().softDelete(entry.id);
    await expect(repo.update(entry.id, { body: "new" })).rejects.toBeInstanceOf(
      DiaryNotFoundError,
    );
    await expect(repo.update("nope", { body: "new" })).rejects.toBeInstanceOf(
      DiaryNotFoundError,
    );
  });

  it("concurrent edits to DIFFERENT fields both apply — no lost update", async () => {
    const repo = diary();
    const entry = await repo.create({
      entryType: "note",
      title: "x",
      body: "A",
      timezone: "UTC",
    });
    const [a, b] = await Promise.all([
      repo.update(entry.id, { body: "B" }),
      repo.update(entry.id, { timezone: "Asia/Tokyo" }),
    ]);
    expect(a.changed).toBe(true);
    expect(b.changed).toBe(true);
    const final = await repo.get(entry.id);
    // Neither edit clobbered the other's field back to its stale snapshot value.
    expect(final?.body).toBe("B");
    expect(final?.timezone).toBe("Asia/Tokyo");
    expect(await countActivitiesOfType("diary_entry.updated")).toBe(2);
  });

  it("editing one source subfield preserves the other (no create-time defaulting)", async () => {
    const repo = diary();
    const entry = await repo.create({
      entryType: "note",
      title: "x",
      source: { channel: "voice", reference: "rec-1" },
    });
    const r1 = await repo.update(entry.id, { source: { reference: "rec-2" } });
    expect(r1.entry.source).toEqual({ channel: "voice", reference: "rec-2" });
    const r2 = await repo.update(entry.id, { source: { channel: "photo" } });
    expect(r2.entry.source).toEqual({ channel: "photo", reference: "rec-2" });
    const r3 = await repo.update(entry.id, { source: { reference: null } });
    expect(r3.entry.source).toEqual({ channel: "photo", reference: null });
  });

  it("concurrent identical edits append exactly one diary_entry.updated event", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "note", title: "x" });
    const results = await Promise.all([
      repo.update(entry.id, { body: "coalesced" }),
      repo.update(entry.id, { body: "coalesced" }),
      repo.update(entry.id, { body: "coalesced" }),
    ]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await countActivitiesOfType("diary_entry.updated")).toBe(1);
    expect((await repo.get(entry.id))?.body).toBe("coalesced");
  });
});

describe("Atomicity — the write and its event are all-or-nothing", () => {
  it("a create-batch failure rolls back the entity, the detail row and the event", async () => {
    const repo = diary(WS, { createFault: "after-details" });
    await expect(
      repo.create({ entryType: "note", title: "Doomed" }),
    ).rejects.toThrow();
    expect(await countRows()).toBe(0);
    expect(await countDiaryEntryRows()).toBe(0);
    expect(await countActivitiesOfType("diary_entry.created")).toBe(0);
  });

  it("an update Activity-insert failure rolls the detail write back too", async () => {
    const entry = await diary().create({ entryType: "note", title: "x" });
    const faulty = diary(WS, { mutationFault: "after-domain" });
    await expect(
      faulty.update(entry.id, { body: "new body" }),
    ).rejects.toThrow();
    expect((await diary().get(entry.id))?.body).toBeNull();
    expect(await countActivitiesOfType("diary_entry.updated")).toBe(0);
  });
});

describe("Relationships integrate through EntityLinks (no duplicate model)", () => {
  it("a Diary Entry links to another entity via the generic EntityLink repository", async () => {
    const repo = diary();
    const entry = await repo.create({ entryType: "meeting", title: "1:1" });
    const note = await entities().create({ type: "note", title: "Agenda" });

    const links = makeLinkRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("lnk"),
    });
    const created = await links.create({
      sourceEntityId: entry.id,
      targetEntityId: note.id,
      type: "references",
    });
    expect(created.outcome).toBe("created");

    const outgoing = await links.listForEntity(entry.id, {
      direction: "outgoing",
    });
    expect(outgoing.items.map((l) => l.counterpart.id)).toContain(note.id);
  });
});
