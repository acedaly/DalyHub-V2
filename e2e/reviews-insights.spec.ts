/**
 * REVIEW-03 — the Review evidence surface, end to end (real Worker + local D1).
 *
 * Four realistic Reviews, because the thing being tested is whether the surface
 * READS clearly, which no unit test can answer:
 *
 *   1. a first ever Review — one calm sentence, no trend, and no zeros;
 *   2. a useful populated Review — what changed, where it contributed, how
 *      health moved, what needs attention, where effort landed, and a trend;
 *   3. drill-down — every claim reaches the record behind it;
 *   4. the guided weekly Review opening on evidence instead of a fact grid;
 *
 * plus responsive behaviour at 390px and a laptop width, axe in light and dark,
 * and no horizontal overflow anywhere.
 *
 * The fixture (`seed-review-insights.sql`) is applied in `beforeAll` and removed
 * in `afterAll` rather than in the shared setup, so the extra Areas, Projects,
 * Tasks and Reviews it adds exist only while this file runs and cannot change
 * what any other journey sees.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";

const WORKSPACE = "local-dev-workspace";
const SEED_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "seed-review-insights.sql",
);

const CURRENT_REVIEW = "/reviews/ri-review-now?tab=progress";
const FIRST_REVIEW = "/reviews/ri-review-first?tab=progress";
const GUIDED_REVIEW = "/reviews/ri-review-now/guide?step=overview";

function wrangler(args: readonly string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

/** Every row this fixture owns, removed child-first. */
const CLEANUP = [
  `DELETE FROM review_insight_snapshots WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_step_acknowledgements WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_workflow_state WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_sections WHERE workspace_id = '${WORKSPACE}' AND review_id LIKE 'ri-%';`,
  `DELETE FROM review_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM activities WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-act-%';`,
  `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-l-%';`,
  `DELETE FROM task_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM project_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM goal_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM area_details WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE}' AND entity_id LIKE 'ri-%';`,
  `DELETE FROM entities WHERE workspace_id = '${WORKSPACE}' AND id LIKE 'ri-%';`,
].join("\n");

test.beforeAll(() => {
  wrangler(["d1", "execute", "DB", "--local", "--command", CLEANUP]);
  wrangler(["d1", "execute", "DB", "--local", "--file", SEED_FILE]);
});

test.afterAll(() => {
  try {
    wrangler(["d1", "execute", "DB", "--local", "--command", CLEANUP]);
  } catch {
    // Cleanup is best-effort; it must never fail an assertion a test made.
  }
});

function evidence(page: Page) {
  return page.locator(".dh-insights").first();
}

function section(page: Page, id: string) {
  return page.locator(`.dh-insights__section[data-section="${id}"]`);
}

/* -------------------------------------------------------------------------- */
/* 1 — the first ever Review                                                   */
/* -------------------------------------------------------------------------- */

test("a first Review says so, and does not invent a comparison", async ({
  page,
}) => {
  await gotoFixture(page, FIRST_REVIEW);
  await waitForInteractive(page);

  // It says WHY there is nothing to compare against, in one sentence.
  await expect(
    evidence(page).getByText(/first completed Review/),
  ).toBeVisible();
  // The two sections that need a previous Review are absent rather than empty.
  await expect(
    page.getByRole("heading", { name: "How Project health moved" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Over recent Reviews" }),
  ).toHaveCount(0);
  // And nothing is reported as a zero.
  await expect(evidence(page)).not.toContainText(
    /\b0 (Tasks|Projects|Goals)\b/,
  );
  await expectNoHorizontalOverflow(page);
});

/* -------------------------------------------------------------------------- */
/* 2 — a populated Review                                                      */
/* -------------------------------------------------------------------------- */

test("a populated Review answers what changed, what contributed and what needs a look", async ({
  page,
}) => {
  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);

  await expect(section(page, "movement")).toContainText("3 Tasks completed");

  // Goal contribution, with its reason — never a bare label.
  const goals = section(page, "goals");
  await expect(goals).toContainText("RI: A finished ground floor");
  await expect(goals).toContainText("Moving");
  await expect(goals).toContainText(/3 Tasks completed this period/);
  await expect(goals).toContainText("RI: Run a half marathon");
  await expect(goals).toContainText(/No (recent movement|completed work)/);

  // Health movement in BOTH directions, stated in words.
  const health = section(page, "health");
  await expect(health).toContainText("At risk → On track");
  await expect(health).toContainText("On track → At risk");

  // Attention: a commitment carried in from before the period, named.
  const attention = section(page, "attention");
  await expect(attention).toContainText(
    /\d+ overdue commitments? carried into this period/,
  );
  await expect(attention).toContainText(
    /already carrying over at your last Review/,
  );
  await expect(
    attention.getByRole("link", {
      name: "RI: Renew the loft building consent",
    }),
  ).toBeVisible();

  // Where effort landed — including the Area that received none.
  const distribution = section(page, "distribution");
  await expect(distribution).toContainText("RI: Home (3)");
  await expect(distribution).toContainText("RI: Health & Fitness");

  await expectNoHorizontalOverflow(page);
});

test("the trend is readable without the chart", async ({ page }) => {
  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);

  const trend = section(page, "trend");
  await expect(trend).toBeVisible();
  // The chart carries the same sentence as its accessible name…
  const chart = trend.getByRole("img", { name: /Tasks completed over/ });
  await expect(chart).toBeVisible();
  // …and the sentence is on the page in its own right, with every value.
  await expect(trend.locator(".dh-trend__summary")).toContainText(
    /up from 2 to 3/,
  );
  await expect(trend.locator(".dh-trend__axis li")).toHaveCount(2);
});

/* -------------------------------------------------------------------------- */
/* 3 — drill-down                                                              */
/* -------------------------------------------------------------------------- */

test("every claim reaches the record behind it", async ({ page }) => {
  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);

  await page
    .locator('.dh-insights__section[data-section="health"]')
    .getByRole("link", { name: "RI: Loft conversion" })
    .click();
  await expect(page).toHaveURL(/\/projects\/ri-proj-loft/);
  await expect(
    page.getByRole("heading", { level: 1, name: "RI: Loft conversion" }),
  ).toBeVisible();

  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);
  await page
    .locator('.dh-insights__section[data-section="goals"]')
    .getByRole("link", { name: "RI: Run a half marathon" })
    .click();
  await expect(page).toHaveURL(/\/goals\/ri-goal-fit/);

  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);
  await page
    .locator('.dh-insights__section[data-section="distribution"]')
    .getByRole("link", { name: "RI: Health & Fitness" })
    .click();
  await expect(page).toHaveURL(/\/areas\/ri-area-health/);
});

/* -------------------------------------------------------------------------- */
/* 4 — the guided weekly Review                                                */
/* -------------------------------------------------------------------------- */

test("the guided weekly Review opens on evidence, not on a grid of counts", async ({
  page,
}) => {
  await gotoFixture(page, GUIDED_REVIEW);
  await waitForInteractive(page);

  await expect(
    page.getByRole("heading", { level: 2, name: "Settle in" }),
  ).toBeVisible();
  await expect(section(page, "movement")).toContainText("3 Tasks completed");
  await expect(section(page, "attention")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

/* -------------------------------------------------------------------------- */
/* Responsive, accessible, both appearances                                    */
/* -------------------------------------------------------------------------- */

for (const [label, width, height] of [
  ["phone", 390, 844],
  ["laptop", 1280, 800],
  ["wide", 1440, 900],
] as const) {
  test(`the evidence surface fits ${label} without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await gotoFixture(page, CURRENT_REVIEW);
    await waitForInteractive(page);
    await expect(section(page, "movement")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // The chart is fluid: it never pushes its own container wider than the page.
    const overflow = await page.evaluate(() => {
      const plot = document.querySelector(".dh-trend__plot");
      if (!plot) return 0;
      return plot.getBoundingClientRect().width - document.body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`the evidence surface passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await gotoFixture(page, CURRENT_REVIEW);
    await waitForInteractive(page);
    await expect(section(page, "movement")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test(`the guided evidence step passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await gotoFixture(page, GUIDED_REVIEW);
    await waitForInteractive(page);
    await expect(section(page, "movement")).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test("the evidence surface is reachable by keyboard alone", async ({
  page,
}) => {
  await gotoFixture(page, CURRENT_REVIEW);
  await waitForInteractive(page);
  const link = section(page, "health").getByRole("link", {
    name: "RI: Loft conversion",
  });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects\/ri-proj-loft/);
});
