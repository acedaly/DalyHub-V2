/**
 * SET-02 — backup and restore against the REAL Workers runtime and D1.
 *
 * This file is the evidence for the roadmap item's defining rule: *an untested
 * restore is not a backup*. Everything else in the change is machinery; this is
 * the proof.
 *
 * The central test is the round trip. It seeds a realistic workspace through the
 * production repositories (`workspace-fixture.ts` — the SAME workspace the X-04
 * export suite is proved against), takes a real backup archive through the
 * canonical export path, loses the workspace, restores the archive into a clean
 * target workspace, re-exports THAT, and asserts the two snapshots are
 * semantically equal — every record, every id, every relationship, every
 * Activity event, every archived and soft-deleted row, byte-for-byte Markdown
 * included. The only permitted differences are named and explained below rather
 * than smoothed away until the assertion passes.
 *
 * The rest of the file proves the safety properties, because a restore that
 * works on the happy path and corrupts a workspace on the unhappy one is worse
 * than no restore at all:
 *
 *   - a corrupt, unversioned, future-versioned or structurally impossible backup
 *     is refused BEFORE any write;
 *   - a failed cutover leaves the workspace exactly as it was;
 *   - a failed safety backup aborts a destructive restore;
 *   - a failed verification is reported as a failure, not as success;
 *   - a crafted archive cannot write into another workspace;
 *   - a restore manufactures no Activity.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  SNAPSHOT_COLLECTION_ORDER,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import {
  RestoreFailedError,
  RestoreRejectedError,
  type RestoreVerification,
  type WorkspaceRestoreRepository,
} from "~/kernel/restore";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  createZipArchive,
  sha256Hex,
  textEntry,
} from "~/platform/export";
import {
  acknowledgeSafetyBackup,
  applyRestore,
  createSafetyBackup,
  prepareRestore,
  readBackupArchive,
  readZipArchive,
  type RestoreDependencies,
} from "~/platform/restore";
import {
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";

import {
  ensureWorkspace,
  makeContext,
  makeProjectTemplateRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
} from "./support";
import {
  FIXTURE_OTHER_WORKSPACE,
  FIXTURE_OWNER,
  FIXTURE_WORKSPACE,
  seedWorkspace,
  type Seeded,
} from "./workspace-fixture";

const SOURCE = FIXTURE_WORKSPACE;
const OTHER = FIXTURE_OTHER_WORKSPACE;
const TARGET = "restore-target-workspace";
const OWNER = FIXTURE_OWNER;

const APPLICATION = {
  name: "DalyHub",
  version: "2.0.0",
  releaseName: "Test",
  environment: "development",
  buildCommit: null,
} as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function exportSnapshot(
  workspaceId: string,
  exportedAt = new Date("2026-08-01T09:00:00.000Z"),
): Promise<WorkspaceSnapshotV1> {
  return buildWorkspaceSnapshot(
    createWorkspaceSnapshotRepository(env.DB, makeContext(workspaceId)),
    { ownerId: OWNER, exportedAt, application: APPLICATION },
  );
}

function dependencies(
  workspaceId: string,
  overrides: Partial<RestoreDependencies> = {},
): RestoreDependencies {
  const context = makeContext(workspaceId);
  let counter = 0;
  return {
    restore: createWorkspaceRestoreRepository(env.DB, context),
    snapshot: createWorkspaceSnapshotRepository(env.DB, context),
    workspaceId,
    ownerId: OWNER,
    application: APPLICATION,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
    newId: () => `restore-${++counter}`,
    ...overrides,
  };
}

/**
 * Remove every record from a workspace, leaving the workspace row itself.
 *
 * This is how the round trip models the thing a backup exists for: the records
 * are gone, the deployment is not. Children strictly before parents, exactly as
 * the cutover does.
 */
async function loseWorkspaceRecords(workspaceId: string): Promise<void> {
  const tables = [
    "activity_subjects",
    "activities",
    "entity_links",
    "workspace_members",
    "review_insight_snapshots",
    "review_step_acknowledgements",
    "review_workflow_state",
    "review_sections",
    "review_details",
    "asset_obligations",
    "asset_events",
    "asset_details",
    "meeting_item_tasks",
    "meeting_items",
    "meeting_details",
    "person_details",
    "diary_entry_details",
    "note_details",
    "task_recurrence_rules",
    // TASKS-13 and PROJECT-02 rows, dependents first: a checklist item
    // references its Task, and a template's checklist items reference its
    // tasks, which reference the `project_template` entity — every one of those
    // keys is ON DELETE RESTRICT.
    "task_checklist_items",
    "project_template_checklist_items",
    "project_template_tasks",
    "project_template_details",
    "task_details",
    "project_details",
    "goal_details",
    "area_details",
    "spine_records",
    "entities",
    "owner_app_preferences",
    "task_saved_views",
  ];
  for (const table of tables) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`)
      .bind(workspaceId)
      .run();
  }
}

/** Seed the two rows no repository in scope owns, so the fixture is complete. */
async function seedIdentityAndInsights(reviewId: string, personId: string) {
  // IDENT-01 membership: the row that makes the exported actor ids
  // interpretable. `subject` matches the actor id the Activity stream carries.
  await env.DB.prepare(
    `INSERT INTO workspace_members
       (workspace_id, subject, email, display_name, auth_display_name,
        person_entity_id, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      SOURCE,
      OWNER,
      "owner@example.test",
      "Fixture Owner",
      null,
      personId,
      "2026-07-01T00:00:00.000Z",
      "2026-07-02T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
    )
    .run();
  // REVIEW-03: the one insight artefact a restore cannot rebuild.
  await env.DB.prepare(
    `INSERT INTO review_insight_snapshots
       (workspace_id, review_id, version, period_start, period_end, captured_at, facts_json)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
  )
    .bind(
      SOURCE,
      reviewId,
      "2026-07-27",
      "2026-08-02",
      "2026-08-02T00:00:00.000Z",
      JSON.stringify({ completed: 4 }),
    )
    .run();
}

async function countRecords(workspaceId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ?",
  )
    .bind(workspaceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* -------------------------------------------------------------------------- */

describe("workspace backup and restore (D1)", () => {
  let source: WorkspaceSnapshotV1;
  /** The ids the fixture minted, for the tests that name a specific record. */
  let seededIds: Seeded;
  let archive: Uint8Array;

  beforeEach(async () => {
    await resetTables([SOURCE, OTHER, TARGET]);
    const seeded = await seedWorkspace();
    seededIds = seeded;
    await seedIdentityAndInsights(seeded.reviewId, seeded.personId);
    source = await exportSnapshot(SOURCE);
    archive = (await buildStructuredExportArchive(source)).bytes;
  });

  /* ------------------------------------------------------------------ */
  /* The defining test                                                   */
  /* ------------------------------------------------------------------ */

  it("restores a real backup into a clean workspace and reproduces it exactly", async () => {
    // The fixture is only meaningful if it actually exercises the format.
    expect(source.records.entities.length).toBeGreaterThan(10);
    expect(source.records.activities.length).toBeGreaterThan(10);
    expect(source.records.workspaceMembers).toHaveLength(1);
    expect(source.records.reviewInsightSnapshots).toHaveLength(1);
    expect(
      source.records.entities.some((entity) => entity.deletedAt !== null),
    ).toBe(true);
    expect(
      source.records.noteDetails.some((note) => note.archivedAt !== null),
    ).toBe(true);
    expect(
      source.records.entityLinks.some((link) => link.deletedAt !== null),
    ).toBe(true);
    expect(source.records.taskRecurrenceRules.length).toBeGreaterThan(0);
    /*
     * TASKS-13 — the regression assertion for a real defect: the restore
     * repository had no `stageRows` branch for this collection, so every
     * checklist item was exported faithfully and dropped on the way back in.
     * The equality assertion below is what catches it; this is here so a
     * future fixture change cannot quietly empty the collection and make that
     * equality vacuous.
     */
    expect(source.records.taskChecklistItems.length).toBeGreaterThan(0);
    expect(
      source.records.taskChecklistItems.some((item) => item.completed),
    ).toBe(true);
    // PROJECT-02 — the fixture holds a real template with ordered tasks and a
    // step, so the round trip below is a claim about templates too.
    expect(source.records.projectTemplateDetails).toHaveLength(1);
    expect(source.records.projectTemplateTasks.length).toBeGreaterThan(0);
    expect(source.records.projectTemplateChecklistItems.length).toBeGreaterThan(
      0,
    );
    // X-02: both saved-view KINDS share one table, so the fixture holds one of
    // each. A restore that dropped the discriminator would rewrite the
    // cross-module view as a Tasks view — silently, and only visibly here.
    expect(source.owner.taskSavedViews.map((view) => view.kind).sort()).toEqual(
      ["cross", "tasks"],
    );
    expect(source.limitations).toEqual([]);

    // The workspace is lost. The archive is all that is left.
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);

    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);

    expect(preview.mode).toBe("into-empty");
    expect(preview.destructive).toBe(false);
    expect(preview.safetyBackupRequired).toBe(false);
    expect(preview.target.workspaceId).toBe(TARGET);
    // Provenance, never authority.
    expect(preview.backup.sourceWorkspaceId).toBe(SOURCE);
    expect(preview.backup.counts.total).toBe(source.records.entities.length);

    // Preview alone writes nothing canonical.
    expect(await countRecords(TARGET)).toBe(0);

    const result = await applyRestore(deps, preview.operationId);
    expect(result.verification.passed).toBe(true);
    expect(result.verification.checks.filter((check) => !check.passed)).toEqual(
      [],
    );
    expect(result.restored.total).toBe(source.records.entities.length);

    /*
     * The equivalence assertion.
     *
     * Everything under `records` and `owner` must be identical: ids, titles,
     * Markdown, lifecycle state, ordering, relationships and history. The
     * permitted differences are exactly three, and each is a fact about the
     * TARGET rather than about the data:
     *
     *   - `meta.exportedAt` — a different export happened at a different time;
     *   - `workspace.id` — the server decides the destination, so a restored
     *     workspace keeps its own identity (this is the isolation guarantee,
     *     expressed as a field);
     *   - `workspace.createdAt` / `updatedAt` — the target workspace's own
     *     lifecycle, not the source's.
     *
     * Nothing else is excused.
     */
    const restored = await exportSnapshot(
      TARGET,
      new Date("2026-08-03T09:00:00.000Z"),
    );

    expect(restored.records).toEqual(source.records);
    expect(restored.owner).toEqual(source.owner);
    expect(restored.limitations).toEqual([]);
    expect(restored.meta.schema).toBe(source.meta.schema);
    expect(restored.meta.schemaVersion).toBe(source.meta.schemaVersion);
    expect(restored.workspace.id).toBe(TARGET);

    // Collection by collection, so a failure names the collection that broke.
    for (const collection of SNAPSHOT_COLLECTION_ORDER) {
      expect(restored.records[collection], `collection ${collection}`).toEqual(
        source.records[collection],
      );
    }
  });

  it("restores a template well enough to create the same project from it", async () => {
    /*
     * PROJECT-02 — the restore claim that actually matters for templates.
     *
     * Snapshot equality proves the ROWS came back. This proves the template is
     * still USABLE: instantiating it in the restored workspace produces the
     * same Project structure the source workspace's template would have — same
     * task titles, same order, same checklist, and every created Task open,
     * undated and unticked.
     */
    const seededTemplateId = source.records.projectTemplateDetails[0]!.entityId;
    const expectedTasks = [...source.records.projectTemplateTasks]
      .sort((a, b) => a.position - b.position)
      .map((task) => task.title);

    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    const result = await applyRestore(deps, preview.operationId);
    expect(result.verification.passed).toBe(true);

    const context = makeContext(TARGET);
    const templates = makeProjectTemplateRepository(context);
    const spine = makeSpineRepository(context);
    const tasksRepo = makeTaskRepository(context);

    const restoredTemplate =
      await templates.getTemplateDetail(seededTemplateId);
    expect(restoredTemplate).not.toBeNull();
    expect(restoredTemplate!.tasks.map((task) => task.title)).toEqual(
      expectedTasks,
    );

    // A real Area in the restored workspace to hang the new Project off.
    const area = await spine.createArea({ title: "Restored area" });
    const created = await templates.instantiate(seededTemplateId, {
      title: "From the restored template",
      parentId: area.id,
    });
    expect(created.taskCount).toBe(expectedTasks.length);

    const children = await spine.listChildren({
      parentId: created.projectId,
      childKind: "task",
    });
    expect(children.items.map((child) => child.title)).toEqual(expectedTasks);
    for (const child of children.items) {
      const task = await tasksRepo.getTask(child.id);
      expect(task?.completedAt).toBeNull();
      expect(task?.dueDate).toBeNull();
      expect(task?.scheduledDate).toBeNull();
      const checklist = await tasksRepo.listChecklist(child.id);
      expect(checklist.every((item) => item.completed === false)).toBe(true);
    }
  });

  it("restores an ADVANCED recurrence rule well enough to produce the right next occurrence", async () => {
    /*
     * TASKS-12 — the restore claim that actually matters for recurrence.
     *
     * Snapshot equality proves the ROW came back. This proves the SERIES is still
     * usable: completing the restored occurrence produces the date the rule says,
     * with the end condition intact — which is what catches a restore that
     * silently dropped the ordinal, the weekend rule or the count and left a
     * routine that looks right and repeats wrongly.
     */
    const seeded = seededIds.advancedRecurringTaskId;

    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    expect(
      (await applyRestore(deps, preview.operationId)).verification.passed,
    ).toBe(true);

    const tasksRepo = makeTaskRepository(makeContext(TARGET));
    const restored = await tasksRepo.getTask(seeded);
    expect(restored?.recurrence).toMatchObject({
      frequency: "month",
      ordinal: "last",
      weekdays: [5],
      weekendRule: "before",
      endsAfterCount: 12,
      endsOnDate: null,
    });

    // 25 September 2026 is the last Friday of September, and it is a Friday
    // already, so the weekend rule leaves it where it is.
    const completed = await tasksRepo.completeTask(seeded, {
      ownerTodayIso: "2026-08-28",
    });
    expect(completed.successor?.scheduledDate).toBe("2026-09-25");
    expect(completed.successor?.recurrence?.endsAfterCount).toBe(12);
  });

  it("restores a DEPENDENCY pointing at the right Tasks, with blocked state derived", async () => {
    /*
     * TASKS-12 — a dependency is an EntityLink, so snapshot equality already
     * proves the row came back. What it cannot prove is that the DERIVED state
     * still works: that the restored edge names the two restored Tasks, that the
     * blocked aggregate answers from it, and that no edge crossed a workspace.
     */
    const blocked = seededIds.advancedRecurringTaskId;
    const blocker = seededIds.recurringTaskId;

    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    expect(
      (await applyRestore(deps, preview.operationId)).verification.passed,
    ).toBe(true);

    const tasksRepo = makeTaskRepository(makeContext(TARGET));
    const restored = await tasksRepo.listTaskDependencies(blocked);
    expect(restored.blockedBy.map((entry) => entry.taskId)).toEqual([blocker]);
    expect(
      (await tasksRepo.listBlockedSummaries([blocked])).get(blocked),
    ).toMatchObject({ blockerCount: 1 });

    // Completing the blocker unblocks it, derived, in the restored workspace.
    await tasksRepo.completeTask(blocker, { ownerTodayIso: "2026-08-28" });
    expect((await tasksRepo.listBlockedSummaries([blocked])).has(blocked)).toBe(
      false,
    );

    // No dependency edge names an entity outside the restored workspace.
    const stray = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links l
       WHERE l.type = 'task.blocks'
         AND (NOT EXISTS (SELECT 1 FROM entities e
                          WHERE e.workspace_id = l.workspace_id AND e.id = l.source_entity_id)
              OR NOT EXISTS (SELECT 1 FROM entities e
                             WHERE e.workspace_id = l.workspace_id AND e.id = l.target_entity_id))`,
    ).first<{ n: number }>();
    expect(stray?.n).toBe(0);
  });

  it("restores the owner's appearance AND colour scheme, not just the defaults", async () => {
    /*
     * The defining test above compares whole snapshots, which covers this only if
     * the fixture actually carries NON-default display preferences — and the
     * shipped defaults are exactly what a silently-dropped field looks like. So
     * both are set explicitly here first.
     *
     * SET-02 added `appearance` to the snapshot because a restore that reset it
     * would be an unfaithful reconstruction of configuration the archive claims
     * to carry. THEME-01 added `colorScheme` for the same reason, and this is the
     * assertion that keeps the claim true.
     */
    // An UPSERT, not an UPDATE: the fixture workspace may have no preferences
    // row at all, in which case the export reports the DEFAULTS at version 0 —
    // which is exactly what a dropped field looks like, so the test would pass
    // by accident and prove nothing.
    await env.DB.prepare(
      `INSERT INTO owner_app_preferences (
         workspace_id, owner_id, appearance, color_scheme,
         timezone, date_format, first_day_of_week,
         default_landing_destination, default_tasks_view, default_diary_mode,
         navigation_config, version, created_at, updated_at
       ) VALUES (?, ?, 'dark', 'electric', 'Australia/Sydney', 'd_mmm_yyyy',
                 'monday', 'today', 'focus', 'day', ?, 1, ?, ?)
       ON CONFLICT (workspace_id, owner_id) DO UPDATE SET
         appearance = 'dark', color_scheme = 'electric'`,
    )
      .bind(
        SOURCE,
        OWNER,
        JSON.stringify({ version: 1, hiddenModuleIds: [] }),
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T09:00:00.000Z",
      )
      .run();
    const withPreferences = await exportSnapshot(SOURCE);
    expect(withPreferences.owner.preferences.appearance).toBe("dark");
    expect(withPreferences.owner.preferences.colorScheme).toBe("electric");

    const bytes = (await buildStructuredExportArchive(withPreferences)).bytes;
    // Entity ids are globally unique, so the source has to let go of them before
    // the same snapshot can be restored elsewhere — the same step every other
    // cross-workspace restore in this file takes.
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, bytes);
    await applyRestore(deps, preview.operationId);

    const restored = await exportSnapshot(TARGET);
    expect(restored.owner.preferences.appearance).toBe("dark");
    expect(restored.owner.preferences.colorScheme).toBe("electric");
  });

  it("manufactures no Activity: history is restored, not re-enacted", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    await applyRestore(deps, preview.operationId);

    // Exactly the events the backup carried — not one synthesised `created`
    // event per reconstructed record.
    const events = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ?",
    )
      .bind(TARGET)
      .first<{ n: number }>();
    expect(events?.n).toBe(source.records.activities.length);
    const restored = await exportSnapshot(TARGET);
    expect(restored.records.activities).toEqual(source.records.activities);
  });

  it("preserves actor attribution, so restored history is still interpretable", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    await applyRestore(deps, preview.operationId);

    const member = await env.DB.prepare(
      "SELECT subject, display_name, email, person_entity_id FROM workspace_members WHERE workspace_id = ?",
    )
      .bind(TARGET)
      .first<Record<string, unknown>>();
    expect(member?.subject).toBe(OWNER);
    expect(member?.display_name).toBe("Fixture Owner");
    expect(member?.person_entity_id).toBe(
      source.records.workspaceMembers[0]!.personEntityId,
    );
    // The one authentication-adjacent field the snapshot deliberately omits.
    // The request boundary re-establishes it on the owner's next sign-in.
    expect(member?.email).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /* Populated target: replace, gated                                    */
  /* ------------------------------------------------------------------ */

  it("treats a populated workspace as a destructive replace and requires a verified safety backup", async () => {
    const deps = dependencies(SOURCE);
    const preview = await prepareRestore(deps, archive);

    expect(preview.mode).toBe("replace");
    expect(preview.destructive).toBe(true);
    expect(preview.safetyBackupRequired).toBe(true);
    expect(preview.target.counts.total).toBe(source.records.entities.length);

    // Applying without one is refused, and nothing is written.
    await expect(applyRestore(deps, preview.operationId)).rejects.toThrow(
      RestoreFailedError,
    );
    expect(await countRecords(SOURCE)).toBe(source.records.entities.length);

    const safety = await createSafetyBackup(deps, preview.operationId);
    expect(safety.receipt.bytes).toBeGreaterThan(0);
    expect(safety.receipt.recordCount).toBe(source.records.entities.length);
    // The receipt is only meaningful because the file is itself restorable.
    await expect(readBackupArchive(safety.bytes)).resolves.toBeDefined();

    // Generating the archive is not the same as the owner holding it, so the
    // gate is still closed until delivery is acknowledged.
    expect(
      (await deps.restore.readOperation(preview.operationId))?.status,
    ).toBe("safety_backup_ready");
    await expect(applyRestore(deps, preview.operationId)).rejects.toMatchObject(
      {
        workspaceReplaced: false,
      },
    );
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      safety.receipt.sha256,
    );

    const result = await applyRestore(deps, preview.operationId);
    expect(result.mode).toBe("replace");
    expect(result.verification.passed).toBe(true);
    expect(result.safetyBackupFilename).toBe(safety.receipt.filename);

    const restored = await exportSnapshot(SOURCE);
    expect(restored.records).toEqual(source.records);
  });

  it("replaces rather than merges: records absent from the backup do not survive", async () => {
    const deps = dependencies(SOURCE);
    // A record created AFTER the backup was taken.
    await env.DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES (?, ?, 'note', 'Written after the backup', ?, ?)`,
    )
      .bind(
        "note-after-backup",
        SOURCE,
        "2026-08-05T00:00:00.000Z",
        "2026-08-05T00:00:00.000Z",
      )
      .run();

    const preview = await prepareRestore(deps, archive);
    const safety = await createSafetyBackup(deps, preview.operationId);
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      safety.receipt.sha256,
    );
    await applyRestore(deps, preview.operationId);

    const survivor = await env.DB.prepare(
      "SELECT id FROM entities WHERE workspace_id = ? AND id = ?",
    )
      .bind(SOURCE, "note-after-backup")
      .first();
    expect(survivor).toBeNull();
    // …and the safety backup taken beforehand is the owner's way back to it.
  });

  /* ------------------------------------------------------------------ */
  /* Workspace isolation                                                 */
  /* ------------------------------------------------------------------ */

  it("writes only into the server-resolved workspace, whatever the archive claims", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);

    // A crafted archive naming another workspace as its own.
    const crafted = await buildStructuredExportArchive({
      ...source,
      workspace: { ...source.workspace, id: OTHER },
    });
    const otherBefore = await countRecords(OTHER);

    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, crafted.bytes);
    expect(preview.backup.sourceWorkspaceId).toBe(OTHER);
    expect(preview.target.workspaceId).toBe(TARGET);

    const result = await applyRestore(deps, preview.operationId);
    expect(result.verification.passed).toBe(true);

    expect(await countRecords(TARGET)).toBe(source.records.entities.length);
    expect(await countRecords(OTHER)).toBe(otherBefore);
    const escaped = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND id IN (SELECT id FROM entities WHERE workspace_id = ?)",
    )
      .bind(OTHER, TARGET)
      .first<{ n: number }>();
    expect(escaped?.n).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* Refusals — before any write                                         */
  /* ------------------------------------------------------------------ */

  it("refuses a corrupted archive and writes nothing", async () => {
    await ensureWorkspace(TARGET);
    const damaged = archive.slice();
    // Flip a byte well inside the compressed payload.
    damaged[Math.floor(damaged.length / 2)] ^= 0xff;

    await expect(prepareRestore(dependencies(TARGET), damaged)).rejects.toThrow(
      RestoreRejectedError,
    );
    expect(await countRecords(TARGET)).toBe(0);
    const staged = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspace_restore_staged_rows WHERE workspace_id = ?",
    )
      .bind(TARGET)
      .first<{ n: number }>();
    expect(staged?.n).toBe(0);
  });

  it("refuses a truncated archive", async () => {
    await ensureWorkspace(TARGET);
    await expect(
      prepareRestore(
        dependencies(TARGET),
        archive.slice(0, archive.length - 40),
      ),
    ).rejects.toThrow(RestoreRejectedError);
    expect(await countRecords(TARGET)).toBe(0);
  });

  /*
   * HARDEN-06B (F-02) — the archive an owner already holds.
   *
   * Between HARDEN-01 (when `schemaVersion` became 2) and TASKS-13, every
   * export declared the CURRENT schema version, so the version gate below
   * accepted it — and the validator then refused it as structurally invalid
   * because `taskChecklistItems` had been added to the collection order and to
   * both D1 repositories, but not to the optional-on-read list. The owner was
   * told their backup was malformed. It was not; it was simply older than a
   * collection, and "the normal recovery path is the DalyHub backup" was broken
   * for every archive more than two days old.
   *
   * This drives the WHOLE reader — a genuine ZIP with recomputed checksums,
   * through `prepareRestore` — rather than the validator alone, because the
   * validator is only where it failed, not what the owner does.
   */
  it("accepts an archive exported before a collection existed", async () => {
    await ensureWorkspace(TARGET);
    /*
     * DalyHub's CURRENT writer always emits every collection, so the older file
     * is reconstructed from a real archive: the snapshot entry is rewritten
     * without the key and `CHECKSUMS.txt` recomputed over the bytes actually
     * present, which is exactly what an archive written by the older writer
     * looks like — a valid, checksum-clean ZIP declaring `schemaVersion: 2`.
     */
    const older = structuredClone(source) as unknown as {
      records: Record<string, unknown>;
    };
    delete older.records.taskChecklistItems;
    const current = await buildStructuredExportArchive(source);
    const rewritten = (await readZipArchive(current.bytes)).map((entry) =>
      entry.path === "dalyhub-snapshot.json"
        ? textEntry(entry.path, `${JSON.stringify(older, null, 2)}\n`)
        : { path: entry.path, data: entry.data },
    );
    const checksums: string[] = [];
    for (const entry of rewritten) {
      if (entry.path === "CHECKSUMS.txt") continue;
      checksums.push(`${await sha256Hex(entry.data)}  ${entry.path}`);
    }
    const archived = await createZipArchive(
      [
        ...rewritten.filter((entry) => entry.path !== "CHECKSUMS.txt"),
        textEntry("CHECKSUMS.txt", `${checksums.sort().join("\n")}\n`),
      ].sort((a, b) => (a.path < b.path ? -1 : 1)),
      new Date(source.meta.exportedAt),
    );

    const preview = await prepareRestore(dependencies(TARGET), archived);
    expect(preview.operationId).toBeTruthy();
  });

  it("refuses a snapshot version it cannot read", async () => {
    await ensureWorkspace(TARGET);
    const future = await buildStructuredExportArchive({
      ...source,
      meta: { ...source.meta, schemaVersion: 99 },
    });
    await expect(
      prepareRestore(dependencies(TARGET), future.bytes),
    ).rejects.toMatchObject({
      rejection: { kind: "unsupported_version" },
    });
    expect(await countRecords(TARGET)).toBe(0);
  });

  it("refuses a backup that cannot be persisted, before restoration begins", async () => {
    await ensureWorkspace(TARGET);
    const duplicated = await buildStructuredExportArchive({
      ...source,
      records: {
        ...source.records,
        entities: [
          ...source.records.entities,
          source.records.entities[0]!,
        ].sort((a, b) => (a.id < b.id ? -1 : 1)),
      },
    });
    await expect(
      prepareRestore(dependencies(TARGET), duplicated.bytes),
    ).rejects.toMatchObject({ rejection: { kind: "incompatible" } });
    expect(await countRecords(TARGET)).toBe(0);
  });

  it("refuses a backup that declared itself truncated", async () => {
    await ensureWorkspace(TARGET);
    const truncated = await buildStructuredExportArchive({
      ...source,
      limitations: [
        {
          code: "collection_truncated",
          subject: "activities",
          detail: "The workspace holds more than this file carries.",
        },
      ],
    });
    await expect(
      prepareRestore(dependencies(TARGET), truncated.bytes),
    ).rejects.toMatchObject({ rejection: { kind: "incompatible" } });
    expect(await countRecords(TARGET)).toBe(0);
  });

  it("refuses an Obsidian vault with a sentence that points at the right file", async () => {
    await ensureWorkspace(TARGET);
    // A ZIP that is structurally fine and is simply not a backup.
    const notABackup = await buildStructuredExportArchive(source);
    const bytes = notABackup.bytes;
    await expect(
      prepareRestore(dependencies(TARGET), bytes.slice(0, 20)),
    ).rejects.toThrow(RestoreRejectedError);
  });

  /* ------------------------------------------------------------------ */
  /* Failure injection — the workspace is never partially restored       */
  /* ------------------------------------------------------------------ */

  it("leaves the workspace untouched when the cutover fails part-way", async () => {
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);

    // The source workspace still owns every entity id in the backup, and
    // `entities.id` is globally unique — so the INSERT collides and the whole
    // cutover transaction rolls back. A real, unsimulated mid-write failure.
    await expect(applyRestore(deps, preview.operationId)).rejects.toMatchObject(
      { workspaceReplaced: false },
    );

    // Neither workspace moved.
    expect(await countRecords(TARGET)).toBe(0);
    expect(await countRecords(SOURCE)).toBe(source.records.entities.length);
    const stillThere = await exportSnapshot(SOURCE);
    expect(stillThere.records).toEqual(source.records);
  });

  it("aborts a destructive restore when the safety backup cannot be created", async () => {
    const deps = dependencies(SOURCE, {
      snapshot: {
        readWorkspace: () => Promise.reject(new Error("storage unavailable")),
        readOwnerPreferences: () => Promise.reject(new Error("unavailable")),
        readTaskSavedViews: () => Promise.reject(new Error("unavailable")),
        listPage: () => Promise.reject(new Error("unavailable")),
      },
    });
    const preview = await prepareRestore(deps, archive);
    expect(preview.destructive).toBe(true);

    await expect(
      createSafetyBackup(deps, preview.operationId),
    ).rejects.toMatchObject({ workspaceReplaced: false });

    // The operation is dead, so the restore cannot proceed by any route…
    await expect(applyRestore(deps, preview.operationId)).rejects.toThrow(
      RestoreRejectedError,
    );
    // …and the workspace is exactly as it was.
    expect(await countRecords(SOURCE)).toBe(source.records.entities.length);
  });

  it("reports a restore whose verification fails as a failure, not a success", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const base = dependencies(TARGET);
    const failing: RestoreVerification = {
      passed: false,
      checks: [
        { name: "count:entities", passed: false, detail: "injected failure" },
      ],
    };
    // A delegating wrapper rather than a spread: the repository's methods live
    // on its prototype, so spreading an instance would produce an object with
    // none of them.
    const wrapped: WorkspaceRestoreRepository = {
      countTargetRecords: () => base.restore.countTargetRecords(),
      purgeStaleOperations: () => base.restore.purgeStaleOperations(),
      stageSnapshot: (id, snapshot, ownerId) =>
        base.restore.stageSnapshot(id, snapshot, ownerId),
      createOperation: (input) => base.restore.createOperation(input),
      readOperation: (id) => base.restore.readOperation(id),
      recordSafetyBackup: (id, receipt) =>
        base.restore.recordSafetyBackup(id, receipt),
      acknowledgeSafetyBackup: (id, sha256) =>
        base.restore.acknowledgeSafetyBackup(id, sha256),
      applyStagedSnapshot: (id) => base.restore.applyStagedSnapshot(id),
      verifyRestored: () => Promise.resolve(failing),
      discardOperation: (id, reason) =>
        base.restore.discardOperation(id, reason),
      completeOperation: (id) => base.restore.completeOperation(id),
    };
    const deps: RestoreDependencies = { ...base, restore: wrapped };

    const preview = await prepareRestore(deps, archive);
    await expect(applyRestore(deps, preview.operationId)).rejects.toMatchObject(
      { workspaceReplaced: true },
    );
    // The cutover DID commit — the honest answer is "the workspace holds the
    // restored data and it did not check out", never "nothing happened".
    expect(await countRecords(TARGET)).toBe(source.records.entities.length);
  });

  it("keeps staged rows inert and removes them once the restore completes", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);

    const duringStaging = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspace_restore_staged_rows WHERE workspace_id = ?",
    )
      .bind(TARGET)
      .first<{ n: number }>();
    expect(duringStaging?.n).toBeGreaterThan(0);
    expect(await countRecords(TARGET)).toBe(0);

    await applyRestore(deps, preview.operationId);

    const afterwards = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspace_restore_staged_rows WHERE workspace_id = ?",
    )
      .bind(TARGET)
      .first<{ n: number }>();
    expect(afterwards?.n).toBe(0);
    const operation = await deps.restore.readOperation(preview.operationId);
    expect(operation?.status).toBe("completed");
  });
  /* ------------------------------------------------------------------ */
  /* The safety backup must reach the OWNER, not merely exist            */
  /* ------------------------------------------------------------------ */

  it("does not unlock a destructive restore until the owner's copy is acknowledged", async () => {
    const deps = dependencies(SOURCE);
    const preview = await prepareRestore(deps, archive);
    expect(preview.destructive).toBe(true);

    const safety = await createSafetyBackup(deps, preview.operationId);

    // The server has produced AND verified a recovery archive. That is not the
    // same claim as "the owner has one", and the state machine says so.
    const ready = await deps.restore.readOperation(preview.operationId);
    expect(ready?.status).toBe("safety_backup_ready");
    expect(ready?.safetyBackup?.sha256).toBe(safety.receipt.sha256);

    // A delivery that never completed cannot unlock the restore…
    await expect(applyRestore(deps, preview.operationId)).rejects.toMatchObject(
      {
        workspaceReplaced: false,
      },
    );
    expect(await countRecords(SOURCE)).toBe(source.records.entities.length);

    // …and neither can an acknowledgement of DIFFERENT bytes: a truncated or
    // corrupted download cannot acknowledge itself.
    const truncated = safety.bytes.slice(0, safety.bytes.length - 512);
    const wrongDigest = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          truncated as unknown as ArrayBuffer,
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await expect(
      acknowledgeSafetyBackup(deps, preview.operationId, wrongDigest),
    ).rejects.toMatchObject({ workspaceReplaced: false });
    expect(
      (await deps.restore.readOperation(preview.operationId))?.status,
    ).toBe("safety_backup_ready");
    await expect(applyRestore(deps, preview.operationId)).rejects.toThrow(
      RestoreFailedError,
    );
    expect(await countRecords(SOURCE)).toBe(source.records.entities.length);

    // Only the digest of what actually arrived opens the gate.
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      safety.receipt.sha256,
    );
    expect(
      (await deps.restore.readOperation(preview.operationId))?.status,
    ).toBe("safety_backed_up");
    const result = await applyRestore(deps, preview.operationId);
    expect(result.verification.passed).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Exactly one apply can win                                           */
  /* ------------------------------------------------------------------ */

  it("lets exactly one of two concurrent applies win, and the other is a clean no-op", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);

    // Both requests observe an acceptable state before either writes — the
    // read-then-write gap the transactional claim exists to close.
    const outcomes = await Promise.allSettled([
      applyRestore(deps, preview.operationId),
      applyRestore(deps, preview.operationId),
    ]);
    const won = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const lost = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The loser is a refusal, not a second wholesale delete/insert cycle…
    const rejection = (lost[0] as PromiseRejectedResult).reason;
    expect(rejection).toBeInstanceOf(RestoreRejectedError);

    // …and the workspace holds the backup exactly once, not twice and not
    // partially. If the loser had re-run the cutover it would have deleted the
    // winner's rows between the winner's write and this read.
    expect(await countRecords(TARGET)).toBe(source.records.entities.length);
    const restored = await exportSnapshot(TARGET);
    expect(restored.records).toEqual(source.records);

    // Exactly one claim token is recorded, and the operation moved once.
    const claims = await env.DB.prepare(
      "SELECT apply_token, status FROM workspace_restore_operations WHERE workspace_id = ? AND id = ?",
    )
      .bind(TARGET, preview.operationId)
      .first<{ apply_token: string | null; status: string }>();
    expect(claims?.apply_token).toBeTruthy();
    expect(["applied", "completed"]).toContain(claims?.status);
  });

  it("refuses a second apply after the first has completed, without touching the workspace", async () => {
    await loseWorkspaceRecords(SOURCE);
    await ensureWorkspace(TARGET);
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    await applyRestore(deps, preview.operationId);
    const after = await countRecords(TARGET);

    await expect(applyRestore(deps, preview.operationId)).rejects.toThrow(
      RestoreRejectedError,
    );
    expect(await countRecords(TARGET)).toBe(after);
  });
});
