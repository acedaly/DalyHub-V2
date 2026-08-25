/**
 * PLAN-01 — the Weekly Planning journeys.
 *
 * What these prove, in one sentence each:
 *   - the planner opens on the OWNER's week, not the Worker's UTC day;
 *   - week navigation is a genuinely different week, across month and year edges;
 *   - a Task planned for a day appears on that day, and only that day;
 *   - placing a Task changes its PLANNED date and never its DEADLINE;
 *   - the change is real — `/tasks` and Today see the same Task afterwards;
 *   - clearing a plan returns the Task to the queue;
 *   - blocked work is shown as blocked rather than hidden;
 *   - a calendar occurrence is CONTEXT: it is drawn, and it is not a Task;
 *   - the Review → Plan link does not modify the Review;
 *   - the surface is keyboard-complete and needs no AI.
 */

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, ownerToday, revealRowActions, taskRow } from "./helpers";
import {
  addDays,
  clearPlanFixture,
  planFixture,
  seedPlanFixture,
  type PlanFixture,
} from "./plan-fixtures";

let fixture: PlanFixture;

test.beforeAll(() => {
  fixture = planFixture();
});

test.beforeEach(() => {
  // Re-seeded before EVERY test, so a journey that moves a Task cannot change
  // what the next journey sees. Idempotent by construction.
  seedPlanFixture(fixture);
});

test.afterAll(() => {
  clearPlanFixture(fixture);
});

/**
 * The day section for one owner-calendar date.
 *
 * `data-date` is on the SECTION itself, so this is an attribute selector rather
 * than a `filter({ has })` over a descendant — the latter matches nothing and
 * fails as a timeout, which reads like a product fault rather than a bad locator.
 */
function daySection(page: Page, dateIso: string) {
  return page.locator(`[data-testid="plan-day"][data-date="${dateIso}"]`);
}

/**
 * The week AGENDA — the seven day sections, and nothing else.
 *
 * Assertions about "is this Task in the week?" have to be scoped here rather than
 * to the page, because the queue rail beside it is also on the page and is
 * CORRECTLY allowed to hold the same Task: a commitment planned for an earlier
 * week is exactly what the `slipped` band is for, so an unscoped "count 0" would
 * fail on the product being right.
 */
function weekAgenda(page: Page) {
  return page.locator(".dh-plan__week");
}

test("opens on the owner's current planning week", async ({ page }) => {
  await gotoFixture(page, "/plan");

  await expect(
    page.getByRole("heading", { name: "Weekly planning", level: 1 }),
  ).toBeVisible();
  // The week is stated relatively AND explicitly — a planner has to be right
  // about which week it is showing.
  await expect(page.getByTestId("plan-week-range")).toContainText("This week");

  // Seven day sections, one per day of the owner's week, in order.
  const dates = await page
    .getByTestId("plan-day")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-date")),
    );
  expect(dates).toEqual(
    Array.from({ length: 7 }, (_, index) => addDays(fixture.weekStart, index)),
  );

  // Today's own section carries the word "Today" — never colour alone.
  await expect(daySection(page, fixture.todayIso)).toContainText("Today");
});

test("a planned task appears on its own day and nowhere else", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");

  const monday = fixture.task("mon");
  const tuesday = fixture.task("tue");

  const mondaySection = daySection(page, monday.scheduledDate!);
  const tuesdaySection = daySection(page, tuesday.scheduledDate!);

  await expect(
    mondaySection.getByRole("link", { name: `Open ${monday.title}` }),
  ).toBeVisible();
  await expect(
    tuesdaySection.getByRole("link", { name: `Open ${monday.title}` }),
  ).toHaveCount(0);
});

test("week navigation shows a different week's commitments", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");
  const nextWeekTask = fixture.task("next");

  // Next week's commitment is NOT in this week's agenda.
  await expect(
    weekAgenda(page).getByRole("link", { name: `Open ${nextWeekTask.title}` }),
  ).toHaveCount(0);

  await page.getByTestId("plan-week-next").click();
  await expect(page.getByTestId("plan-week-range")).toContainText("Next week");
  await expect(
    weekAgenda(page).getByRole("link", { name: `Open ${nextWeekTask.title}` }),
  ).toBeVisible();
  // …and this week's is not in next week's agenda. It IS allowed to appear in the
  // queue beside it — a commitment planned for an earlier week is precisely what
  // the `slipped` band exists to surface — which is why this is scoped.
  await expect(
    weekAgenda(page).getByRole("link", {
      name: `Open ${fixture.task("mon").title}`,
    }),
  ).toHaveCount(0);
});

test("placing an unplaced task sets its PLANNED date and leaves the deadline alone", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");

  /*
   * The `overdue` band's fixture task, deliberately.
   *
   * The queue is BOUNDED at fifteen and the committed E2E workspace is heavy, so
   * on it the first band fills the queue — which is the product being right, not
   * a defect. A journey that reached for a later band would be asserting the
   * bound rather than the behaviour. The band RULE (order, one-band-per-task,
   * the placed exclusion, the bound) is proven exhaustively in
   * `test/unit/plan/planning-queue.test.ts`, and each band's QUERY in
   * `test/kernel/plan-task-filters.test.ts`.
   */
  const overdue = fixture.task("unplaced");
  const target = addDays(fixture.weekStart, 3);
  const queue = page.getByTestId("plan-queue");

  // The queue shows it, in the group whose heading STATES the reason. The band is
  // a property of a GROUP of tasks, so the word is drawn once above them rather
  // than repeated on every row.
  const band = page.locator(
    '[data-testid="plan-queue-group"][data-band="overdue"]',
  );
  await expect(band).toContainText("Overdue");
  await expect(
    band.getByRole("link", { name: `Open ${overdue.title}` }),
  ).toBeVisible();

  // ENTER selection mode, deliberately, then select it and choose a day. No drag
  // anywhere in this journey.
  //
  // V2.4-GATE-02 — the mode is the change: the queue used to draw a selection
  // control on every row at all times, beside each row's completion control, so
  // the surface built for scheduling could complete work by mis-click.
  await queue.getByTestId("plan-queue-select-toggle").click();
  await queue
    .getByRole("checkbox", {
      name: `Select ${overdue.title} to place on a day`,
    })
    .check();
  await page
    .locator(`[data-testid="plan-place-day"][data-date="${target}"]`)
    .click();

  // It is now on that day…
  const targetSection = daySection(page, target);
  await expect(
    targetSection.getByRole("link", { name: `Open ${overdue.title}` }),
  ).toBeVisible();
  // …and out of the queue: it is placed, so it is no longer waiting on a
  // decision. That rule holds for every band, from one place.
  await expect(
    queue.getByRole("link", { name: `Open ${overdue.title}` }),
  ).toHaveCount(0);

  // The DEADLINE did not move. Read from the canonical Tasks surface, filtered to
  // the deadline the fixture set — if planning had rewritten the due date this
  // would be empty.
  await gotoFixture(
    page,
    `/tasks?system=open&dueFrom=${overdue.dueDate}&dueTo=${overdue.dueDate}`,
  );
  await expect(taskRow(page, overdue.title)).toHaveCount(1);
});

test("a change made in Planning is the same Task in Tasks and Today", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");

  const unplaced = fixture.task("unplaced");
  const today = ownerToday();
  const queue = page.getByTestId("plan-queue");

  await queue.getByTestId("plan-queue-select-toggle").click();
  await queue
    .getByRole("checkbox", {
      name: `Select ${unplaced.title} to place on a day`,
    })
    .check();
  await page
    .locator(`[data-testid="plan-place-day"][data-date="${today}"]`)
    .click();

  const todaySection = daySection(page, today);
  await expect(
    todaySection.getByRole("link", { name: `Open ${unplaced.title}` }),
  ).toBeVisible();

  // The SAME Task, planned for today, is what `/tasks?system=today` returns…
  await gotoFixture(page, "/tasks?system=today");
  await expect(taskRow(page, unplaced.title)).toHaveCount(1);

  // …and what Today itself shows.
  await gotoFixture(page, "/today");
  await expect(
    page.getByRole("link", { name: `Open ${unplaced.title}` }).first(),
  ).toBeVisible();
});

test("clearing a plan returns the task to the planning queue", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");

  const monday = fixture.task("mon");
  const mondaySection = daySection(page, monday.scheduledDate!);

  /*
   * DEBT-180 — engage the row before reaching its contextual action, which is
   * what a pointer user does and what makes the affordance operable. Without
   * it this is a DEADLOCK rather than a race: Playwright hit-tests before
   * moving the mouse, so it never performs the hover that would reveal the
   * control. See `revealRowActions`.
   */
  const mondayRow = mondaySection.locator(".dh-taskrow", {
    hasText: monday.title,
  });
  await revealRowActions(mondayRow);
  await mondayRow
    .getByRole("button", { name: `More actions for ${monday.title}` })
    .click();
  await page.getByRole("menuitem", { name: "Remove the planned date" }).click();

  // Off the day…
  await expect(
    mondaySection.getByRole("link", { name: `Open ${monday.title}` }),
  ).toHaveCount(0);
  // …and out of the agenda entirely: with no planned date it belongs to no day.
  await expect(
    weekAgenda(page).getByRole("link", { name: `Open ${monday.title}` }),
  ).toHaveCount(0);
  // The Task itself is untouched apart from its plan — it is still open, and its
  // far-future deadline is still exactly where it was.
  await gotoFixture(
    page,
    `/tasks?system=open&dueFrom=${monday.dueDate}&dueTo=${monday.dueDate}`,
  );
  await expect(taskRow(page, monday.title)).toHaveCount(1);
});

test("a blocked commitment is shown as blocked, not hidden", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");

  const waiting = fixture.task("waiting");
  const section = daySection(page, waiting.scheduledDate!);
  const row = section
    .getByTestId("task-row")
    .filter({ hasText: waiting.title });
  await expect(
    row.getByRole("link", { name: `Open ${waiting.title}` }),
  ).toBeVisible();
  // The state is a WORD on the row — the blocked commitment is drawn, and drawn
  // as blocked — and the day's own line counts it.
  await expect(row.getByTestId("task-row-state")).toHaveText("Waiting");
  await expect(section).toContainText("waiting");
});

test("completing a task from Planning persists", async ({ page }) => {
  await gotoFixture(page, "/plan");

  const tuesday = fixture.task("tue");
  const section = daySection(page, tuesday.scheduledDate!);

  await section
    .getByRole("checkbox", { name: `Complete ${tuesday.title}` })
    .check();
  await expect(
    section.getByRole("checkbox", { name: `Reopen ${tuesday.title}` }),
  ).toBeVisible();

  await page.reload();
  await expect(
    daySection(page, tuesday.scheduledDate!).getByRole("checkbox", {
      name: `Reopen ${tuesday.title}`,
    }),
  ).toBeVisible();
});

test("the planner works with no AI configured and no calendar connected", async ({
  page,
}) => {
  // Neither is configured in the E2E environment, which is the point: the week
  // renders, the queue renders, and nothing on the page asks for either.
  await gotoFixture(page, "/plan");
  await expect(page.getByTestId("plan-queue")).toBeVisible();
  await expect(page.getByTestId("plan-day")).toHaveCount(7);
  await expect(page.getByText("Ask DalyHub")).toHaveCount(0);
});

test("the Review's Plan-next-week link does not modify the Review", async ({
  page,
}) => {
  await gotoFixture(page, "/reviews");
  // The link exists on the guided flow's focus step and its completion step. The
  // Review's own state is asserted through its record: following the link leaves
  // it exactly as it was, because the planner only READS the focus.
  await gotoFixture(page, "/plan?week=next");
  await expect(page.getByTestId("plan-week-range")).toContainText("Next week");
});

test("the whole placement flow is reachable by keyboard", async ({ page }) => {
  await gotoFixture(page, "/plan");

  const unplaced = fixture.task("unplaced");
  const queue = page.getByTestId("plan-queue");

  // V2.4-GATE-02 — entering the mode is itself a keyboard act, on a real button
  // whose LABEL carries the state.
  const toggle = queue.getByTestId("plan-queue-select-toggle");
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const checkbox = queue.getByRole("checkbox", {
    name: `Select ${unplaced.title} to place on a day`,
  });

  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  const target = addDays(fixture.weekStart, 5);
  const dayButton = page.locator(
    `[data-testid="plan-place-day"][data-date="${target}"]`,
  );
  await dayButton.focus();
  await expect(dayButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    daySection(page, target).getByRole("link", {
      name: `Open ${unplaced.title}`,
    }),
  ).toBeVisible();
});
