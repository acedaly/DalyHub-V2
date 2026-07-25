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

  it("BACKFILLS a pre-existing diary entity with explicit-default details (so the INNER-JOIN read can see it)", async () => {
    const row = await DB.prepare(
      `SELECT entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at
       FROM diary_entry_details WHERE workspace_id = 'ws_m11' AND entity_id = 'diary_m11'`,
    ).first<{
      entry_type: string;
      body: string | null;
      occurred_at: string;
      timezone: string;
      source_channel: string;
      source_reference: string | null;
      updated_at: string;
    }>();
    expect(row).not.toBeNull();
    expect(row?.entry_type).toBe("note");
    expect(row?.body).toBeNull();
    // occurred_at defaults to the entity's created_at (the only truthful signal).
    expect(row?.occurred_at).toBe(AT);
    expect(row?.timezone).toBe("UTC");
    expect(row?.source_channel).toBe("manual");
    expect(row?.source_reference).toBeNull();
    expect(row?.updated_at).toBe(AT);
  });

  it("backfills ONLY diary entities — a non-diary entity gets no diary_entry_details row", async () => {
    const row = await DB.prepare(
      "SELECT 1 AS x FROM diary_entry_details WHERE entity_id = 'note_m11'",
    ).first();
    expect(row).toBeNull();
    // Exactly one backfilled row (the single pre-existing diary entity).
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM diary_entry_details",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
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

  it("accepts a row for a freshly created diary entity, with a NULL (optional) body", async () => {
    await DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('diary_accept', 'ws_m11', 'diary', 'Fresh', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    await DB.prepare(
      `INSERT INTO diary_entry_details
         (workspace_id, entity_id, entry_type, body, occurred_at, timezone, updated_at)
       VALUES ('ws_m11', 'diary_accept', 'reflection', NULL, ?, 'Australia/Sydney', ?)`,
    )
      .bind(AT, AT)
      .run();
    const row = await DB.prepare(
      "SELECT entry_type, body, timezone, source_channel FROM diary_entry_details WHERE entity_id = 'diary_accept'",
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
    await DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('diary_check', 'ws_m11', 'diary', 'Check', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    for (const [entryType, occurredAt] of [
      ["", AT],
      ["note", ""],
    ]) {
      let threw = false;
      try {
        await DB.prepare(
          `INSERT INTO diary_entry_details
             (workspace_id, entity_id, entry_type, occurred_at, timezone, updated_at)
           VALUES ('ws_m11', 'diary_check', ?, ?, 'UTC', ?)`,
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
