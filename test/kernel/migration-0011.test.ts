import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// DIARY-01A — prove the ACTUAL sequential migration 0001 → … → 0011 over a
// database that already contains PRE-EXISTING data (a diary entity, a note and
// a non-diary entity), mirroring the migration-0010 test's approach. We do NOT
// assume an empty database.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-24T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0010 only (everything before DIARY-01A).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 10));

  // 2. Seed pre-existing data: a diary entity, a note and a non-diary entity.
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m11', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('diary_m11', 'ws_m11', 'diary', 'Existing entry', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('note_m11', 'ws_m11', 'note', 'A note', ?, ?)`,
    ).bind(AT, AT),
  ]);

  // 3. Now apply migration 0011 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0010 → 0011 (diary_entry_details, additive, existing-data safe)", () => {
  it("keeps diary_entry_details STRICT", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'diary_entry_details'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("performs NO backfill — an existing diary entity has no details row", async () => {
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM diary_entry_details",
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("enforces the composite (workspace, entity, type) foreign key — a non-diary entity cannot receive a row", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO diary_entry_details
           (workspace_id, entity_id, entry_type, occurred_at, timezone, updated_at)
         VALUES ('ws_m11', 'note_m11', 'note', ?, 'UTC', ?)`,
      )
        .bind(AT, AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("accepts a row for a real diary entity, with a NULL (optional) body", async () => {
    await DB.prepare(
      `INSERT INTO diary_entry_details
         (workspace_id, entity_id, entry_type, body, occurred_at, timezone, updated_at)
       VALUES ('ws_m11', 'diary_m11', 'reflection', NULL, ?, 'Australia/Sydney', ?)`,
    )
      .bind(AT, AT)
      .run();
    const row = await DB.prepare(
      "SELECT entry_type, body, timezone, source_channel FROM diary_entry_details WHERE entity_id = 'diary_m11'",
    ).first<{
      entry_type: string;
      body: string | null;
      timezone: string;
      source_channel: string;
    }>();
    expect(row?.entry_type).toBe("reflection");
    expect(row?.body).toBeNull();
    expect(row?.timezone).toBe("Australia/Sydney");
    // source_channel defaults to 'manual'.
    expect(row?.source_channel).toBe("manual");
  });

  it("rejects an empty entry_type and an empty occurred_at (CHECK constraints)", async () => {
    for (const [entryType, occurredAt] of [
      ["", AT],
      ["note", ""],
    ]) {
      let threw = false;
      try {
        await DB.prepare(
          `INSERT INTO diary_entry_details
             (workspace_id, entity_id, entry_type, occurred_at, timezone, updated_at)
           VALUES ('ws_m11', 'diary_m11', ?, ?, 'UTC', ?)`,
        )
          .bind(entryType, occurredAt, AT)
          .run();
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });

  it("enforces the one-row-per-entity primary key (idempotent upsert path)", async () => {
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM diary_entry_details WHERE entity_id = 'diary_m11'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO diary_entry_details
           (workspace_id, entity_id, entry_type, occurred_at, timezone, updated_at)
         VALUES ('ws_m11', 'diary_m11', 'note', ?, 'UTC', ?)`,
      )
        .bind(AT, AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
