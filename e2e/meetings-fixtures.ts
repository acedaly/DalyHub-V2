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

import { execFileSync } from "node:child_process";

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

function isTransientD1Error(output: string): boolean {
  return (
    output.includes("SQLITE_BUSY") ||
    output.includes("FOREIGN KEY constraint failed")
  );
}

async function runCleanup(command: string): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "DB",
          "--local",
          "--command",
          command,
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
          stdio: "pipe",
        },
      );
      return;
    } catch (error) {
      const err = error as {
        message?: string;
        stdout?: unknown;
        stderr?: unknown;
      };
      const output = [err.message, err.stdout, err.stderr]
        .map((part) => String(part ?? ""))
        .join("\n");
      if (attempt === attempts || !isTransientD1Error(output)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

/** Remove one test's Meeting + follow-up Tasks by exact title. */
export async function cleanupMeetingByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(title));
}

/** Suite-level sweep of anything left under the shared prefix by a crashed run. */
export async function cleanupAllMeetingFixtures(): Promise<void> {
  await runCleanup(cleanupSql(`${MEETING_TITLE_PREFIX}%`));
}
