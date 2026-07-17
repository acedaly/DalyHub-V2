import { beforeEach, describe, expect, it } from "vitest";

import {
  WorkspaceConflictError,
  WorkspaceStorageError,
  WorkspaceValidationError,
  parseWorkspaceId,
  type WorkspaceId,
} from "~/kernel/workspaces";
import { D1WorkspaceRepository } from "~/platform/storage/d1";
import {
  FakeClock,
  countWorkspaces,
  makeWorkspaceRepository,
  resetTables,
} from "./support";

describe("D1WorkspaceRepository", () => {
  let clock: FakeClock;

  beforeEach(async () => {
    await resetTables();
    clock = new FakeClock("2026-07-17T00:00:00.000Z");
  });

  it("creates a workspace with a generated id and controlled clock", async () => {
    let n = 0;
    const idGenerator = () => parseWorkspaceId(`gen-${++n}`);
    const repo = makeWorkspaceRepository({ clock: clock.now, idGenerator });

    const created = await repo.create();
    expect(created).toEqual({
      id: "gen-1",
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
    });
    expect(await countWorkspaces()).toBe(1);
  });

  it("generates a UUID id by default", async () => {
    const created = await makeWorkspaceRepository({
      clock: clock.now,
    }).create();
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("adopts an explicitly supplied id", async () => {
    const repo = makeWorkspaceRepository({ clock: clock.now });
    const id = parseWorkspaceId("adopted-scope");
    const created = await repo.create({ id });
    expect(created.id).toBe("adopted-scope");
    expect(await repo.getById(id)).toEqual(created);
  });

  it("fails a duplicate id safely without overwriting", async () => {
    const repo = makeWorkspaceRepository({ clock: clock.now });
    const id = parseWorkspaceId("dupe");
    await repo.create({ id });

    clock.advance(60_000);
    await expect(repo.create({ id })).rejects.toThrow(WorkspaceConflictError);

    // The original timestamps are intact — nothing was overwritten.
    const stored = await repo.getById(id);
    expect(stored?.createdAt).toEqual(new Date("2026-07-17T00:00:00.000Z"));
    expect(await countWorkspaces()).toBe(1);
  });

  it("accepts a legacy FND-02 id shape (no charset restriction)", async () => {
    const repo = makeWorkspaceRepository({ clock: clock.now });
    const id = parseWorkspaceId("personal.v1");
    const created = await repo.create({ id });
    expect(created.id).toBe("personal.v1");
    expect(await repo.exists(id)).toBe(true);
  });

  it("rejects a supplied id that is invalid (unsafe cast) without writing", async () => {
    const repo = makeWorkspaceRepository({ clock: clock.now });
    // An id that defeats the WorkspaceId brand with a cast. Empty and over-long
    // are the invalid cases under the (FND-02-compatible) rules.
    await expect(
      repo.create({ id: "" as unknown as WorkspaceId }),
    ).rejects.toThrow(WorkspaceValidationError);
    await expect(
      repo.create({ id: "a".repeat(200) as unknown as WorkspaceId }),
    ).rejects.toThrow(WorkspaceValidationError);
    // The bad ids were rejected before any write.
    expect(await countWorkspaces()).toBe(0);
  });

  it("rejects an invalid injected id generator without writing", async () => {
    const repo = makeWorkspaceRepository({
      clock: clock.now,
      idGenerator: () => "" as unknown as WorkspaceId,
    });
    await expect(repo.create()).rejects.toThrow(WorkspaceValidationError);
    expect(await countWorkspaces()).toBe(0);
  });

  it("getById returns null for an unknown workspace", async () => {
    expect(
      await makeWorkspaceRepository().getById(parseWorkspaceId("missing")),
    ).toBeNull();
  });

  it("exists reflects presence", async () => {
    const repo = makeWorkspaceRepository({ clock: clock.now });
    const id = parseWorkspaceId("present");
    expect(await repo.exists(id)).toBe(false);
    await repo.create({ id });
    expect(await repo.exists(id)).toBe(true);
  });

  it("maps a raw storage failure to a safe WorkspaceStorageError", async () => {
    // A fake D1 whose query throws with a message full of internals. The
    // adapter must NOT let those internals escape.
    const secret = "SQLITE_ERROR: no such table at /var/lib/d1/secret.sqlite";
    const fakeDb = {
      prepare() {
        return {
          bind() {
            return {
              first() {
                throw new Error(secret);
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const repo = new D1WorkspaceRepository(fakeDb);
    let caught: unknown;
    try {
      await repo.exists("whatever" as WorkspaceId);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WorkspaceStorageError);
    expect((caught as Error).message).not.toContain("secret.sqlite");
    expect((caught as Error).message).not.toContain("SQLITE");
    // The cause is retained for server-side logging, not surfaced in the message.
    expect((caught as WorkspaceStorageError).cause).toBeInstanceOf(Error);
  });
});
