/**
 * TASKS-01 — cleanup for the full Tasks journey's own records.
 *
 * DEBT-173 — the journey creates its Tasks through the REAL create drawer, so their
 * ids are generated and the only handle on them is the title prefix every one of
 * them carries. Mirrors `meetings-fixtures.ts`: one ordered, retriable sweep through
 * the shared `d1Execute`, scoped to the workspace AND the test-owned prefix so it can
 * never touch a developer's own local data.
 *
 * Why the spec needs this at all. The seed clears `Journey task …` once, when the
 * partition starts. Everything the journey creates after that survives — for its own
 * later tests, for a retry, and for every spec that runs after it in the same
 * partition. Measured after a single p05 run: 222 Tasks, **138 of them active**,
 * seven of which this journey had left behind. The collection pages at 50, so those
 * leftovers are not free: they push other specs' rows out of the first page of a
 * bounded band, which is this entry's mechanism seen from the CONTRIBUTING side
 * rather than the suffering one.
 *
 * Rows are removed dependents-first because every foreign key here is
 * ON DELETE RESTRICT: links and checklist items, then recurrence rules, then the
 * detail slice, then the spine record, then activity subjects (and any activity they
 * orphan), then the entity itself.
 */

import { d1Execute, sqlLiteral } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";

/**
 * The prefix every Task this journey creates carries.
 *
 * The trailing `%` is applied at the call site rather than baked in here, because
 * `cleanupMeetingByTitle` shipped the opposite mistake — an exact-title match that
 * swept the Meeting and left the Task it spawned alive for the rest of the
 * partition. A prefix constant that already ends in `%` invites the same slip in
 * reverse, so the wildcard stays visible in the SQL that uses it.
 */
export const JOURNEY_TASK_TITLE_PREFIX = "Journey task ";

function cleanupSql(titleLike: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const like = sqlLiteral(titleLike);
  // Test-owned Tasks, matched by the shared title prefix. Resolved as a subquery
  // rather than a resolved id list because nothing here creates a row whose
  // identity outlives the title (no recurrence series), so the pattern is stable
  // across every statement below.
  const taskSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND title LIKE ${like}`;
  return [
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${taskSel}) OR target_entity_id IN (${taskSel}));`,
    `DELETE FROM task_checklist_items WHERE workspace_id = ${ws} AND task_id IN (${taskSel});`,
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND title LIKE ${like};`,
  ].join("\n");
}

/**
 * Remove every Task this journey created.
 *
 * Safe to call before the journey as well as after it: a crashed or interrupted run
 * leaves rows behind, and starting from a known-empty set is what makes the journey's
 * own assertions about its own records exact rather than approximate.
 */
export function cleanupAllJourneyTasks(): void {
  d1Execute(cleanupSql(`${JOURNEY_TASK_TITLE_PREFIX}%`));
}
