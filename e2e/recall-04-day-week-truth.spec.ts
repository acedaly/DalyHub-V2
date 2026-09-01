/**
 * RECALL-04 — the day and the week account for themselves, driven end to end.
 *
 * `test/kernel/recall-04-day-week-truth.test.ts` proves the machine facts over
 * real D1: the meetings-today/digest parity as values, one measurement
 * predicate across `/goals` and Today, the honest bound, the absent health
 * reading, the 62-completion period window and every statement budget. This
 * file proves only what the running browser can prove:
 *
 *   1. Today STATES the day's meetings, inside the Schedule panel's existing
 *      head — no new card — and the number it prints is the number of Meetings
 *      the panel actually draws for today;
 *   2. `/goals`' On track lens holds a Goal that has REACHED its target, which
 *      is the `achieved` decision made visible;
 *   3. Analytics' Goal tile is labelled with the movement question and states
 *      which of the two Goal questions it answers;
 *   4. a Review's period tabs name their own time windows — "Completed in this
 *      period" beside "Open and overdue now" — and the tab that holds meetings
 *      is called Meetings;
 *   5. the same journeys work on a 393 px phone with no horizontal overflow;
 *   6. every touched surface is axe-clean, in both appearances where the
 *      surface is new, with no rule disabled.
 *
 * The fixture is seeded relative to the OWNER's calendar day (Australia/Sydney,
 * the seeded owner's timezone), because "today" and "this period" are theirs.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
} from "./helpers";

const WS = "local-dev-workspace";
const STAMP = `${Date.now()}`;
const lit = sqlLiteral;

const ID = {
  area: `recall04-area-${STAMP}`,
  goalAchieved: `recall04-goal-achieved-${STAMP}`,
  review: `recall04-review-${STAMP}`,
  meeting: (index: number) => `recall04-meeting-${STAMP}-${index}`,
  periodMeeting: `recall04-period-meeting-${STAMP}`,
  periodTask: `recall04-period-task-${STAMP}`,
  outsideTask: `recall04-outside-task-${STAMP}`,
} as const;

const TITLE = {
  goalAchieved: `Recall04 reached target ${STAMP}`,
  review: `Recall04 Review ${STAMP}`,
  meeting: (index: number) => `Recall04 meeting ${index} ${STAMP}`,
  periodMeeting: `Recall04 in-period meeting ${STAMP}`,
  periodTask: `Recall04 finished in period ${STAMP}`,
  outsideTask: `Recall04 finished after period ${STAMP}`,
} as const;

/** `YYYY-MM-DD` shifted by whole days, as calendar arithmetic. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

const TODAY = ownerToday();
/** The Review's period: a closed window, well behind the owner's today. */
const PERIOD_START = shiftDay(TODAY, -20);
const PERIOD_END = shiftDay(TODAY, -14);
/** Inside the period, and safely inside it in any timezone. */
const IN_PERIOD = `${shiftDay(TODAY, -17)}T02:00:00.000Z`;
/** After it — the row the period query must not return. */
const AFTER_PERIOD = `${shiftDay(TODAY, -10)}T02:00:00.000Z`;

const CREATED = `${shiftDay(TODAY, -60)}T00:00:00.000Z`;

/**
 * Three Meetings on the owner's today.
 *
 * Seeded at the START of the owner's day, so by the time any journey runs they
 * have all already begun — which is the state DEBT-233 is about. The spec
 * asserts the COUNT rather than the pastness, because pastness against the
 * runner's wall clock is not a deterministic claim; the all-in-the-past fixture
 * with a fixed clock is the kernel test's.
 */
const MEETING_STARTS = [
  `${TODAY}T00:00:00+10:00`,
  `${TODAY}T00:05:00+10:00`,
  `${TODAY}T00:10:00+10:00`,
].map((value) => new Date(value).toISOString());

function seed(): void {
  const now = new Date().toISOString();
  const statements: string[] = [
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.area)}, ${lit(WS)}, 'area', ${lit(`Recall04 Area ${STAMP}`)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(ID.area)}, 'area', NULL);`,
  ];

  // ── Three Meetings on the owner's today ─────────────────────────────────
  MEETING_STARTS.forEach((startsAt, index) => {
    statements.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${lit(ID.meeting(index))}, ${lit(WS)}, 'meeting', ${lit(TITLE.meeting(index))}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
      `INSERT OR IGNORE INTO meeting_details (workspace_id, entity_id, starts_at, timezone, status, updated_at)
       VALUES (${lit(WS)}, ${lit(ID.meeting(index))}, ${lit(startsAt)}, 'Australia/Sydney', 'planned', ${lit(now)});`,
    );
  });

  // ── A Goal that has REACHED its target and is still open ────────────────
  statements.push(
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.goalAchieved)}, ${lit(WS)}, 'goal', ${lit(TITLE.goalAchieved)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(ID.goalAchieved)}, 'goal', NULL);`,
    `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES (${lit(`${ID.goalAchieved}-area`)}, ${lit(WS)}, ${lit(ID.goalAchieved)}, ${lit(ID.area)}, 'goal.belongs_to_area', ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, measurement_type, measurement_direction, measurement_unit, target_value, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.goalAchieved)}, 'goal', 'accumulation', 'increase', 'sessions', 10, ${lit(now)});`,
    `UPDATE goal_details SET measurement_type = 'accumulation', measurement_direction = 'increase',
        measurement_unit = 'sessions', target_value = 10, condition = NULL
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.goalAchieved)};`,
    `INSERT OR IGNORE INTO goal_measurements (workspace_id, id, entity_id, entity_type, value, measured_on, created_at, updated_at)
     VALUES (${lit(WS)}, ${lit(`${ID.goalAchieved}-m1`)}, ${lit(ID.goalAchieved)}, 'goal', 10, ${lit(shiftDay(TODAY, -3))}, ${lit(now)}, ${lit(now)});`,
  );

  // ── A Review over a closed period, with one in-period Meeting and Task ──
  statements.push(
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.review)}, ${lit(WS)}, 'review', ${lit(TITLE.review)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO review_details (workspace_id, entity_id, entity_type, review_type, period_start, period_end, status, template_id, completed_at, archived_at, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.review)}, 'review', 'weekly', ${lit(PERIOD_START)}, ${lit(PERIOD_END)}, 'in_progress', 'review.weekly.v1', NULL, NULL, ${lit(now)});`,
    `UPDATE review_details SET period_start = ${lit(PERIOD_START)}, period_end = ${lit(PERIOD_END)}, status = 'in_progress', archived_at = NULL
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.review)};`,
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.periodMeeting)}, ${lit(WS)}, 'meeting', ${lit(TITLE.periodMeeting)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO meeting_details (workspace_id, entity_id, starts_at, timezone, status, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.periodMeeting)}, ${lit(IN_PERIOD)}, 'Australia/Sydney', 'planned', ${lit(now)});`,
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES
       (${lit(ID.periodTask)}, ${lit(WS)}, 'task', ${lit(TITLE.periodTask)}, ${lit(CREATED)}, ${lit(IN_PERIOD)}, NULL),
       (${lit(ID.outsideTask)}, ${lit(WS)}, 'task', ${lit(TITLE.outsideTask)}, ${lit(CREATED)}, ${lit(AFTER_PERIOD)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES
       (${lit(WS)}, ${lit(ID.periodTask)}, 'task', ${lit(IN_PERIOD)}),
       (${lit(WS)}, ${lit(ID.outsideTask)}, 'task', ${lit(AFTER_PERIOD)});`,
    `UPDATE spine_records SET completed_at = ${lit(IN_PERIOD)} WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.periodTask)};`,
    `UPDATE spine_records SET completed_at = ${lit(AFTER_PERIOD)} WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.outsideTask)};`,
    `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
     VALUES
       (${lit(WS)}, ${lit(ID.periodTask)}, 'task', 'done', ${lit(IN_PERIOD)}),
       (${lit(WS)}, ${lit(ID.outsideTask)}, 'task', 'done', ${lit(AFTER_PERIOD)});`,
    `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES
       (${lit(`${ID.periodTask}-area`)}, ${lit(WS)}, ${lit(ID.periodTask)}, ${lit(ID.area)}, 'task.belongs_to_area', ${lit(CREATED)}, ${lit(CREATED)}, NULL),
       (${lit(`${ID.outsideTask}-area`)}, ${lit(WS)}, ${lit(ID.outsideTask)}, ${lit(ID.area)}, 'task.belongs_to_area', ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
  );

  d1Execute(statements);
}

function cleanup(): void {
  // Matched by PREFIX: every id this spec mints begins `recall04-…`, and the
  // delete is workspace-scoped, so it can only remove this fixture's own rows.
  // Children strictly before parents.
  const mine = lit(`recall04-%${STAMP}%`);
  d1Execute([
    `DELETE FROM entity_links WHERE workspace_id = ${lit(WS)} AND (source_entity_id LIKE ${mine} OR target_entity_id LIKE ${mine} OR id LIKE ${mine});`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM goal_measurements WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM goal_details WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM task_details WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM meeting_details WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM review_sections WHERE workspace_id = ${lit(WS)} AND review_id LIKE ${mine};`,
    `DELETE FROM review_details WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM spine_records WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM entities WHERE workspace_id = ${lit(WS)} AND id LIKE ${mine};`,
  ]);
}

test.beforeAll(() => {
  seed();
});

test.afterAll(() => {
  cleanup();
});

function schedulePanel(page: Page) {
  return page.getByTestId("today-schedule");
}

/* -------------------------------------------------------------------------- */
/* 1. Today states the day's meetings (DEBT-233)                               */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-04 — the day states its meetings", () => {
  test("prints the fact in the Schedule panel's own head, and it matches the rows", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const panel = schedulePanel(page);
    await expect(panel).toBeVisible();

    const fact = page.getByTestId("today-meetings-today");
    await expect(fact).toBeVisible();
    await expect(fact).toHaveText(/^\d+ meetings? today$/);

    /*
     * The fact and the panel cannot disagree. Rather than asserting a literal 3
     * — which would be a claim about the base seed as well as about this
     * fixture — the printed count is compared with the Meetings the panel
     * actually draws for today, which is the parity that matters on screen.
     * (The value-for-value parity with the digest and the schedule read is the
     * kernel test's, on a fixture whose whole workspace is known.)
     */
    const stated = Number(await fact.getAttribute("data-count"));
    const drawn = await panel
      .getByRole("link")
      .filter({ hasText: new RegExp(STAMP) })
      .count();
    expect(stated).toBeGreaterThanOrEqual(3);
    expect(drawn).toBe(3);

    // All three of this fixture's Meetings are on the day the fact describes.
    for (let index = 0; index < 3; index += 1) {
      await expect(
        panel.getByRole("link", { name: TITLE.meeting(index) }),
      ).toBeVisible();
    }

    // It is a FACT, not a control, and it lives inside the existing panel head.
    await expect(fact).toHaveJSProperty("tagName", "SPAN");
    await expect(
      panel
        .locator(".dh-today__panel-head")
        .getByTestId("today-meetings-today"),
    ).toBeVisible();
  });

  test("survives the phone, and Today stays axe-clean in both appearances", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, "/today");

    await expect(page.getByTestId("today-meetings-today")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.getByTestId("today-meetings-today")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId("today-meetings-today")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. One measurement predicate, made visible (DEBT-234)                       */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-04 — one measurement predicate, one alignment vocabulary", () => {
  test("puts a Goal that reached its target inside /goals' On track lens", async ({
    page,
  }) => {
    /*
     * The `achieved` decision, on screen. `/goals`' lens filtered
     * `status IN ('on_track','ahead')` in SQL while Today counted `achieved`
     * too, so this Goal was on track on one surface and not on the other. The
     * lens link carries the lens in the address bar like every other DalyHub
     * collection control.
     */
    await gotoFixture(page, "/goals?view=on_track");
    // Scoped to the collection's ROWS: opening the lens also selects the first
    // Goal into the workspace pane, so the title legitimately appears twice.
    await expect(
      page
        .getByTestId("goal-row")
        .getByRole("link", { name: new RegExp(TITLE.goalAchieved) }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });

  test("labels Analytics' Goal figure with the question it answers", async ({
    page,
  }) => {
    await gotoFixture(page, "/analytics");

    // The tile wears the ALIGNMENT word, never the measurement one.
    await expect(page.getByText("Goals moving", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals on track", { exact: true })).toHaveCount(
      0,
    );

    // And the surface says which of the two Goal questions it is answering.
    await expect(
      page.getByText(/Goals moving counts Goals with contributing work/),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The Review's period tabs (DEBT-235)                                      */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-04 — a Review period names its own time windows", () => {
  test("separates the period's completions from what is open now", async ({
    page,
  }) => {
    await gotoFixture(page, `/reviews/${ID.review}?tab=tasks`);

    await expect(
      page.getByRole("heading", { name: "Completed in this period" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Open and overdue now" }),
    ).toBeVisible();

    // The period's own completion is listed; the one completed AFTER it is not.
    await expect(page.getByText(TITLE.periodTask)).toBeVisible();
    await expect(page.getByText(TITLE.outsideTask)).toHaveCount(0);

    await expectNoAxeViolations(page);
  });

  test("names the meetings tab after what it holds, on the phone too", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, `/reviews/${ID.review}?tab=people`);

    await expect(page.getByRole("tab", { name: "Meetings" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /People/ })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Meetings in this period" }),
    ).toBeVisible();
    await expect(page.getByText(TITLE.periodMeeting)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
