/**
 * ASSET-01 — shared E2E fixtures for the Assets journeys.
 *
 * The Assets spec creates real Asset records (and, for the linking journey, one
 * related Note) in the seeded Worker/D1 app, then must tear them ALL down
 * deterministically. Mirrors `meetings-fixtures.ts`: one ordered, single-invocation,
 * retriable cleanup, scoped strictly to the test-owned title prefix so it can never
 * touch a developer's own local data.
 *
 * Assets are removed dependents-first (every FK is ON DELETE RESTRICT): links where
 * either endpoint is a test Asset, then activity subjects + orphaned activities, the
 * `asset_details` slice, and finally the entity row.
 */

import { execFileSync } from "node:child_process";

export const ASSET_TITLE_PREFIX = "Assets e2e ";

let counter = 0;

/** A per-test-unique title under the shared prefix. */
export function uniqueAssetTitle(label: string): string {
  counter += 1;
  return `${ASSET_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const WORKSPACE_ID = "local-dev-workspace";

function cleanupSql(title: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const value = sqlLiteral(title);
  // Exact match for a per-test title; a trailing `%` means the suite sweep, which
  // needs LIKE. Cloudflare D1 caps LIKE-pattern length well below SQLite's default,
  // so an exact `=` for a full title avoids "LIKE pattern too complex".
  const op = title.endsWith("%") ? "LIKE" : "=";
  const match = `title ${op} ${value}`;
  const assetSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'asset' AND ${match}`;
  const noteSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'note' AND ${match}`;
  // ASSET-02 — a "Create task" from an obligation mints a Task titled
  // "<obligation> — <asset title>", so it is swept by the asset title suffix
  // rather than the shared prefix. Still strictly scoped to test-owned data.
  const taskMatch = title.endsWith("%")
    ? `title LIKE '%' || ${sqlLiteral(title.slice(0, -1))} || '%'`
    : `title LIKE '%' || ${value}`;
  const taskSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND ${taskMatch}`;
  return [
    // ASSET-02 children first: both reference entities ON DELETE RESTRICT.
    `DELETE FROM asset_events WHERE workspace_id = ${ws} AND asset_id IN (${assetSel});`,
    `DELETE FROM asset_obligations WHERE workspace_id = ${ws} AND asset_id IN (${assetSel});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${assetSel}) OR target_entity_id IN (${assetSel}) OR source_entity_id IN (${noteSel}) OR target_entity_id IN (${noteSel}) OR source_entity_id IN (${taskSel}) OR target_entity_id IN (${taskSel}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND (entity_id IN (${assetSel}) OR entity_id IN (${noteSel}) OR entity_id IN (${taskSel}));`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM asset_details WHERE workspace_id = ${ws} AND entity_id IN (${assetSel});`,
    `DELETE FROM note_details WHERE workspace_id = ${ws} AND entity_id IN (${noteSel});`,
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND ${taskMatch};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'asset' AND ${match};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'note' AND ${match};`,
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

/** Remove one test's Assets (and related Notes) by exact title. */
export async function cleanupAssetByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(title));
}

/** Suite-level sweep of anything left under the shared prefix by a crashed run. */
export async function cleanupAllAssetFixtures(): Promise<void> {
  await runCleanup(cleanupSql(`${ASSET_TITLE_PREFIX}%`));
}
