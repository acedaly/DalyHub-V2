/**
 * MEET-02 — shared E2E fixtures for the Meeting follow-up journeys.
 *
 * The follow-up spec creates a real Meeting, real structured items and real
 * canonical Tasks in the seeded Worker/D1 app, then must tear them ALL down
 * deterministically. Mirrors `notes-fixtures.ts`: one ordered, single-invocation,
 * retriable cleanup, scoped strictly to the test-owned title prefix so it can never
 * touch a developer's own local data.
 *
 * Two entity families are removed, dependents-first (every FK is ON DELETE RESTRICT
 * except the meeting_items/meeting_item_tasks cascade from meeting_details):
 *   - the follow-up **Tasks** (spine entities: their activity subjects, entity
 *     links, spine_records and task_details, then the entity row);
 *   - the **Meetings** (their follow-up mappings, structured items, attendee/related
 *     links, activity subjects, meeting_details, then the entity row).
 * Every test-created Task title carries the shared prefix (item text and the direct
 * follow-up title are prefixed in the spec), so a title-prefix match sweeps both.
 */

import { d1Execute } from "./d1";

export const MEETING_TITLE_PREFIX = "Meetings e2e ";

let counter = 0;

/** A per-test-unique title under the shared prefix. */
export function uniqueMeetingTitle(label: string): string {
  counter += 1;
  return `${MEETING_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const WORKSPACE_ID = "local-dev-workspace";

function cleanupSql(titleLike: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const like = sqlLiteral(titleLike);
  // Test-owned Tasks and Meetings, matched by the shared title prefix.
  const taskSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND title LIKE ${like}`;
  const meetingSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'meeting' AND title LIKE ${like}`;
  return [
    /*
     * V2.11 FILE-01 — evidence first, and first for a reason the schema
     * enforces: `attachments` holds a composite foreign key into `entities`
     * with ON DELETE RESTRICT, so a Meeting or a follow-up Task still holding a
     * file cannot be deleted at all. A journey that attaches something and
     * fails before removing it would otherwise wedge every later sweep.
     *
     * The object bytes are not swept, and cannot be: the local bucket is
     * Miniflare storage inside the dev server's process rather than a table.
     * They are kilobytes in a throwaway store `wrangler dev` recreates, which
     * beats handing an E2E fixture an R2 binding it could point anywhere.
     */
    `DELETE FROM attachments WHERE workspace_id = ${ws} AND (owner_entity_id IN (${meetingSel}) OR owner_entity_id IN (${taskSel}));`,
    // Follow-up mappings for these meetings (also cascades with meeting_details,
    // removed explicitly so a task-only match is still swept).
    `DELETE FROM meeting_item_tasks WHERE workspace_id = ${ws} AND (meeting_id IN (${meetingSel}) OR task_id IN (${taskSel}));`,
    `DELETE FROM meeting_items WHERE workspace_id = ${ws} AND meeting_id IN (${meetingSel});`,
    // Links where either endpoint is a test Task or test Meeting (structural,
    // relates_to and attendee links alike).
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${taskSel}) OR target_entity_id IN (${taskSel}) OR source_entity_id IN (${meetingSel}) OR target_entity_id IN (${meetingSel}));`,
    // Activity subjects for both families, then any now-orphaned activities.
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND (entity_id IN (${taskSel}) OR entity_id IN (${meetingSel}));`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    // Detail slices, then the entity rows.
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM meeting_details WHERE workspace_id = ${ws} AND entity_id IN (${meetingSel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND title LIKE ${like};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'meeting' AND title LIKE ${like};`,
  ].join("\n");
}

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runCleanup(command: string | readonly string[]): Promise<void> {
  d1Execute(command);
}

/**
 * Remove one test's Meeting AND everything derived from it.
 *
 * The trailing `%` is the whole point, and it was missing. `cleanupSql` sweeps
 * Tasks and Meetings by the SAME pattern, and a follow-up Task's title is not
 * the Meeting's — it is the action item's body, which these suites write as
 * `` `${title} — do the thing` ``. Matched against the bare title, the Meeting
 * was swept and the Task it spawned was left behind, alive for the rest of the
 * partition with a title nothing else would think to look for.
 *
 * It stayed invisible while `audit-13-conversion-atomicity.spec.ts` had no
 * neighbour that reads Task rows by substring. V2.4 FOLLOW-01's repartition gave
 * it one: `tasks-dependencies.spec.ts` asserts on a row matching "Book the
 * venue", and a leaked *"Meetings e2e idempotent-…-2 — book the venue"* made
 * that locator resolve to two rows and fail strict mode. The collision was real,
 * the assertion was right, and the fixture was wrong.
 *
 * The suite-level sweep below already used a prefix wildcard, which is why a
 * crashed run cleaned up correctly and a passing one did not.
 */
export async function cleanupMeetingByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(`${title}%`));
}

/** Suite-level sweep of anything left under the shared prefix by a crashed run. */
export async function cleanupAllMeetingFixtures(): Promise<void> {
  await runCleanup(cleanupSql(`${MEETING_TITLE_PREFIX}%`));
}
