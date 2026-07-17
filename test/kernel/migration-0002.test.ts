import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// FND-03: prove the ACTUAL sequential migration 0001 → 0002 against seeded data.
// This runs on MIGRATION_TEST_DB — a second, deliberately un-migrated local D1
// (see vitest.workers.config.ts) — so we can apply 0001, seed rows under several
// workspace ids, then apply 0002 and observe the real result. We do NOT assume
// the database is empty when 0002 runs.

const DB = env.MIGRATION_TEST_DB;

// Seed rows across three workspace ids, including a soft-deleted one, with
// distinct timestamps so backfilled workspace timestamps are checkable.
const SEED = [
  {
    id: "e1",
    ws: "ws_one",
    type: "task",
    title: "One-A",
    created: "2026-07-17T00:00:01.000Z",
    updated: "2026-07-17T00:00:01.000Z",
    deleted: null as string | null,
  },
  {
    id: "e2",
    ws: "ws_one",
    type: "note",
    title: "One-B (deleted)",
    created: "2026-07-17T00:00:02.000Z",
    updated: "2026-07-17T00:00:09.000Z",
    deleted: "2026-07-17T00:00:09.000Z",
  },
  {
    id: "e3",
    ws: "ws_two",
    type: "task",
    title: "Two-A",
    created: "2026-07-17T00:00:03.000Z",
    updated: "2026-07-17T00:00:03.000Z",
    deleted: null,
  },
  {
    id: "e4",
    ws: "ws_three",
    type: "project",
    title: "Three-A",
    created: "2026-07-17T00:00:04.000Z",
    updated: "2026-07-17T00:00:04.000Z",
    deleted: null,
  },
  {
    // A legacy FND-02 workspace id shape (dotted). FND-02 accepted any non-empty
    // string ≤128 chars; migration 0002 must back-fill it unchanged so it stays
    // resolvable and usable (regression for the workspace-id compatibility fix).
    id: "e5",
    ws: "personal.v1",
    type: "note",
    title: "Legacy-scope note",
    created: "2026-07-17T00:00:05.000Z",
    updated: "2026-07-17T00:00:05.000Z",
    deleted: null,
  },
];

interface EntityRow {
  id: string;
  workspace_id: string;
  type: string;
  title: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

beforeAll(async () => {
  // 1. Apply ONLY migration 0001 first.
  await applyD1Migrations(DB, [env.TEST_MIGRATIONS[0]!]);

  // 2. Seed rows under multiple workspace ids (no FK exists yet at 0001).
  const stmt = DB.prepare(
    `INSERT INTO entities
       (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  await DB.batch(
    SEED.map((r) =>
      stmt.bind(r.id, r.ws, r.type, r.title, r.created, r.updated, r.deleted),
    ),
  );

  // 3. Now apply migration 0002 (only). This file asserts the 0001 → 0002 state
  //    faithfully; the later 0003 (entity_links + the entities parent unique key)
  //    is covered by its own sequential migration test.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 2));
});

describe("migration 0001 → 0002 (existing-data preservation)", () => {
  it("creates a workspace record for every distinct pre-existing workspace_id", async () => {
    const { results } = await DB.prepare(
      "SELECT id FROM workspaces ORDER BY id",
    ).all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual([
      "personal.v1",
      "ws_one",
      "ws_three",
      "ws_two",
    ]);
  });

  it("derives backfilled workspace timestamps from its entities (min/max)", async () => {
    const row = await DB.prepare(
      "SELECT created_at, updated_at FROM workspaces WHERE id = 'ws_one'",
    ).first<{ created_at: string; updated_at: string }>();
    // ws_one owns e1 (created ...01) and e2 (updated ...09).
    expect(row?.created_at).toBe("2026-07-17T00:00:01.000Z");
    expect(row?.updated_at).toBe("2026-07-17T00:00:09.000Z");
  });

  it("preserves every entity row unchanged (ids, types, titles, timestamps, deletion state)", async () => {
    const { results } = await DB.prepare(
      "SELECT * FROM entities ORDER BY id",
    ).all<EntityRow>();
    expect(results).toEqual(
      SEED.map((r) => ({
        id: r.id,
        workspace_id: r.ws,
        type: r.type,
        title: r.title,
        created_at: r.created,
        updated_at: r.updated,
        deleted_at: r.deleted,
      })),
    );
  });

  it("recreates all four access-path indexes on the rebuilt table", async () => {
    const { results } = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entities' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(
      [
        "entities_active_workspace_created_idx",
        "entities_active_workspace_type_created_idx",
        "entities_workspace_created_idx",
        "entities_workspace_type_created_idx",
      ].sort(),
    );
  });

  it("preserves STRICT typing and the CHECK/PK constraints", async () => {
    const { results } = await DB.prepare("PRAGMA table_info(entities)").all<{
      name: string;
      notnull: number;
      pk: number;
    }>();
    const byName = new Map(results.map((c) => [c.name, c]));
    expect(byName.get("id")?.pk).toBe(1);
    expect(byName.get("deleted_at")?.notnull).toBe(0);
    for (const notNull of [
      "workspace_id",
      "type",
      "title",
      "created_at",
      "updated_at",
    ]) {
      expect(byName.get(notNull)?.notnull).toBe(1);
    }
  });

  it("enforces the new foreign key (unknown workspace fails, known succeeds)", async () => {
    // Known workspace → allowed.
    await DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('e_new', 'ws_two', 'task', 'ok', ?, ?)`,
    )
      .bind("2026-07-17T00:01:00.000Z", "2026-07-17T00:01:00.000Z")
      .run();

    // Unknown workspace → rejected by the FK.
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
         VALUES ('e_bad', 'ws_absent', 'task', 'no', ?, ?)`,
      )
        .bind("2026-07-17T00:01:00.000Z", "2026-07-17T00:01:00.000Z")
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("leaves no temporary migration table behind", async () => {
    const row = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities_new'",
    ).first<{ name: string }>();
    expect(row).toBeNull();
  });

  it("leaves foreign keys enabled after migrating", async () => {
    const row = await DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(row?.foreign_keys).toBe(1);
  });
});
