/**
 * V2.10 LIFE-02 — Life Admin test fixtures and cleanup.
 *
 * Obligations created by a journey are removed dependents-first through the
 * shared `d1Execute`, scoped strictly to the test-owned title prefix so a run
 * can never touch a developer's own local data. Every foreign key on the way in
 * is `ON DELETE RESTRICT`, so the order below is the constraints', not a
 * preference: the subject link and the linked-Task link, then the Activity
 * subject pointers, then any Task the journey minted from an obligation, then
 * the detail slice, then the entity row.
 *
 * A completed obligation may have created a SUCCESSOR carrying the same title —
 * which is the point of a recurring obligation — so the sweep matches by title
 * and takes the whole series with it.
 */

import { expect, type Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";

export const OBLIGATION_TITLE_PREFIX = "Life Admin e2e ";

const WORKSPACE_ID = "local-dev-workspace";

let counter = 0;

/** A per-test-unique title under the shared prefix. */
export function uniqueObligationTitle(label: string): string {
  counter += 1;
  return `${OBLIGATION_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

function cleanupSql(title: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const value = sqlLiteral(title);
  /*
   * Exact match for a per-test title; a trailing `%` means the suite sweep,
   * which needs LIKE. D1 caps LIKE-pattern length well below SQLite's default,
   * so an exact `=` for a full title avoids "LIKE pattern too complex".
   */
  const op = title.endsWith("%") ? "LIKE" : "=";
  const match = `title ${op} ${value}`;
  const sel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'obligation' AND ${match}`;
  /*
   * V2.10 LIFE-03 — a journey may mint a real Task from an obligation, and that
   * Task outlives the obligation unless it is swept here. An orphaned Task is
   * not merely litter: it is an open row in a collection that pages, which is
   * how a later spec's "is my task in this band?" becomes a question about the
   * run order rather than about the product (DEBT-173).
   *
   * The Tasks are found through the OBLIGATION'S OWN POINTER rather than by
   * title, which is exact where a title match would be a guess — and it forces
   * the ordering below: `obligation_details` survives until every Task-side
   * delete has run.
   */
  const taskSel = `SELECT task_id FROM obligation_details WHERE workspace_id = ${ws} AND task_id IS NOT NULL AND entity_id IN (${sel})`;
  return [
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${sel}) OR target_entity_id IN (${sel}) OR source_entity_id IN (${taskSel}) OR target_entity_id IN (${taskSel}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND (entity_id IN (${sel}) OR entity_id IN (${taskSel}));`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND id NOT IN (SELECT activity_id FROM activity_subjects WHERE workspace_id = ${ws});`,
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${taskSel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'task' AND id IN (${taskSel});`,
    `DELETE FROM obligation_details WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'obligation' AND ${match};`,
  ].join(" ");
}

/** Remove one obligation created by a test, dependents first. */
export function cleanupObligationByTitle(title: string): void {
  d1Execute(cleanupSql(title));
}

/** Remove every obligation the suite created, whatever spec created it. */
export function cleanupAllTestObligations(): void {
  d1Execute(cleanupSql(`${OBLIGATION_TITLE_PREFIX}%`));
}

/**
 * Choose a value in the shared select, in WHICHEVER presentation the viewport
 * shows.
 *
 * The field is one control with two presentations: the DS-16 combobox on a
 * laptop and the shared option Sheet below `md`. A journey should not care which
 * it got — it should care that the owner can choose "Every year" — so every Life
 * Admin spec goes through this one helper (`chooseHabitOption`'s precedent).
 */
export async function chooseObligationOption(
  page: Page,
  field: RegExp,
  label: string,
  sheetTitle: RegExp,
): Promise<void> {
  const combo = page.getByRole("combobox", { name: field });
  if (await combo.count()) {
    await combo.click();
    await combo.fill(label);
    await page
      .getByRole("option", { name: label, exact: true })
      .first()
      .click();
    return;
  }
  await page.getByRole("button", { name: field }).click();
  const sheet = page.getByRole("dialog", { name: sheetTitle });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: label, exact: true }).click();
  await expect(sheet).toBeHidden();
}
