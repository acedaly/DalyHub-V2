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

import { expect, type Page } from "@playwright/test";
import { d1Execute } from "./d1";

export const ASSET_TITLE_PREFIX = "Assets e2e ";

/**
 * ASSET-03 — choose an Asset type in WHICHEVER presentation the viewport shows.
 *
 * The Type field is one control with two presentations: the DS-16 combobox on a
 * laptop, and the shared option Sheet below `md`. A journey should not care
 * which it got — it should care that the owner can choose "Trailer or camper" —
 * so every Asset spec goes through this one helper.
 */
export async function chooseAssetType(
  page: Page,
  label: string,
): Promise<void> {
  const combo = page.getByRole("combobox", { name: /Type/ });
  if (await combo.count()) {
    await combo.click();
    await combo.fill(label);
    await page
      .getByRole("option", { name: label, exact: true })
      .first()
      .click();
    return;
  }
  // The compact presentation: a trigger that opens the shared option sheet.
  await page.locator("button.dh-select-trigger").click();
  const sheet = page.getByRole("dialog", { name: "What kind of asset?" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: label, exact: true }).click();
  await expect(sheet).toBeHidden();
}

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
  // ASSET-02 — a "Create task" from an obligation mints a real Task, titled
  // "<obligation> — <asset title>". Those Tasks are found through the
  // OBLIGATION'S OWN POINTER rather than by matching their title: a title-suffix
  // LIKE built from a full test title blows past D1's pattern-length cap ("LIKE
  // or GLOB pattern too complex"), which is the same limit the note above records
  // for assets. The pointer is also exact, where a suffix match is a guess.
  //
  // The consequence is an ORDERING constraint: `obligation_details` must survive
  // until every Task-side delete has run, so it is removed last of the ASSET-02
  // tables rather than first.
  const taskSel = `SELECT task_id FROM obligation_details WHERE workspace_id = ${ws} AND task_id IS NOT NULL AND subject_entity_id IN (${assetSel})`;
  // V2.10 LIFE-01 — an obligation is an ENTITY now, so it has an Activity
  // subject pointer and links of its own, and `obligation_details.entity_id` is
  // an ON DELETE RESTRICT foreign key into `entities`. Its id is only reachable
  // THROUGH the detail row, which gives the same ordering constraint the linked
  // Task has: everything keyed by an obligation id must go while
  // `obligation_details` is still there, the detail rows go next, and the
  // now-orphaned obligation entities go last.
  const obligationSel = `SELECT entity_id FROM obligation_details WHERE workspace_id = ${ws} AND subject_entity_id IN (${assetSel})`;
  return [
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${assetSel}) OR target_entity_id IN (${assetSel}) OR source_entity_id IN (${noteSel}) OR target_entity_id IN (${noteSel}) OR source_entity_id IN (${taskSel}) OR target_entity_id IN (${taskSel}) OR source_entity_id IN (${obligationSel}) OR target_entity_id IN (${obligationSel}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND (entity_id IN (${assetSel}) OR entity_id IN (${noteSel}) OR entity_id IN (${taskSel}) OR entity_id IN (${obligationSel}));`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    // Task children, then the Task rows — all still resolvable through the
    // obligation pointer, which is why `obligation_details` has not gone yet.
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND id IN (${taskSel});`,
    // Now the ASSET-02 tables themselves (both FK to entities ON DELETE RESTRICT).
    `DELETE FROM asset_events WHERE workspace_id = ${ws} AND asset_id IN (${assetSel});`,
    `DELETE FROM obligation_details WHERE workspace_id = ${ws} AND subject_entity_id IN (${assetSel});`,
    // The obligation entities, now that nothing points at them. They are matched
    // as ORPHANS rather than by id because the only index from an Asset to its
    // obligations was the detail row deleted on the line above — and an
    // obligation entity with no detail slice is broken by construction, which is
    // the same reasoning as the orphaned-activities sweep further up.
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'obligation' AND NOT EXISTS (SELECT 1 FROM obligation_details d WHERE d.workspace_id = entities.workspace_id AND d.entity_id = entities.id);`,
    `DELETE FROM asset_details WHERE workspace_id = ${ws} AND entity_id IN (${assetSel});`,
    `DELETE FROM note_details WHERE workspace_id = ${ws} AND entity_id IN (${noteSel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'asset' AND ${match};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'note' AND ${match};`,
  ].join("\n");
}

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runCleanup(command: string | readonly string[]): Promise<void> {
  d1Execute(command);
}

/** Remove one test's Assets (and related Notes) by exact title. */
export async function cleanupAssetByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(title));
}

/** Suite-level sweep of anything left under the shared prefix by a crashed run. */
export async function cleanupAllAssetFixtures(): Promise<void> {
  await runCleanup(cleanupSql(`${ASSET_TITLE_PREFIX}%`));
}
