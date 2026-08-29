import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { canonicalTagKey } from "~/kernel/tags";

/**
 * V2.6 FIND-02 — migration `0049_create_tag_vocabulary.sql`.
 *
 * **This file is the acceptance criterion, not a description of it.**
 * FIND-02's criterion 2 asks for the migration to be proven *"both ways against
 * real D1 on a fixture holding tags in all three existing columns, including a
 * case-differing pair, with the recorded case decision asserted on the result"*,
 * and ADR-112 decision 8 states why an ordinary test cannot discharge that:
 *
 * > A claim that data survived a change of representation is proven by moving
 * > real data through the migration and reading it back — never by a test that
 * > writes and reads the new shape only.
 *
 * So this file does the one thing that proves it. It applies migrations
 * `0001…0048` — the schema as it exists in production TODAY, with
 * `person_details.tags`, `asset_details.tags` and `note_details.tags` still
 * present — writes owner-shaped data into those three columns, and only THEN
 * applies `0049`. Every assertion below reads the result. A test that seeded
 * `workspace_tags` directly would pass with the data-carrying half of the
 * migration deleted, which is precisely the failure V2.5's STEER-02 review
 * found surviving 210 export tests.
 *
 * The fixture holds, deliberately and by name:
 *
 *   - tags on People, on Assets and on Notes;
 *   - a tag OVERLAPPING all three (`errand`), so convergence is visible;
 *   - a CASE-DIFFERING trio (`Errand` / `ERRAND` / `errand`), which is the
 *     recorded case decision's whole subject;
 *   - a tag whose only difference is INTERNAL WHITESPACE (`Deep  Work`), the
 *     other way two tags can be the same tag;
 *   - MULTIPLE tags on one record, and records with NONE;
 *   - a second WORKSPACE, so isolation is proven rather than assumed;
 *   - a soft-DELETED record that still carries a tag, because a migration that
 *     silently drops the tags of deleted data is still losing data.
 *
 * `MIGRATION_TEST_DB` is the database the pool leaves EMPTY for exactly this —
 * the same staged-application mechanism `migration-0002`, `migration-0003` and
 * `spine-migration` use.
 */

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-01-01T00:00:00.000Z";
const WS = "ws_find02";
const OTHER = "ws_find02_other";

/** Everything except `0049`, which is the last committed migration. */
function migrationsBefore0049() {
  const all = env.TEST_MIGRATIONS;
  const index = all.findIndex((migration) =>
    migration.name.startsWith("0049_"),
  );
  // A guard rather than a slice(0, -1): if a later migration is added, this test
  // must keep applying everything BEFORE 0049 rather than silently dropping the
  // new one and testing a schema nobody ships.
  expect(index, "0049 must be present in the migration list").toBeGreaterThan(
    0,
  );
  return all.slice(0, index);
}

async function workspace(id: string): Promise<void> {
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
  )
    .bind(id, AT, AT)
    .run();
}

async function entity(
  ws: string,
  id: string,
  type: string,
  title: string,
  deletedAt: string | null = null,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ws, type, title, AT, AT, deletedAt)
    .run();
}

async function legacyPerson(
  ws: string,
  id: string,
  tags: readonly string[],
  deletedAt: string | null = null,
): Promise<void> {
  await entity(ws, id, "person", `Person ${id}`, deletedAt);
  await DB.prepare(
    `INSERT INTO person_details (workspace_id, entity_id, first_name, tags, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(ws, id, `First ${id}`, JSON.stringify(tags), AT)
    .run();
}

async function legacyAsset(
  ws: string,
  id: string,
  tags: readonly string[],
): Promise<void> {
  await entity(ws, id, "asset", `Asset ${id}`);
  await DB.prepare(
    `INSERT INTO asset_details (workspace_id, entity_id, asset_type, status, model, tags, updated_at)
     VALUES (?, ?, 'tool', 'active', ?, ?, ?)`,
  )
    .bind(ws, id, `Model ${id}`, JSON.stringify(tags), AT)
    .run();
}

async function legacyNote(
  ws: string,
  id: string,
  tags: readonly string[],
): Promise<void> {
  await entity(ws, id, "note", `Note ${id}`);
  await DB.prepare(
    `INSERT INTO note_details (workspace_id, entity_id, content, tags, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(ws, id, `Body of ${id}`, JSON.stringify(tags), AT)
    .run();
}

/** The vocabulary, as `key -> label`. */
async function vocabulary(ws: string): Promise<Map<string, string>> {
  const result = await DB.prepare(
    `SELECT tag_key, label FROM workspace_tags WHERE workspace_id = ? ORDER BY tag_key`,
  )
    .bind(ws)
    .all<{ tag_key: string; label: string }>();
  return new Map(
    (result.results ?? []).map((row) => [row.tag_key, row.label] as const),
  );
}

/** One entity's canonical tag keys, ordered. */
async function tagsOf(ws: string, entityId: string): Promise<string[]> {
  const result = await DB.prepare(
    `SELECT tag_key FROM entity_tags
      WHERE workspace_id = ? AND entity_id = ? ORDER BY tag_key`,
  )
    .bind(ws, entityId)
    .all<{ tag_key: string }>();
  return (result.results ?? []).map((row) => row.tag_key);
}

async function tableSql(name: string): Promise<string> {
  const row = await DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  )
    .bind(name)
    .first<{ sql: string }>();
  return row?.sql ?? "";
}

beforeAll(async () => {
  /* ---- the schema as it is TODAY, before 0049 -------------------------- */
  await applyD1Migrations(DB, migrationsBefore0049());

  await workspace(WS);
  await workspace(OTHER);

  /* ---- owner data in the three legacy columns -------------------------- */
  // People: the FIRST source rank, so its spelling is the one the vocabulary
  // keeps. Also the internal-whitespace case, and a multi-tag record.
  await legacyPerson(WS, "p_coach", ["Errand", "Deep  Work"]);
  await legacyPerson(WS, "p_none", []);
  // A soft-deleted Person that still carries a tag.
  await legacyPerson(WS, "p_gone", ["Archive Only"], AT);

  // Assets: a SHOUTED spelling of the same tag, plus one of its own.
  await legacyAsset(WS, "a_bike", ["ERRAND", "garage"]);
  await legacyAsset(WS, "a_bare", []);

  // Notes: the lower-cased spelling NOTES-02 stored, and two more.
  await legacyNote(WS, "n_list", ["errand", "reading"]);
  await legacyNote(WS, "n_deep", ["deep work"]);
  await legacyNote(WS, "n_empty", []);

  // A second workspace, whose tags must stay entirely its own.
  await legacyNote(OTHER, "n_other", ["errand", "private"]);

  /* ---- and only NOW, the migration under test -------------------------- */
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0049 — three tag columns converge on one vocabulary", () => {
  it("carries every tag from all THREE legacy columns", async () => {
    // Not "the tables exist" — every tag the fixture wrote, on the record that
    // wrote it, read back out of the new representation.
    expect(await tagsOf(WS, "p_coach")).toEqual(["deep work", "errand"]);
    expect(await tagsOf(WS, "a_bike")).toEqual(["errand", "garage"]);
    expect(await tagsOf(WS, "n_list")).toEqual(["errand", "reading"]);
    expect(await tagsOf(WS, "n_deep")).toEqual(["deep work"]);
  });

  it("loses no tag: the vocabulary is exactly the fixture's distinct tags", async () => {
    const vocab = await vocabulary(WS);
    expect([...vocab.keys()]).toEqual([
      "archive only",
      "deep work",
      "errand",
      "garage",
      "reading",
    ]);
  });

  it("applies the recorded CASE decision: one identity, the first spelling shown", async () => {
    const vocab = await vocabulary(WS);
    // `Errand` (Person), `ERRAND` (Asset) and `errand` (Note) are ONE tag — the
    // defect DEBT-182 describes, closed. The identity is the folded key; the
    // label is the FIRST spelling, and the source order People -> Assets ->
    // Notes is what makes "first" a rule rather than an accident of row order.
    expect(vocab.get("errand")).toBe("Errand");
    expect(canonicalTagKey("ERRAND")).toBe("errand");
    // Three records, one tag, three rows in the join — never three tags.
    const rows = await DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_tags WHERE workspace_id = ? AND tag_key = 'errand'`,
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(rows?.n).toBe(3);
  });

  it("treats a whitespace-differing pair as ONE tag, keeping the typed spelling", async () => {
    const vocab = await vocabulary(WS);
    // `Deep  Work` (two spaces, from People) and `deep work` (from Notes).
    expect(vocab.get("deep work")).toBe("Deep Work");
    expect(await tagsOf(WS, "n_deep")).toEqual(["deep work"]);
  });

  it("creates no duplicate canonical tag", async () => {
    const result = await DB.prepare(
      `SELECT tag_key, COUNT(*) AS n FROM workspace_tags
        WHERE workspace_id = ? GROUP BY tag_key HAVING n > 1`,
    )
      .bind(WS)
      .all<{ tag_key: string }>();
    expect(result.results ?? []).toEqual([]);
    // And every stored key really is its own canonical form, so nothing folded
    // by one engine and not the other slipped through.
    const vocab = await vocabulary(WS);
    for (const [key, label] of vocab) {
      expect(canonicalTagKey(label), `label "${label}"`).toBe(key);
    }
  });

  it("leaves an untagged record untagged, rather than inventing an empty tag", async () => {
    expect(await tagsOf(WS, "p_none")).toEqual([]);
    expect(await tagsOf(WS, "a_bare")).toEqual([]);
    expect(await tagsOf(WS, "n_empty")).toEqual([]);
  });

  it("keeps the tags of a soft-deleted record", async () => {
    // A record the owner can still restore keeps what it was labelled with.
    expect(await tagsOf(WS, "p_gone")).toEqual(["archive only"]);
  });

  it("isolates workspaces: one workspace's tags never reach another", async () => {
    expect([...(await vocabulary(OTHER)).keys()]).toEqual([
      "errand",
      "private",
    ]);
    expect(await tagsOf(OTHER, "n_other")).toEqual(["errand", "private"]);
    // `errand` exists in BOTH, as two independent rows — a vocabulary is a
    // workspace's own, and convergence stops at the boundary.
    const shared = await DB.prepare(
      `SELECT workspace_id FROM workspace_tags WHERE tag_key = 'errand' ORDER BY workspace_id`,
    ).all<{ workspace_id: string }>();
    expect((shared.results ?? []).map((row) => row.workspace_id)).toEqual([
      WS,
      OTHER,
    ]);
    // And no attachment crossed: the other workspace's Note is not in this one.
    expect(await tagsOf(WS, "n_other")).toEqual([]);
  });
});

describe("migration 0049 — the legacy columns are gone", () => {
  it("declares no tags column on any of the three tables", async () => {
    for (const table of ["person_details", "asset_details", "note_details"]) {
      const sql = await tableSql(table);
      expect(sql, `${table} still declares a tags column`).not.toMatch(
        /\btags\b/,
      );
    }
  });

  it("refuses a write naming a removed column", async () => {
    // The storage boundary is the last line of defence: with the column gone, a
    // write that still names it must fail loudly rather than be ignored, so a
    // surface that bypassed the vocabulary cannot half-work.
    await expect(
      DB.prepare(
        `INSERT INTO note_details (workspace_id, entity_id, content, tags, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(WS, "n_illegal", "x", "[]", AT)
        .run(),
    ).rejects.toThrow();
  });
});

describe("migration 0049 — the rebuild preserved the tables it rebuilt", () => {
  it("round-trips every OTHER person_details value", async () => {
    const row = await DB.prepare(
      `SELECT first_name, updated_at, entity_type, archived_at
         FROM person_details WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, "p_coach")
      .first<Record<string, unknown>>();
    // The explicit-column-list INSERT…SELECT exists precisely so a value cannot
    // land in a neighbouring column, and this is what proves it did not.
    expect(row).toEqual({
      first_name: "First p_coach",
      updated_at: AT,
      entity_type: "person",
      archived_at: null,
    });
  });

  it("round-trips every OTHER asset_details value", async () => {
    const row = await DB.prepare(
      `SELECT asset_type, status, model, updated_at
         FROM asset_details WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, "a_bike")
      .first<Record<string, unknown>>();
    expect(row).toEqual({
      asset_type: "tool",
      status: "active",
      model: "Model a_bike",
      updated_at: AT,
    });
  });

  it("keeps the note body byte for byte", async () => {
    const row = await DB.prepare(
      `SELECT content FROM note_details WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, "n_list")
      .first<{ content: string }>();
    expect(row?.content).toBe("Body of n_list");
  });

  it("recreated every index the rebuilt tables owned", async () => {
    const result = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'index' AND tbl_name IN ('person_details', 'asset_details')
          AND name NOT LIKE 'sqlite_autoindex%'
        ORDER BY name`,
    ).all<{ name: string }>();
    expect((result.results ?? []).map((row) => row.name)).toEqual([
      "asset_details_area",
      "asset_details_collection",
      "asset_details_meter",
      "asset_details_owner",
      "asset_details_renewal",
      "asset_details_responsible",
      "asset_details_service",
      "asset_details_status",
      "asset_details_type",
      "asset_details_warranty",
      "person_details_workspace_archived",
    ]);
  });

  it("dropped the staging table it used", async () => {
    const row = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE name = 'tag_migration_0049_staging'`,
    ).first<{ name: string }>();
    expect(row).toBeNull();
  });
});

describe("migration 0049 — the new tables enforce their own rules", () => {
  it("refuses an attachment to an entity that does not exist", async () => {
    await expect(
      DB.prepare(
        `INSERT INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
         VALUES (?, 'no_such_entity', 'errand', ?)`,
      )
        .bind(WS, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses an attachment to a tag that is not in the vocabulary", async () => {
    await expect(
      DB.prepare(
        `INSERT INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
         VALUES (?, 'p_coach', 'never_defined', ?)`,
      )
        .bind(WS, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses a vocabulary row whose key is not its folded label", async () => {
    await expect(
      DB.prepare(
        `INSERT INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at)
         VALUES (?, 'Shouty', 'Shouty', ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses a vocabulary row whose label is a different tag", async () => {
    await expect(
      DB.prepare(
        `INSERT INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at)
         VALUES (?, 'errand-two', 'Something Else', ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("removes an entity's attachments when the entity is destroyed", async () => {
    await entity(WS, "p_purge", "person", "Purge me");
    await DB.prepare(
      `INSERT INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
       VALUES (?, 'p_purge', 'errand', ?)`,
    )
      .bind(WS, AT)
      .run();
    await DB.prepare(`DELETE FROM entities WHERE workspace_id = ? AND id = ?`)
      .bind(WS, "p_purge")
      .run();
    // ON DELETE CASCADE, where `entity_links` chose RESTRICT: a tag attachment
    // is an ATTRIBUTE of a record and cannot outlive it, so no purge path has to
    // learn about tags to stay correct.
    expect(await tagsOf(WS, "p_purge")).toEqual([]);
    // The vocabulary entry itself survives — it is the owner's word, not the
    // record's.
    expect((await vocabulary(WS)).has("errand")).toBe(true);
  });
});
