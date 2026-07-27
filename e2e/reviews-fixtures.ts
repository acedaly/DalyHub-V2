import { execFileSync } from "node:child_process";

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
      if (attempt === attempts || !isTransientD1Error(output)) throw error;
    }
  }
}

export async function cleanupReviewByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(`title = ${sqlLiteral(title)}`));
}

export async function cleanupAllReviewFixtures(): Promise<void> {
  await runCleanup(
    cleanupSql(`title LIKE ${sqlLiteral(`${REVIEW_TITLE_PREFIX}%`)}`),
  );
}
