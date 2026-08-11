/**
 * The applied-ledger contract — a migration's FILENAME is its identity, forever.
 *
 * Wrangler records each applied migration in the database's `d1_migrations`
 * table by its COMPLETE FILENAME, and `wrangler d1 migrations apply` applies
 * whatever is not in that table. Three consequences, and the third is the one
 * that bites:
 *
 *   1. a NEW file is applied — that is the point;
 *   2. an UNCHANGED file is skipped, however many times you run it;
 *   3. a RENAMED file is a new file. It is applied again, against a database
 *      that already has its effect.
 *
 * (3) is not theoretical. HARDEN-02 renumbered `0039_add_owner_color_scheme_preference.sql`
 * to `0040_…` to clear a duplicate number, on the reasoning that the migration
 * had merged only hours earlier so nothing could have applied it. That reasoning
 * confused "not deployed to production" with "not applied": the parent commit was
 * on `main`, so every developer database, every CI shard's local D1 and any
 * operator who had run an apply already had the `0039` name in their ledger.
 * Re-running it fails with `duplicate column name: color_scheme` — and because a
 * failed migration stops the run, it takes every later migration with it.
 *
 * So this file is the record that makes the rule enforceable rather than merely
 * written down. It is APPEND-ONLY: adding a migration means adding its name
 * here, in the same commit, and nothing already in the list may ever change.
 * A collision that has reached `main` is recorded in `migration-numbering.test.ts`
 * rather than renumbered, for exactly this reason.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "migrations");

/**
 * Every migration filename that has reached `main`, in the order Wrangler applies
 * them. Append; never edit, reorder or remove.
 */
const SHIPPED_MIGRATIONS: readonly string[] = [
  "0001_create_entities.sql",
  "0002_create_workspaces_and_enforce_scope.sql",
  "0003_create_entity_links.sql",
  "0004_create_activities.sql",
  "0005_create_spine_hierarchy.sql",
  "0006_create_task_details.sql",
  "0007_add_task_waiting.sql",
  "0008_create_project_details.sql",
  "0009_create_goal_details.sql",
  "0010_create_note_details.sql",
  "0011_create_diary_entries.sql",
  "0012_extend_task_planning.sql",
  "0013_create_area_details.sql",
  "0013_create_person_details.sql",
  "0014_create_meeting_details.sql",
  "0015_meeting_follow_up_tasks.sql",
  "0016_create_asset_details.sql",
  "0017_create_owner_app_preferences.sql",
  "0018_create_review_details.sql",
  "0019_notes_knowledge.sql",
  "0020_meeting_held.sql",
  "0021_ux01_tasks_meetings_usability.sql",
  "0022_create_task_saved_views.sql",
  "0023_add_owner_theme_preference.sql",
  "0024_tasks04_daily_driver.sql",
  "0025_asset_history_and_obligations.sql",
  "0026_extend_theme_preference_choices.sql",
  "0027_create_offline_capture_receipts.sql",
  "0028_create_workspace_members.sql",
  "0029_create_review_workflow_state.sql",
  "0030_create_ai_platform.sql",
  "0031_remove_theme_preference.sql",
  "0032_add_entity_icon_keys.sql",
  "0033_add_owner_appearance_preference.sql",
  "0034_create_review_insight_snapshots.sql",
  "0035_create_workspace_restore.sql",
  "0036_generalise_saved_views.sql",
  "0037_task_recurrence_modes.sql",
  "0038_goal_measurement.sql",
  "0039_add_owner_color_scheme_preference.sql",
  "0039_create_capture_credentials.sql",
];

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

/**
 * What `wrangler d1 migrations apply` would run against a database whose
 * `d1_migrations` table already holds `applied` — modelled exactly: the files
 * not present in the ledger, by complete filename, in filename order.
 */
function pendingAgainst(applied: readonly string[]): string[] {
  const ledger = new Set(applied);
  return migrationFiles().filter((filename) => !ledger.has(filename));
}

describe("the applied-migration ledger", () => {
  it("never renames or removes a migration that has shipped", () => {
    const present = new Set(migrationFiles());
    const missing = SHIPPED_MIGRATIONS.filter((name) => !present.has(name));

    expect(
      missing,
      "A migration that has already been applied is gone from `migrations/`. If it " +
        "was RENAMED, put the name back: Wrangler keys `d1_migrations` on the " +
        "complete filename, so the new name is applied again on every database " +
        "that has the old one — which fails on the second `ALTER`/`CREATE` and " +
        "blocks every migration after it. If it was DELETED, the same applies in " +
        "reverse: the ledger still names it, and the schema it created is now " +
        "undescribed.",
    ).toEqual([]);
  });

  it("only ever appends, so the shipped prefix is stable", () => {
    const files = migrationFiles();
    const prefix = files.slice(0, SHIPPED_MIGRATIONS.length);

    expect(
      prefix,
      "The shipped migrations are no longer the head of `migrations/` in the same " +
        "order. A new migration must sort AFTER every applied one (claim the next " +
        "free number), because Wrangler applies in filename order and a file " +
        "inserted before an applied one still runs last — leaving the sequence a " +
        "database actually applied different from the one this directory reads as.",
    ).toEqual([...SHIPPED_MIGRATIONS]);
  });

  it("re-runs nothing on a database that already applied the parent commit", () => {
    // The upgrade path this repository actually has: a database at the parent
    // commit holds every shipped migration, and upgrading to HEAD must apply only
    // what is genuinely new. Anything already in that ledger re-running is the
    // outage above.
    expect(
      pendingAgainst(SHIPPED_MIGRATIONS).filter((filename) =>
        SHIPPED_MIGRATIONS.includes(filename),
      ),
    ).toEqual([]);
  });

  it("applies every migration exactly once on a fresh database, and nothing on the second run", () => {
    // A fresh database has an empty ledger, so the first pass applies all of
    // them; the ledger then names them all and the second pass applies none.
    const first = pendingAgainst([]);
    expect(first).toEqual(migrationFiles());
    expect(pendingAgainst(first)).toEqual([]);
  });
});
