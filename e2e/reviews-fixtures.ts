import { d1Execute } from "./d1";
export const REVIEW_TITLE_PREFIX = "Reviews e2e review ";

let reviewCounter = 0;

export function uniqueReviewTitle(label: string): string {
  reviewCounter += 1;
  return `${REVIEW_TITLE_PREFIX}${label}-${Date.now()}-${reviewCounter}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const WORKSPACE_ID = "local-dev-workspace";

function cleanupSql(titlePredicate: string): string {
  const reviewSelection = `
    SELECT id FROM entities
    WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
      AND type = 'review'
      AND ${titlePredicate}
  `;
  return [
    `DELETE FROM activity_subjects WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${reviewSelection});`,
    `DELETE FROM activities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND (source_entity_id IN (${reviewSelection}) OR target_entity_id IN (${reviewSelection}));`,
    `DELETE FROM review_sections WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND review_id IN (${reviewSelection});`,
    `DELETE FROM review_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${reviewSelection});`,
    `DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND id IN (${reviewSelection});`,
  ].join("\n");
}

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runCleanup(command: string | readonly string[]): Promise<void> {
  d1Execute(command);
}

export async function cleanupReviewByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(`title = ${sqlLiteral(title)}`));
}

export async function cleanupAllReviewFixtures(): Promise<void> {
  await runCleanup(
    cleanupSql(`title LIKE ${sqlLiteral(`${REVIEW_TITLE_PREFIX}%`)}`),
  );
}
