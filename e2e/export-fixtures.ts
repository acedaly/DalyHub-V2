/**
 * X-04 — shared E2E fixtures for the workspace-export journeys.
 *
 * The export spec has to prove three things a general fixture cannot: that two
 * records with the SAME title get distinct, stable filenames; that a
 * `dalyhub://` record link becomes a working vault link; and that a link to a
 * DELETED record is handled honestly. All three need records seeded with known
 * ids and known content, so they are created here as direct D1 rows in the
 * seeded dev workspace and removed afterwards.
 *
 * Scope discipline, matching `notes-fixtures.ts`: every row this module writes
 * carries a test-owned id prefix, and cleanup only ever matches that prefix, so
 * it can never touch a developer's own local records.
 */

import { d1Execute } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";
const TS = "2026-07-30T00:00:00.000Z";

/** Every export-fixture row's id starts with this. Nothing else in the DB does. */
export const EXPORT_FIXTURE_PREFIX = "x04-export-e2e-";

export const EXPORT_FIXTURE = {
  duplicateA: `${EXPORT_FIXTURE_PREFIX}dup-a`,
  duplicateB: `${EXPORT_FIXTURE_PREFIX}dup-b`,
  deletedTarget: `${EXPORT_FIXTURE_PREFIX}deleted-target`,
  linkingNote: `${EXPORT_FIXTURE_PREFIX}linking-note`,
  /** The shared title the two duplicate notes carry. */
  duplicateTitle: "X04 duplicate export title",
  deletedTitle: "X04 deleted export target",
  linkingTitle: "X04 export link hub",
} as const;

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
function d1(command: string | readonly string[]): void {
  d1Execute(command);
}

function entityRow(id: string, title: string, deleted: string | null): string {
  return (
    `INSERT OR REPLACE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) ` +
    `VALUES ('${id}', '${WORKSPACE_ID}', 'note', '${title}', '${TS}', '${TS}', ${
      deleted === null ? "NULL" : `'${deleted}'`
    });`
  );
}

function noteRow(id: string, content: string): string {
  return (
    `INSERT OR REPLACE INTO note_details (workspace_id, entity_id, entity_type, content, tags, archived_at, updated_at) ` +
    `VALUES ('${WORKSPACE_ID}', '${id}', 'note', '${content.replace(/'/g, "''")}', '[]', NULL, '${TS}');`
  );
}

/**
 * Seed the export fixtures.
 *
 * The linking note's body carries BOTH internal-link syntaxes and one
 * deliberately-unresolvable reference, so one export exercises the whole link
 * story:
 *
 *   - a `dalyhub://` link to a live record  → a working relative vault link;
 *   - a `dalyhub://` link to a DELETED record → still a link (the file exists
 *     and says it is deleted);
 *   - a `[[Wiki Link]]` to a title nothing matches → marked unresolved and
 *     reported.
 */
export function seedExportFixtures(): void {
  const body = [
    "# X04 export link hub",
    "",
    `A live record: [duplicate A](dalyhub://note/${EXPORT_FIXTURE.duplicateA}).`,
    "",
    `A deleted record: [gone](dalyhub://note/${EXPORT_FIXTURE.deletedTarget}).`,
    "",
    "A title nothing matches: [[X04 no such record anywhere]].",
  ].join("\n");

  d1(
    [
      entityRow(EXPORT_FIXTURE.duplicateA, EXPORT_FIXTURE.duplicateTitle, null),
      entityRow(EXPORT_FIXTURE.duplicateB, EXPORT_FIXTURE.duplicateTitle, null),
      entityRow(EXPORT_FIXTURE.deletedTarget, EXPORT_FIXTURE.deletedTitle, TS),
      entityRow(EXPORT_FIXTURE.linkingNote, EXPORT_FIXTURE.linkingTitle, null),
      noteRow(EXPORT_FIXTURE.duplicateA, "First note with the shared title.\n"),
      noteRow(
        EXPORT_FIXTURE.duplicateB,
        "Second note with the shared title.\n",
      ),
      noteRow(EXPORT_FIXTURE.deletedTarget, "This record was deleted.\n"),
      noteRow(EXPORT_FIXTURE.linkingNote, body),
    ].join("\n"),
  );
}

/** Remove every export fixture row, dependents first (all FKs are RESTRICT). */
export function cleanupExportFixtures(): void {
  const selection = `SELECT id FROM entities WHERE workspace_id = '${WORKSPACE_ID}' AND id LIKE '${EXPORT_FIXTURE_PREFIX}%'`;
  d1(
    [
      `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${selection});`,
      `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE_ID}' AND (source_entity_id IN (${selection}) OR target_entity_id IN (${selection}));`,
      `DELETE FROM note_details WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${selection});`,
      `DELETE FROM entities WHERE workspace_id = '${WORKSPACE_ID}' AND id LIKE '${EXPORT_FIXTURE_PREFIX}%';`,
    ].join("\n"),
  );
}
