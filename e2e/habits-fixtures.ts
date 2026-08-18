/**
 * HABITS-01 — shared E2E fixtures for the Habits journeys.
 *
 * The specs create REAL Habit records in the seeded Worker/D1 app and must tear
 * them all down deterministically. Mirrors `assets-fixtures.ts`: one ordered,
 * retriable cleanup through the shared `d1Execute`, scoped strictly to the
 * test-owned title prefix so it can never touch a developer's own local data.
 *
 * Habits are removed dependents-first (every foreign key is ON DELETE RESTRICT):
 * completions, then schedule versions, then the links either endpoint of which
 * is a test Habit, then activity subjects + orphaned activities, then the
 * detail slice, and finally the entity row.
 */

import { expect, type Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";

export const HABIT_TITLE_PREFIX = "Habits e2e ";

const WORKSPACE_ID = "local-dev-workspace";

let counter = 0;

/** A per-test-unique title under the shared prefix. */
export function uniqueHabitTitle(label: string): string {
  counter += 1;
  return `${HABIT_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

/**
 * Choose a value in the shared select, in WHICHEVER presentation the viewport
 * shows.
 *
 * The field is one control with two presentations: the DS-16 combobox on a
 * laptop and the shared option Sheet below `md`. A journey should not care which
 * it got — it should care that the owner can choose "Every day" — so every
 * Habits spec goes through this one helper (`chooseAssetType`'s precedent).
 */
export async function chooseHabitOption(
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

function cleanupSql(title: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const value = sqlLiteral(title);
  // Exact match for a per-test title; a trailing `%` means the suite sweep,
  // which needs LIKE. D1 caps LIKE-pattern length well below SQLite's default,
  // so an exact `=` for a full title avoids "LIKE pattern too complex".
  const op = title.endsWith("%") ? "LIKE" : "=";
  const match = `title ${op} ${value}`;
  const sel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'habit' AND ${match}`;
  return [
    `DELETE FROM habit_completions WHERE workspace_id = ${ws} AND habit_id IN (${sel});`,
    `DELETE FROM habit_schedules WHERE workspace_id = ${ws} AND habit_id IN (${sel});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${sel}) OR target_entity_id IN (${sel}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND id NOT IN (SELECT activity_id FROM activity_subjects WHERE workspace_id = ${ws});`,
    `DELETE FROM habit_details WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'habit' AND ${match};`,
  ].join(" ");
}

/** Remove one Habit created by a test, dependents first. */
export function cleanupHabitByTitle(title: string): void {
  d1Execute(cleanupSql(title));
}

/** Remove every Habit the suite created, whatever spec created it. */
export function cleanupAllTestHabits(): void {
  d1Execute(cleanupSql(`${HABIT_TITLE_PREFIX}%`));
}
