import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// PROJ-05 corrective — prove the ACTUAL sequential migration 0001 → … → 0008 over
// a database that already contains PRE-EXISTING spine data (an open project, a
// completed project, an Area and a Task — none of which are Projects), mirroring
// the migration-0007 test's approach. We do NOT assume an empty database, and we
// verify the schema/backfill facts a corrective PR must not regress.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-20T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0007 only (everything before PROJ-05).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 7));

  // 2. Seed a workspace with pre-existing spine data: an open Project, a
  // COMPLETED Project, an Area (non-Project) and a Task (non-Project).
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m8', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('area_m8', 'ws_m8', 'area', 'Area', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m8', 'area_m8', 'area', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('open_m8', 'ws_m8', 'project', 'Open project', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m8', 'open_m8', 'project', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('done_m8', 'ws_m8', 'project', 'Completed project', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m8', 'done_m8', 'project', ?)`,
    ).bind(AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES ('deleted_m8', 'ws_m8', 'project', 'Deleted project', ?, ?, ?)`,
    ).bind(AT, AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m8', 'deleted_m8', 'project', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('task_m8', 'ws_m8', 'task', 'Task', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m8', 'task_m8', 'task', NULL)`,
    ),
  ]);

  // 3. Now apply migration 0008 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0007 → 0008 (project_details, additive, existing-data safe)", () => {
  it("keeps project_details STRICT", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_details'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("creates the workspace/archived and workspace/status indexes", async () => {
    const archivedIdx = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'project_details_workspace_archived_idx'",
    ).first<{ name: string }>();
    expect(archivedIdx?.name).toBe("project_details_workspace_archived_idx");
    const statusIdx = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'project_details_workspace_status_idx'",
    ).first<{ name: string }>();
    expect(statusIdx?.name).toBe("project_details_workspace_status_idx");
  });

  it("backfills BOTH the open and the already-completed Project as 'active' (an intentional, documented default — reopening restores a sensible status), NOT the soft-deleted Project", async () => {
    const rows = await DB.prepare(
      "SELECT entity_id, status, archived_at FROM project_details WHERE workspace_id = 'ws_m8' ORDER BY entity_id",
    ).all<{ entity_id: string; status: string; archived_at: string | null }>();
    expect(rows.results).toEqual([
      { entity_id: "done_m8", status: "active", archived_at: null },
      { entity_id: "open_m8", status: "active", archived_at: null },
    ]);
  });

  it("a Project without an explicit row resolves to the documented default (planned) at the application layer", async () => {
    // A NEW project created after the migration has no project_details row until
    // its first settings mutation — `COALESCE(status, 'planned')` is the D1
    // adapter's read-side default (see d1-project-repository.ts /
    // d1-project-settings-repository.ts); prove the raw absence here.
    await DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('new_m8', 'ws_m8', 'project', 'Brand new', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    const row = await DB.prepare(
      "SELECT 1 AS x FROM project_details WHERE workspace_id = 'ws_m8' AND entity_id = 'new_m8'",
    ).first();
    expect(row).toBeNull();
  });

  it("enforces the composite (workspace, entity, type) foreign key — a non-Project entity cannot receive a project_details row", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         VALUES ('ws_m8', 'task_m8', 'active', NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects an invalid status via the CHECK constraint", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         VALUES ('ws_m8', 'open_m8', 'cancelled', NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects a workspace/entity_id mismatch across workspaces (composite FK, not just entity_id)", async () => {
    await DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m8_other', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    let threw = false;
    try {
      // 'open_m8' exists in ws_m8, NOT in ws_m8_other.
      await DB.prepare(
        `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         VALUES ('ws_m8_other', 'open_m8', 'active', NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rerunning the application's upsert path does not create duplicate rows (idempotent PK)", async () => {
    await DB.prepare(
      `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
       VALUES ('ws_m8', 'open_m8', 'on_hold', NULL, ?)
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
         status = excluded.status, updated_at = excluded.updated_at`,
    )
      .bind(AT)
      .run();
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM project_details WHERE workspace_id = 'ws_m8' AND entity_id = 'open_m8'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
    const row = await DB.prepare(
      "SELECT status FROM project_details WHERE workspace_id = 'ws_m8' AND entity_id = 'open_m8'",
    ).first<{ status: string }>();
    expect(row?.status).toBe("on_hold");
  });
});
