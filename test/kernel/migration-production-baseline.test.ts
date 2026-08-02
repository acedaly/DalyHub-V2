import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * V2 RELEASE CLOSURE — can the CURRENTLY DEPLOYED production schema migrate to V2
 * without destructive surprises?
 *
 * The per-migration tests (`migration-0007` … `migration-0024`) each prove ONE
 * migration over data shaped for it. None of them answers the question a deployment
 * actually asks, which is the whole sequence at once against the schema production
 * is really on. Production has migrations **`0001`–`0005`** applied (verified
 * 2026-07-18; see `docs/development/DEPLOYMENT.md`), so V2 is a twenty-one-migration
 * step — `0006` through `0026` — over a live database with real rows in it.
 *
 * So this test does exactly that, against a database that is NOT empty:
 *
 *   1. apply `0001`–`0005` only — the deployed production schema;
 *   2. seed a representative workspace through every table that schema has:
 *      workspaces, entities (all four spine types, plus a soft-deleted one),
 *      spine_records (including a completed task), entity_links (including an
 *      explicitly unlinked one), activities and activity_subjects;
 *   3. apply the FULL committed sequence over the top;
 *   4. assert nothing was lost, nothing was rewritten, every V2 table exists, and
 *      the one migration in the range that backfills did so correctly.
 *
 * Deliberately NOT a schema snapshot test: a snapshot would fail on every future
 * migration and teach nobody anything. It asserts the properties a deployment
 * depends on — data survival, referential integrity, and the single backfill.
 */

const DB = env.MIGRATION_TEST_DB;
const WS = "ws_prod_baseline";
const AT = "2026-07-18T00:00:00.000Z";
/** Distinct from `AT`, so the 0011 backfill's `occurred_at = created_at` is provable. */
const DIARY_CREATED_AT = "2026-07-01T09:30:00.000Z";

/**
 * The migrations production already has. Selected by NAME, never by array index:
 * `migrations/` contains a recorded duplicate `0013` (DEBT-40), so a positional
 * `slice()` is one merge away from silently selecting the wrong set.
 */
const DEPLOYED_PREFIXES = ["0001", "0002", "0003", "0004", "0005"];

type Migrations = typeof env.TEST_MIGRATIONS;
type MigrationEntry = Migrations[number];

function migrationsUpToDeployed(): Migrations {
  return env.TEST_MIGRATIONS.filter((migration: MigrationEntry) =>
    DEPLOYED_PREFIXES.some((prefix) => migration.name.startsWith(prefix)),
  );
}

/** Rows we expect to still be there, unchanged, on the far side of the upgrade. */
const SEEDED_ENTITIES = [
  { id: "e_area", type: "area", title: "Home" },
  { id: "e_goal", type: "goal", title: "Run a half-marathon" },
  { id: "e_project", type: "project", title: "12-week training plan" },
  { id: "e_task_open", type: "task", title: "Monday: 5km easy run" },
  { id: "e_task_done", type: "task", title: "Buy running shoes" },
  { id: "e_task_deleted", type: "task", title: "Abandoned idea" },
] as const;

beforeAll(async () => {
  // 1. The schema production is actually on.
  await applyD1Migrations(DB, migrationsUpToDeployed());

  // 2. A workspace with real content in every table that schema has.
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
    ).bind(WS, AT, AT),
    ...SEEDED_ENTITIES.map((entity) =>
      DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        entity.id,
        WS,
        entity.type,
        entity.title,
        AT,
        AT,
        entity.id === "e_task_deleted" ? AT : null,
      ),
    ),
    // A note entity: type `note` is not reserved by the spine, and production
    // could hold arbitrary entity types by the time V2 lands.
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('e_note', ?, 'note', 'A note that predates note_details', ?, ?)`,
    ).bind(WS, AT, AT),
    // Two LEGACY diary entities. Migration 0011 is the second backfill in the
    // range and the only one that touches these, so an upgrade test without them
    // would stay green if 0011 stopped preserving a pre-existing journal.
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('e_diary', ?, 'diary', 'A moment recorded before the Diary slice existed', ?, ?)`,
    ).bind(WS, DIARY_CREATED_AT, AT),
    // Deliberately SOFT-DELETED. Unlike 0008, 0011's backfill has no
    // `deleted_at IS NULL` filter, so it claims this row too — which is correct
    // (a restored entry must still have a place on the Timeline) and is exactly
    // the kind of difference between two backfills that a test should pin.
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES ('e_diary_deleted', ?, 'diary', 'A deleted moment', ?, ?, ?)`,
    ).bind(WS, DIARY_CREATED_AT, AT, AT),
  ]);

  await DB.batch([
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_area', 'area', NULL)`,
    ).bind(WS),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_goal', 'goal', NULL)`,
    ).bind(WS),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_project', 'project', NULL)`,
    ).bind(WS),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_task_open', 'task', NULL)`,
    ).bind(WS),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_task_done', 'task', ?)`,
    ).bind(WS, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (?, 'e_task_deleted', 'task', NULL)`,
    ).bind(WS),
  ]);

  await DB.batch([
    // Structural parentage, exercising the partial unique index 0005 added.
    DB.prepare(
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l_goal_area', ?, 'e_goal', 'e_area', 'goal.belongs_to_area', ?, ?, NULL)`,
    ).bind(WS, AT, AT),
    DB.prepare(
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l_project_goal', ?, 'e_project', 'e_goal', 'project.advances_goal', ?, ?, NULL)`,
    ).bind(WS, AT, AT),
    DB.prepare(
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l_task_project', ?, 'e_task_open', 'e_project', 'task.belongs_to_project', ?, ?, NULL)`,
    ).bind(WS, AT, AT),
    // An EXPLICITLY UNLINKED link. X-04 exports these with their state, and a
    // migration that quietly revived or dropped one would be a real defect.
    DB.prepare(
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l_unlinked', ?, 'e_note', 'e_project', 'link.related', ?, ?, ?)`,
    ).bind(WS, AT, AT, AT),
  ]);

  await DB.batch([
    DB.prepare(
      `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES ('a_created', ?, 'entity.created', 'user', 'owner-subject', ?, '{}')`,
    ).bind(WS, AT),
    DB.prepare(
      `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES ('a_linked', ?, 'entity_link.created', 'system', NULL, ?, '{}')`,
    ).bind(WS, AT),
    DB.prepare(
      `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (?, 'a_created', 'e_project', 'subject')`,
    ).bind(WS),
    // One event naming TWO subjects — the shape FND-05 uses for link events.
    DB.prepare(
      `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (?, 'a_linked', 'e_task_open', 'source')`,
    ).bind(WS),
    DB.prepare(
      `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (?, 'a_linked', 'e_project', 'target')`,
    ).bind(WS),
  ]);

  // 3. The upgrade production is about to perform: 0006 → the head, over live data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("production baseline (0001-0005) → V2 (committed head)", () => {
  it("applies the whole remaining sequence over a populated database", async () => {
    const applied = await DB.prepare(
      `SELECT name FROM d1_migrations ORDER BY name`,
    ).all<{ name: string }>();
    const names = applied.results.map((row) => row.name);

    // Every committed migration is applied exactly once, in order, and the ones
    // production already had are NOT re-applied under a different name.
    expect(names.length).toBe(env.TEST_MIGRATIONS.length);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    // Pinned to the committed set rather than to a hard-coded number, so a new
    // migration is covered by this test the moment it lands instead of failing it.
    const committed = env.TEST_MIGRATIONS.map(
      (migration: MigrationEntry) => migration.name,
    ).sort();
    expect(names).toEqual(committed);
    // THEME-02 rebuilt `owner_app_preferences` to widen the theme CHECK. It is a
    // rebuild over a populated table, so it is named explicitly here: this test is
    // the one that proves the whole sequence survives real rows.
    expect(names.some((name) => name.startsWith("0026"))).toBe(true);
  });

  it("loses no entity, and rewrites none of them", async () => {
    const rows = await DB.prepare(
      `SELECT id, type, title, created_at, updated_at, deleted_at
         FROM entities WHERE workspace_id = ? ORDER BY id`,
    )
      .bind(WS)
      .all<{
        id: string;
        type: string;
        title: string;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>();

    // The seeded spine entities, plus the note and the two diary entities.
    expect(rows.results.length).toBe(SEEDED_ENTITIES.length + 3);
    for (const seeded of SEEDED_ENTITIES) {
      const row = rows.results.find((candidate) => candidate.id === seeded.id);
      expect(row, seeded.id).toBeDefined();
      expect(row!.type).toBe(seeded.type);
      expect(row!.title).toBe(seeded.title);
      expect(row!.created_at).toBe(AT);
      expect(row!.updated_at).toBe(AT);
    }

    // Soft-deletion is preserved on exactly the row that carried it. A migration
    // that resurrected a deleted record, or deleted a live one, fails here.
    const deleted = rows.results.filter((row) => row.deleted_at !== null);
    expect(deleted.map((row) => row.id).sort()).toEqual([
      "e_diary_deleted",
      "e_task_deleted",
    ]);
  });

  it("preserves spine membership and completion", async () => {
    const rows = await DB.prepare(
      `SELECT entity_id, kind, completed_at FROM spine_records
        WHERE workspace_id = ? ORDER BY entity_id`,
    )
      .bind(WS)
      .all<{ entity_id: string; kind: string; completed_at: string | null }>();

    expect(rows.results.length).toBe(6);
    const completed = rows.results.filter((row) => row.completed_at !== null);
    expect(completed.map((row) => row.entity_id)).toEqual(["e_task_done"]);
    expect(completed[0]!.completed_at).toBe(AT);
  });

  it("preserves every link, INCLUDING one that was explicitly unlinked", async () => {
    const rows = await DB.prepare(
      `SELECT id, type, deleted_at FROM entity_links
        WHERE workspace_id = ? ORDER BY id`,
    )
      .bind(WS)
      .all<{ id: string; type: string; deleted_at: string | null }>();

    expect(rows.results.map((row) => row.id)).toEqual([
      "l_goal_area",
      "l_project_goal",
      "l_task_project",
      "l_unlinked",
    ]);
    // "Explicitly unlinked, stays unlinked" survives the upgrade.
    expect(
      rows.results.find((row) => row.id === "l_unlinked")!.deleted_at,
    ).toBe(AT);
  });

  it("preserves the Activity stream and its multi-subject associations", async () => {
    const activities = await DB.prepare(
      `SELECT id, type, actor_type, actor_id, occurred_at FROM activities
        WHERE workspace_id = ? ORDER BY id`,
    )
      .bind(WS)
      .all<{
        id: string;
        type: string;
        actor_type: string;
        actor_id: string | null;
        occurred_at: string;
      }>();
    expect(activities.results.map((row) => row.id)).toEqual([
      "a_created",
      "a_linked",
    ]);
    expect(activities.results[0]!.actor_id).toBe("owner-subject");
    expect(activities.results[1]!.actor_type).toBe("system");

    const subjects = await DB.prepare(
      `SELECT activity_id, entity_id, role FROM activity_subjects
        WHERE workspace_id = ? ORDER BY activity_id, entity_id`,
    )
      .bind(WS)
      .all<{ activity_id: string; entity_id: string; role: string }>();
    expect(subjects.results.length).toBe(3);
    expect(
      subjects.results.filter((row) => row.activity_id === "a_linked").length,
    ).toBe(2);
  });

  it("creates every V2 table the application queries unconditionally", async () => {
    const rows = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).all<{ name: string }>();
    const tables = new Set(rows.results.map((row) => row.name));

    // The detail slices and child records a V2 loader reads WITHOUT checking that
    // the table exists. Any one of these missing is a production 500 on deploy.
    for (const table of [
      "task_details",
      "project_details",
      "goal_details",
      "note_details",
      "area_details",
      "person_details",
      "diary_entry_details",
      "meeting_details",
      "meeting_items",
      "asset_details",
      "asset_events",
      "asset_obligations",
      "review_details",
      "review_sections",
      "owner_app_preferences",
      "task_saved_views",
    ]) {
      expect(tables.has(table), `missing table: ${table}`).toBe(true);
    }
  });

  it("runs BOTH backfills in the range, and runs each correctly", async () => {
    // 0008 is the FIRST of exactly two migrations in 0006-0025 that populate rows
    // from existing data: every pre-existing, NON-DELETED Project gets a
    // `project_details` row.
    const details = await DB.prepare(
      `SELECT entity_id, status, archived_at FROM project_details
        WHERE workspace_id = ? ORDER BY entity_id`,
    )
      .bind(WS)
      .all<{ entity_id: string; status: string; archived_at: string | null }>();

    expect(details.results.length).toBe(1);
    expect(details.results[0]!.entity_id).toBe("e_project");
    expect(details.results[0]!.status).toBe("active");
    expect(details.results[0]!.archived_at).toBeNull();

    // 0011 is the SECOND, and it behaves differently in a way that matters: every
    // pre-existing `diary` entity gets a `diary_entry_details` row with documented
    // defaults, and — unlike 0008 — it has NO `deleted_at IS NULL` filter, so a
    // soft-deleted entry is backfilled too. That is correct (a restored entry must
    // still have a place on the Timeline), and it is pinned here so a future change
    // to either rule is a failing test rather than a silent loss of someone's
    // journal.
    const diary = await DB.prepare(
      `SELECT entity_id, entry_type, body, occurred_at, timezone, source_channel,
              source_reference, updated_at
         FROM diary_entry_details WHERE workspace_id = ? ORDER BY entity_id`,
    )
      .bind(WS)
      .all<{
        entity_id: string;
        entry_type: string;
        body: string | null;
        occurred_at: string;
        timezone: string;
        source_channel: string;
        source_reference: string | null;
        updated_at: string;
      }>();

    expect(diary.results.map((row) => row.entity_id)).toEqual([
      "e_diary",
      "e_diary_deleted",
    ]);
    for (const row of diary.results) {
      expect(row.entry_type).toBe("note");
      expect(row.body).toBeNull();
      // The only truthful chronology signal a legacy row has is its own
      // `created_at` — NOT the migration's run time, and not `updated_at`.
      expect(row.occurred_at).toBe(DIARY_CREATED_AT);
      expect(row.timezone).toBe("UTC");
      expect(row.source_channel).toBe("manual");
      expect(row.source_reference).toBeNull();
      expect(row.updated_at).toBe(AT);
    }

    // Everything else is additive with no backfill, which is what makes
    // migrate-then-deploy and deploy-then-migrate both safe. A pre-existing Task,
    // Area, Note or Person gets NO detail row until its first edit, and the read
    // boundary resolves the absence to defaults.
    for (const table of ["task_details", "area_details", "note_details"]) {
      const count = await DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id = ?`,
      )
        .bind(WS)
        .first<{ n: number }>();
      expect(count!.n, `${table} should not be backfilled`).toBe(0);
    }
  });

  it("leaves referential integrity intact", async () => {
    // `PRAGMA integrity_check` is not authorised on D1, so the assertion is the
    // one that actually matters here: no row references a parent that is gone.
    const violations = await DB.prepare(`PRAGMA foreign_key_check`).all();
    expect(violations.results).toEqual([]);

    // Explicit orphan checks over the composite keys 0002-0005 introduced, because
    // a table REBUILT by a later migration (0012, 0015, 0021 all copy-and-rename)
    // is exactly where a foreign key can be silently dropped rather than violated.
    const orphans = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM entities e
            LEFT JOIN workspaces w ON w.id = e.workspace_id
           WHERE w.id IS NULL) AS entities_without_workspace,
         (SELECT COUNT(*) FROM spine_records s
            LEFT JOIN entities e
              ON e.workspace_id = s.workspace_id AND e.id = s.entity_id
           WHERE e.id IS NULL) AS spine_without_entity,
         (SELECT COUNT(*) FROM entity_links l
            LEFT JOIN entities e
              ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
           WHERE e.id IS NULL) AS links_without_source,
         (SELECT COUNT(*) FROM activity_subjects s
            LEFT JOIN activities a
              ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
           WHERE a.id IS NULL) AS subjects_without_activity`,
    ).first<Record<string, number>>();
    expect(orphans).toEqual({
      entities_without_workspace: 0,
      spine_without_entity: 0,
      links_without_source: 0,
      subjects_without_activity: 0,
    });
  });

  it("keeps the workspace boundary: the upgrade invents no cross-workspace row", async () => {
    for (const [table, column] of [
      ["entities", "workspace_id"],
      ["entity_links", "workspace_id"],
      ["activities", "workspace_id"],
      ["spine_records", "workspace_id"],
      ["project_details", "workspace_id"],
    ] as const) {
      const rows = await DB.prepare(
        `SELECT DISTINCT ${column} AS workspace FROM ${table}`,
      ).all<{ workspace: string }>();
      expect(
        rows.results.map((row) => row.workspace),
        `${table} gained a workspace it was never given`,
      ).toEqual([WS]);
    }
  });
});
