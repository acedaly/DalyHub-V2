/**
 * V2.4-GATE-01 — shared E2E fixtures for the MEASURABLE-Goal journeys.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * [DEBT-158] `e2e/spine-workspaces.spec.ts`'s measurement journey — *"records a
 * measurement from the workspace and updates the trio and the chart"* — opened
 * `/goals`, looked for a Goal row carrying a `progressbar`, and called
 * `test.skip()` when it found none. MEASURED on the E2E database,
 * `SELECT COUNT(*) FROM goal_details WHERE target_value IS NOT NULL` is **0**,
 * so it found none, every time, and CI reported it as *"1 skipped"* beside the
 * passes. REDESIGN-04's measurement journey had therefore never once run.
 *
 * The guard itself was RIGHT and is kept: driving whichever Goal the workspace
 * is genuinely measuring, rather than a pinned fixture id, is what stops the
 * journey silently detaching from a seed it no longer matches. What was missing
 * was the fixture that satisfies it — so the journey now creates one, in the
 * manner of `habits-fixtures.ts`, and the guard becomes an assertion instead of
 * an exit.
 *
 * ── Why the spec owns it instead of the shared seed ──────────────────────────
 * DEBT-158 states the alternative and why it was refused: the shared seed is
 * read by Today, analytics, the Review evidence and the Goals collection, so
 * adding a measurable Goal to it — and then a measurement written into it by
 * every run of the journey — is a fixture change with a blast radius across
 * every partition. A test owns the facts it asserts (DEBT-173); this is that
 * rule applied to the one journey that was failing it in the other direction.
 *
 * ── Teardown ────────────────────────────────────────────────────────────────
 * One ordered, retriable cleanup through the shared `d1Execute`, scoped to the
 * test-owned title, dependents first — measurements and milestones (both
 * `RESTRICT` children of the Goal), then links either endpoint of which is the
 * Goal, then its activity subjects and any activity left with no subject, then
 * the detail slice and the spine row, and finally the entity.
 *
 * The prefix is the SAME `"Goal e2e "` that `e2e/setup-local-db.mjs` already
 * sweeps before seeding, so a run interrupted between `beforeEach` and
 * `afterEach` is cleaned up by the next setup rather than accumulating. That
 * sweep does not know about `goal_measurements` or `goal_milestones` — it
 * predates them — which is a second reason the cleanup lives here, next to the
 * fixture that creates the rows.
 */

import { expect, type Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import { ownerDayPlus } from "./calendar-dates";
import { gotoFixture, waitForInteractive } from "./helpers";

/**
 * The shared prefix, matching the one `setup-local-db.mjs` sweeps.
 *
 * Deliberately not a new prefix: a second one would mean a second sweep to
 * remember, and the existing sweep is the safety net for an interrupted run.
 */
export const GOAL_FIXTURE_TITLE_PREFIX = "Goal e2e ";

const WORKSPACE_ID = "local-dev-workspace";

/** The Area every fixture Goal is created under — the permanent seed Area. */
export const FIXTURE_AREA_ID = "a-dh";

let counter = 0;

/**
 * A per-test-unique title under the shared prefix.
 *
 * Unique by construction rather than by hope: the timestamp separates runs and
 * the counter separates tests inside one run, so two journeys in the same
 * partition can each own a measurable Goal without either seeing the other's.
 */
export function uniqueGoalTitle(label: string): string {
  counter += 1;
  return `${GOAL_FIXTURE_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

/**
 * Create a MEASURABLE Goal through the product's own creation flow.
 *
 * Through the UI rather than by writing `goal_details` directly, and that is the
 * point: a fixture inserted behind the product can drift from what the product
 * would actually have written, and the journey would then be proving the
 * arithmetic against a shape no owner can create. This is the same flow
 * `goal-measurement.spec.ts` drives, so the two specs cannot disagree about
 * what a measurable Goal is.
 *
 * Returns the created Goal's record URL.
 */
export async function createMeasurableGoal(
  page: Page,
  title: string,
  options: {
    readonly unit?: string;
    readonly baseline?: string;
    readonly target?: string;
    readonly targetDate?: string;
  } = {},
): Promise<string> {
  const {
    unit = "km",
    baseline = "0",
    target = "100",
    // Four months out, from the owner's day: a fixed target stops being a
    // target the day the calendar passes it (CONV-00-E).
    targetDate = ownerDayPlus(120),
  } = options;

  await gotoFixture(page, `/areas/${FIXTURE_AREA_ID}`);
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.getByRole("link", { name: "New Goal" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New Goal" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Title/).fill(title);

  // The creation flow ASKS how the Goal will be measured; a Goal that answers
  // "a target value" is the only kind that draws a progressbar, which is the
  // whole reason this fixture exists.
  await dialog.getByTestId("new-goal-measurement-target_value").check();
  await dialog.getByRole("textbox", { name: /^Measure in/ }).fill(unit);
  await dialog.getByRole("textbox", { name: /^Starting value/ }).fill(baseline);
  await dialog.getByRole("textbox", { name: /^Target value/ }).fill(target);
  await dialog.getByLabel("Target date").fill(targetDate);

  await dialog.getByRole("button", { name: "Create Goal" }).click();
  await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
  await waitForInteractive(page);
  return page.url();
}

function cleanupSql(title: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const value = sqlLiteral(title);
  // Exact match for a per-test title; a trailing `%` means the suite sweep,
  // which needs LIKE. D1 caps LIKE-pattern length well below SQLite's default,
  // so an exact `=` for a full title avoids "LIKE pattern too complex".
  const op = title.endsWith("%") ? "LIKE" : "=";
  const match = `title ${op} ${value}`;
  const sel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'goal' AND ${match}`;
  // Deleted by ACTIVITY id rather than by subject entity: creating a Goal under
  // an Area also records the AREA as a subject of the same activity, so scoping
  // the subject delete to the test entity alone would leave a row on the
  // permanent `a-dh` fixture Area forever, silently inflating its Activity feed
  // across runs. This is the lesson `setup-local-db.mjs` already learned for
  // the AREA-02 journey, applied here.
  const activities = `SELECT DISTINCT activity_id FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${sel})`;
  return [
    `DELETE FROM goal_measurements WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM goal_milestones WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND activity_id IN (${activities});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND id NOT IN (SELECT activity_id FROM activity_subjects WHERE workspace_id = ${ws});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${sel}) OR target_entity_id IN (${sel}));`,
    `DELETE FROM goal_details WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'goal' AND ${match};`,
  ].join(" ");
}

/** Remove one Goal created by a test, dependents first. */
export function cleanupGoalByTitle(title: string): void {
  d1Execute(cleanupSql(title));
}

/** Remove every fixture Goal the suite created, whatever spec created it. */
export function cleanupAllTestGoals(): void {
  d1Execute(cleanupSql(`${GOAL_FIXTURE_TITLE_PREFIX}%`));
}
