import { beforeEach, describe, expect, it } from "vitest";

import { ReservedEntityTypeError } from "~/kernel/entities";
import { PersonNotFoundError, PersonValidationError } from "~/kernel/people";

import {
  countActivitiesOfType,
  countPersonRows,
  countRows,
  FakeClock,
  makeContext,
  makePersonRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_person_other";

function people(
  ws = WS,
  prefix = "p",
  options?: Parameters<typeof makePersonRepository>[1],
) {
  return makePersonRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
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

describe("PersonRepository.create", () => {
  it("creates a Person with its detail row and one person.created event, atomically", async () => {
    const repo = people();
    const person = await repo.create({
      title: "Ada Lovelace",
      organisation: "Analytical Engines",
      role: "Mathematician",
      email: "ada@example.com",
      relationship: "colleague",
      tags: ["maths", "history"],
    });

    expect(person.title).toBe("Ada Lovelace");
    expect(person.organisation).toBe("Analytical Engines");
    expect(person.relationship).toBe("colleague");
    expect(person.tags).toEqual(["maths", "history"]);
    expect(person.archivedAt).toBeNull();
    expect(person.deletedAt).toBeNull();

    expect(await countRows()).toBe(1);
    expect(await countPersonRows()).toBe(1);
    expect(await countActivitiesOfType("person.created")).toBe(1);
  });

  it("normalises blank optional fields to null and trims values", async () => {
    const person = await people().create({
      title: "  Grace Hopper  ",
      role: "   ",
      pronouns: "she/her",
    });
    expect(person.title).toBe("Grace Hopper");
    expect(person.role).toBeNull();
    expect(person.pronouns).toBe("she/her");
  });

  it("rejects an empty display name and writes nothing", async () => {
    await expect(people().create({ title: "   " })).rejects.toBeInstanceOf(
      PersonValidationError,
    );
    expect(await countRows()).toBe(0);
    expect(await countPersonRows()).toBe(0);
  });

  it("rejects an invalid email, an unknown relationship and an unsafe photo URL", async () => {
    const repo = people();
    await expect(
      repo.create({ title: "X", email: "not-an-email" }),
    ).rejects.toBeInstanceOf(PersonValidationError);
    await expect(
      repo.create({ title: "X", relationship: "nemesis" }),
    ).rejects.toBeInstanceOf(PersonValidationError);
    await expect(
      repo.create({ title: "X", photoUrl: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(PersonValidationError);
    expect(await countRows()).toBe(0);
  });

  it("is refused by the generic EntityRepository (reserved type)", async () => {
    await expect(
      entities().create({ type: "person", title: "Should fail" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
    expect(await countRows()).toBe(0);
  });
});

describe("PersonRepository.get", () => {
  it("fails closed (null) for missing, deleted, wrong-type and cross-workspace ids", async () => {
    const repo = people();
    const e = entities();
    const person = await repo.create({ title: "Visible" });
    const wrongType = await e.create({ type: "widget", title: "Not a person" });

    const otherPerson = await people(OTHER, "other").create({
      title: "Elsewhere",
    });

    for (const id of ["nope", wrongType.id, otherPerson.id]) {
      expect(await repo.get(id)).toBeNull();
    }
    expect(await repo.get(person.id)).not.toBeNull();

    // A soft-deleted person reads as not-found by default.
    await e.softDelete(person.id);
    expect(await repo.get(person.id)).toBeNull();
    expect(await repo.get(person.id, { includeDeleted: true })).not.toBeNull();
  });
});

describe("PersonRepository.update", () => {
  it("updates only the changed fields, appending exactly one person.updated event", async () => {
    const clock = new FakeClock();
    const repo = makePersonRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds("p"),
    });
    const person = await repo.create({ title: "Alan", role: "Cryptographer" });

    clock.advance(1000);
    const result = await repo.update(person.id, {
      role: "Cryptanalyst",
      mobile: "+61 400 000 000",
    });
    expect(result.changed).toBe(true);
    expect(result.person.role).toBe("Cryptanalyst");
    expect(result.person.mobile).toBe("+61 400 000 000");
    expect(await countActivitiesOfType("person.updated")).toBe(1);
  });

  it("is an idempotent no-op when nothing changes (no event)", async () => {
    const repo = people();
    const person = await repo.create({ title: "Katherine", role: "Engineer" });
    const result = await repo.update(person.id, { role: "Engineer" });
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("person.updated")).toBe(0);
  });

  it("clears a field when an explicit empty value is submitted", async () => {
    const repo = people();
    const person = await repo.create({ title: "Margaret", role: "Director" });
    const result = await repo.update(person.id, { role: "" });
    expect(result.changed).toBe(true);
    expect(result.person.role).toBeNull();
  });

  it("throws PersonNotFoundError for a missing person", async () => {
    await expect(
      people().update("ghost", { role: "x" }),
    ).rejects.toBeInstanceOf(PersonNotFoundError);
  });

  it("rejects invalid detail input with a field-scoped error", async () => {
    const repo = people();
    const person = await repo.create({ title: "Test" });
    await expect(
      repo.update(person.id, { email: "bad" }),
    ).rejects.toBeInstanceOf(PersonValidationError);
  });
});

describe("PersonRepository archive lifecycle", () => {
  it("archives and restores, emitting the matching events, idempotently", async () => {
    const repo = people();
    const person = await repo.create({ title: "Archie" });

    const archived = await repo.archive(person.id);
    expect(archived.outcome).toBe("archived");
    expect(archived.changed).toBe(true);
    expect(archived.person.archivedAt).not.toBeNull();
    expect(await countActivitiesOfType("person.archived")).toBe(1);

    const again = await repo.archive(person.id);
    expect(again.outcome).toBe("already_archived");
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType("person.archived")).toBe(1);

    const restored = await repo.restore(person.id);
    expect(restored.outcome).toBe("restored");
    expect(restored.person.archivedAt).toBeNull();
    expect(await countActivitiesOfType("person.restored")).toBe(1);

    const restoreAgain = await repo.restore(person.id);
    expect(restoreAgain.outcome).toBe("already_active");
    expect(restoreAgain.changed).toBe(false);
  });

  it("throws PersonNotFoundError when archiving a missing person", async () => {
    await expect(people().archive("ghost")).rejects.toBeInstanceOf(
      PersonNotFoundError,
    );
  });
});

describe("PersonRepository.list", () => {
  it("filters by status, returns archived separately, and excludes deleted", async () => {
    const clock = new FakeClock();
    const repo = makePersonRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds("p"),
    });
    const e = entities();

    const a = await repo.create({ title: "Active One" });
    clock.advance(1000);
    const b = await repo.create({ title: "To Archive" });
    clock.advance(1000);
    const c = await repo.create({ title: "To Delete" });
    await repo.archive(b.id);
    await e.softDelete(c.id);

    const active = await repo.list({ status: "active" });
    expect(active.items.map((p) => p.id)).toEqual([a.id]);

    const archived = await repo.list({ status: "archived" });
    expect(archived.items.map((p) => p.id)).toEqual([b.id]);

    const all = await repo.list({ status: "all" });
    expect(all.items.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("matches a text query across name, organisation, role, email and tags", async () => {
    const repo = people();
    await repo.create({ title: "Bram Stoker", organisation: "Lyceum" });
    await repo.create({ title: "Nobody", email: "vlad@castle.example" });
    await repo.create({ title: "Tagged", tags: ["dracula"] });

    expect((await repo.list({ query: "lyceum" })).items).toHaveLength(1);
    expect((await repo.list({ query: "castle.example" })).items).toHaveLength(
      1,
    );
    expect((await repo.list({ query: "dracula" })).items).toHaveLength(1);
    expect((await repo.list({ query: "stoker" })).items).toHaveLength(1);
  });

  it("paginates newest-first with a scope-bound cursor", async () => {
    const clock = new FakeClock();
    const repo = makePersonRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds("p"),
    });
    for (let i = 0; i < 5; i += 1) {
      clock.advance(1000);
      await repo.create({ title: `Person ${i}` });
    }
    const first = await repo.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await repo.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    const ids = new Set([
      ...first.items.map((p) => p.id),
      ...second.items.map((p) => p.id),
    ]);
    expect(ids.size).toBe(4);
  });

  it("does not leak People from another workspace", async () => {
    await people(OTHER, "other").create({ title: "Hidden" });
    const mine = await people().list({ status: "all" });
    expect(mine.items).toHaveLength(0);
  });
});
