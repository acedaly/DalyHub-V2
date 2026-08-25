import { expect, type Page } from "@playwright/test";

import { d1Execute } from "./d1";
import { gotoFixture } from "./helpers";
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
    /*
     * DEBT-200 — the three CASCADE children of `review_details`, deleted
     * explicitly rather than left to the foreign key.
     *
     * They were absent because nothing here had ever COMPLETED a fixture
     * Review: completing one captures a `review_insight_snapshots` row, and the
     * guided flow writes workflow state and step acknowledgements. Each of the
     * three cascades from `review_details`, so a database with foreign keys
     * enforced would clear them anyway — but a fixture that depends on a PRAGMA
     * being on is a fixture that leaks silently when it is not, and these rows
     * are read by the next run's Reviews insights.
     */
    `DELETE FROM review_insight_snapshots WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND review_id IN (${reviewSelection});`,
    `DELETE FROM review_step_acknowledgements WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND review_id IN (${reviewSelection});`,
    `DELETE FROM review_workflow_state WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND review_id IN (${reviewSelection});`,
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

/**
 * DEBT-200 — a COMPLETED weekly Review for the PRIOR period, carrying prose in
 * its next-period focus.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `ux-02-plan-habits.spec.ts`'s *"the Review focus is a real disclosure"*
 * journey called `test.skip()` on *"no prior Review focus in the seeded
 * workspace"*, and the seed holds no completed weekly Review at all — so the
 * journey had never once run, and CI reported it as skipped beside the passes.
 * The guard is RIGHT and is kept: driving whatever focus the workspace
 * genuinely holds, rather than a pinned id, is what stops the spec detaching
 * from a seed it no longer matches. What was missing was the fixture that
 * satisfies it (DEBT-158's conclusion, DEBT-173's rule: a spec owns the facts
 * it asserts).
 *
 * ── Through the product, not behind it ──────────────────────────────────────
 * Every step here is one an owner can perform: create a weekly Review, step the
 * period back once, write the focus, complete it. Writing `review_sections`
 * directly would be faster and would prove less — the planner reads what the
 * REVIEW wrote, and a fixture that invents that shape can drift from it.
 * `createMeasurableGoal` in `goal-fixtures.ts` makes the same choice for the
 * same reason.
 *
 * The caller MUST clean up with `cleanupReviewByTitle(title)`: this Review is
 * completed and dated in the past, so it would otherwise become a permanent
 * prior focus for every later run.
 */
export async function createCompletedPriorWeeklyReview(
  page: Page,
  title: string,
  focus: string,
): Promise<void> {
  await gotoFixture(page, "/reviews/new");
  await expect(page.getByRole("heading", { name: "New Review" })).toBeVisible();

  /*
   * ONE step back. `weeklyPeriod(addCalendarDays(start, -7))` — so the period
   * ends strictly before the current planning week begins, which is exactly
   * what `selectPriorPeriodFocus` requires and what makes this a PRIOR focus
   * rather than this week's own.
   */
  await page.getByRole("button", { name: "Previous" }).click();

  const titleInput = page.getByRole("textbox", { name: "Review title" });
  await titleInput.fill(title);
  await page.getByRole("button", { name: "Start Review" }).click();
  await expect(page).toHaveURL(/\/reviews\/[^/?#]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const heading = "Next-period focus";
  const section = page
    .locator(".dh-review-section")
    .filter({ has: page.getByRole("heading", { name: heading }) });
  await expect(section.locator('[data-editor-ready="true"]')).toBeVisible({
    timeout: 30_000,
  });
  await section.getByRole("textbox", { name: heading }).click();
  await page.keyboard.insertText(focus);

  // Awaited on the RESPONSE rather than on a toast: the planner reads the
  // stored section, so what matters is that the write landed.
  const saved = page.waitForResponse(
    (response) =>
      response.ok() &&
      response.url().includes("/mutate") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("summary.next_focus"),
  );
  await section.getByRole("button", { name: "Save" }).click();
  await saved;

  // Only a COMPLETED Review is eligible, so this step is the fixture, not
  // tidiness.
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(
    page.locator(".record-status", { hasText: /^Completed$/ }),
  ).toBeVisible();
}
