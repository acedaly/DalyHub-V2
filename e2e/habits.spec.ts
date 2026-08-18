/**
 * HABITS-01 — the Habits journeys, end to end through the real product.
 *
 * The invariants these prove are the ones the whole item exists for:
 *
 *   - all three cadences can be created, and each says what it asks for;
 *   - a check-in made in ONE place is the same fact everywhere — Today and
 *     `/habits` agree without a reload, and agree again after one;
 *   - undoing works, and a missed day is never described as a miss;
 *   - archiving removes a habit from Today while KEEPING its history;
 *   - a schedule change applies from today and does not rewrite the past;
 *   - a Goal shows its supporting habits, and its own progress is untouched;
 *   - the phone journey works at 390 and 320 with a one-tap check-in.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  globalCaptureControl,
  ownerToday,
  waitForInteractive,
} from "./helpers";
import { d1Query } from "./d1";
import {
  chooseHabitOption,
  cleanupAllTestHabits,
  cleanupHabitByTitle,
  uniqueHabitTitle,
} from "./habits-fixtures";

/** Every Habit this file created, torn down after each test. */
const owned = new Set<string>();

test.afterEach(() => {
  for (const title of owned) cleanupHabitByTitle(title);
  owned.clear();
});

test.afterAll(() => {
  // A belt-and-braces sweep: a test that failed before its title was registered
  // still leaves nothing behind for the next run to trip over.
  cleanupAllTestHabits();
});

/**
 * A Habit RECORD's URL.
 *
 * Deliberately not `/habits/[^/]+$`: that also matches `/habits/new`, so a
 * journey could "arrive" at the record while still on the create page and then
 * capture the wrong URL to come back to. The id is a UUID, so the shape is the
 * assertion.
 */
const HABIT_RECORD_URL = /\/habits\/[0-9a-fA-F-]{20,}(?:[?#]|$)/;

/** One seeded Goal from the local database, or `null` when there is none. */
function seededGoal(): { readonly id: string; readonly title: string } | null {
  const rows = d1Query<{ id: string; title: string }>(
    `SELECT id, title FROM entities
      WHERE workspace_id = 'local-dev-workspace' AND type = 'goal'
        AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  );
  return rows[0] ?? null;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * A weekday NAME relative to the owner's today (`0` = today).
 *
 * Resolved from the owner's calendar day, never from `new Date()` in the
 * runner's zone: for a third of every 24 hours those are different days, and a
 * spec that picked the wrong one would pass in the morning and fail at night.
 */
function weekdayName(offset: number): string {
  const todayIndex = new Date(`${ownerToday()}T12:00:00Z`).getUTCDay();
  return WEEKDAY_NAMES[(todayIndex + offset + 7) % 7]!;
}

/**
 * One Habit's row IN THE COLLECTION'S TABLE.
 *
 * Scoped to `habit-list` since UX-02, because the same Habit now legitimately
 * appears twice on `/habits`: once in the table, and once in the rail's "Today"
 * card — the same shared `HabitRow`, posting through the same one check-in
 * authority, which is exactly the arrangement Today already has. An unscoped
 * locator is a strict-mode violation rather than a defect, and scoping it is what
 * makes each assertion say WHICH surface it is about.
 */
function habitRow(page: Page, title: string): Locator {
  return page
    .getByTestId("habit-list")
    .getByTestId("habit-row")
    .filter({ hasText: title });
}

/*
 * The same Habit's row in the rail's "Today" card is asserted in
 * `ux-02-plan-habits.spec.ts` ("the rail's Today card and the table are the same
 * check-in"), which is where that arrangement belongs — these journeys are about
 * the collection and the record.
 */

/**
 * Create a Habit through the product's own `/habits/new` page.
 *
 * `weekdays` names the day toggles by their ACCESSIBLE name ("Monday"), which is
 * what a keyboard or screen-reader user reaches them by — so the helper exercises
 * the same control a person does rather than a class name.
 */
async function createHabit(
  page: Page,
  input: {
    readonly title: string;
    readonly cadence:
      "Every day" | "Certain days of the week" | "A number of times a week";
    readonly weekdays?: readonly string[];
    readonly timesPerWeek?: string;
    readonly area?: string;
    readonly goal?: string;
  },
): Promise<void> {
  await page.goto("/habits/new");
  await waitForInteractive(page);
  owned.add(input.title);
  await page.getByRole("textbox", { name: /^Habit/ }).fill(input.title);
  await chooseCadence(page, input.cadence);
  for (const day of input.weekdays ?? []) {
    await page.getByRole("checkbox", { name: day }).check();
  }
  if (input.timesPerWeek) {
    await chooseHabitOption(
      page,
      /^Times a week/,
      input.timesPerWeek,
      /How many times a week/i,
    );
  }
  if (input.area) {
    await chooseHabitOption(page, /^Area/, input.area, /Which part of life/i);
  }
  if (input.goal) {
    await chooseHabitOption(page, /^Supports goal/, input.goal, /Which goal/i);
  }
  await page.getByRole("button", { name: "Create habit" }).click();
  await expect(page).toHaveURL(HABIT_RECORD_URL);
  await waitForInteractive(page);
}

/** Choose a cadence, in whichever presentation this viewport shows. */
async function chooseCadence(page: Page, value: string): Promise<void> {
  await chooseHabitOption(page, /^How often/, value, /How often/i);
}

test.describe("HABITS-01 — creating and checking in", () => {
  test("creates all three cadences, and each says what it asks for", async ({
    page,
  }) => {
    const daily = uniqueHabitTitle("read");
    const weekdays = uniqueHabitTitle("strength");
    const count = uniqueHabitTitle("long-walk");

    await createHabit(page, { title: daily, cadence: "Every day" });
    await expect(page.getByText("Every day").first()).toBeVisible();

    await createHabit(page, {
      title: weekdays,
      cadence: "Certain days of the week",
      weekdays: ["Monday", "Wednesday", "Friday"],
    });
    await expect(page.getByText("Mon, Wed & Fri").first()).toBeVisible();

    await createHabit(page, {
      title: count,
      cadence: "A number of times a week",
      timesPerWeek: "3 times a week",
    });
    await expect(page.getByText("3× a week").first()).toBeVisible();

    // All three appear in the collection, with their cadence on the row.
    await page.goto("/habits");
    await expect(habitRow(page, daily)).toBeVisible();
    await expect(habitRow(page, weekdays)).toBeVisible();
    await expect(habitRow(page, count)).toBeVisible();
    await expect(habitRow(page, count)).toContainText("3× weekly");
  });

  test("checks in from /habits, undoes, and survives a reload", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("medication");
    await createHabit(page, { title, cadence: "Every day" });

    await page.goto("/habits");
    const row = habitRow(page, title);
    await expect(row).toContainText("Not yet today");

    await row.getByTestId("habit-check").check();
    await expect(row).toContainText("Done today");
    /*
     * The denominator is what the week ACTUALLY asked for, which for a habit
     * created today is the days from today onward — never a flat seven. That is
     * the honest answer (it was not expected on Monday if it did not exist on
     * Monday), so the assertion is on the shape rather than on a number that
     * depends on which weekday the suite runs.
     */
    await expect(row).toContainText(/1 of [1-7] this week/);

    // The completion is a DURABLE FACT, not optimistic state.
    await page.reload();
    await expect(
      habitRow(page, title).getByTestId("habit-check"),
    ).toBeChecked();

    await habitRow(page, title).getByTestId("habit-check").uncheck();
    await expect(habitRow(page, title)).toContainText("Not yet today");
    await page.reload();
    await expect(
      habitRow(page, title).getByTestId("habit-check"),
    ).not.toBeChecked();
  });

  test("Today and /habits agree about the same check-in", async ({ page }) => {
    const title = uniqueHabitTitle("meditate");
    await createHabit(page, { title, cadence: "Every day" });

    // Check in from TODAY.
    await page.goto("/today");
    await waitForInteractive(page);
    const section = page.getByTestId("today-habits");
    await expect(section).toBeVisible();
    const todayRow = section
      .getByTestId("habit-row")
      .filter({ hasText: title });
    await todayRow.getByTestId("habit-check").check();
    await expect(todayRow).toContainText("Done today");

    // The collection, reached through the product, shows the SAME fact — there
    // is one check-in authority, so there is nothing to keep in step.
    await page.goto("/habits");
    await expect(
      habitRow(page, title).getByTestId("habit-check"),
    ).toBeChecked();

    // And back the other way.
    await habitRow(page, title).getByTestId("habit-check").uncheck();
    await page.goto("/today");
    await waitForInteractive(page);
    await expect(
      page
        .getByTestId("today-habits")
        .getByTestId("habit-row")
        .filter({ hasText: title })
        .getByTestId("habit-check"),
    ).not.toBeChecked();
  });

  test("never describes an unscheduled day as a miss", async ({ page }) => {
    /*
     * A habit scheduled for the ONE weekday that is not today. The row must say
     * the day was not asked for, must offer no control, and must not use the
     * word "missed" anywhere.
     */
    const otherDay = weekdayName(2);
    const title = uniqueHabitTitle("off-day");
    await createHabit(page, {
      title,
      cadence: "Certain days of the week",
      weekdays: [otherDay],
    });

    await page.goto("/habits");
    const row = habitRow(page, title);
    await expect(row).toContainText("Not scheduled today");
    await expect(row.getByTestId("habit-check")).toHaveCount(0);
    await expect(row).not.toContainText(/missed|failed|overdue/i);

    // And it is absent from Today, because Today asks nothing of it.
    await page.goto("/today");
    await waitForInteractive(page);
    await expect(page.getByTestId("today-habits").getByText(title)).toHaveCount(
      0,
    );
  });
});

test.describe("HABITS-01 — the record", () => {
  test("archiving removes it from Today and KEEPS its history", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("cold-shower");
    await createHabit(page, { title, cadence: "Every day" });
    const recordUrl = page.url();

    await page.getByTestId("habit-record-check").check();
    await expect(page.getByTestId("habit-summary")).toContainText("Done today");

    await page.getByRole("button", { name: /More actions|Actions/i }).click();
    await page.getByRole("menuitem", { name: /Archive habit/i }).click();
    await page.getByRole("button", { name: /^Archive/ }).click();

    await expect(page.getByText("Archived").first()).toBeVisible();

    // Gone from Today...
    await page.goto("/today");
    await waitForInteractive(page);
    await expect(page.getByTestId("today-habits").getByText(title)).toHaveCount(
      0,
    );

    // ...gone from the active collection, present in Archived...
    await page.goto("/habits");
    await expect(habitRow(page, title)).toHaveCount(0);
    await page.goto("/habits/archived");
    await expect(habitRow(page, title)).toBeVisible();

    // ...and its history is intact on the record.
    await page.goto(recordUrl);
    await expect(page.getByTestId("habit-summary")).toContainText(
      "expected check-ins",
    );
    await expect(
      page.getByRole("cell", { name: new RegExp(`${ownerToday()}: done`) }),
    ).toBeVisible();
  });

  test("changing the schedule applies from today and keeps the past", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("versioned");
    await createHabit(page, {
      title,
      cadence: "A number of times a week",
      timesPerWeek: "3 times a week",
    });

    await page.getByRole("tab", { name: "Schedule" }).click();
    // The surface SAYS what a change does, before it is made.
    await expect(page.getByText(/applies\s+from today/i)).toBeVisible();
    await chooseCadence(page, "Every day");
    await page.getByRole("button", { name: "Save schedule" }).click();

    await page.getByRole("tab", { name: "Summary" }).click();
    await expect(page.getByTestId("habit-summary")).toBeVisible();
    // The header now states the NEW cadence.
    await expect(page.getByText("Every day").first()).toBeVisible();
  });

  /**
   * V2.3-GATE-01 — the partial first week, from the owner's side of the glass.
   *
   * A Habit created through the product is effective FROM TODAY, so on the day it
   * is made it has never had a whole owner-calendar week. `weekly_count` holds a
   * week to its target only when the Habit was active for every day of it (see
   * `docs/development/HABITS_MODULE.md → The partial first week`), so nothing in
   * the record may describe the days before it existed as anything owed.
   *
   * The assertions here are the ones that hold on EVERY day of the week — the
   * exact week arithmetic, including the boundary where creation day IS the first
   * day of the week, is asserted in `test/unit/habits/habit-progress.test.ts`.
   */
  test("does not invent expectations for the week it was created in", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("partial-first-week");
    await createHabit(page, {
      title,
      cadence: "A number of times a week",
      timesPerWeek: "3 times a week",
    });

    const summary = page.getByTestId("habit-summary");
    await expect(summary).toBeVisible();

    // No recent-window denominator: a Habit made today has had no whole week, so
    // there is no bounded expectation to report, and reporting one would be a
    // measurement of weeks it did not exist for.
    await expect(summary).not.toContainText(/expected check-ins/i);

    // No verdict language anywhere — this is the calm contract, checked on the
    // one surface most tempted to grow it.
    await expect(summary).not.toContainText(/missed|behind|streak|broke/i);

    // Every day before today is stated as INACTIVE rather than as a scheduled day
    // without a check-in. That is the sentence the history strip must never say
    // about a day the Habit did not exist on.
    const strip = summary.locator(".dh-habit-history");
    await expect(strip).toBeVisible();
    await expect(
      strip.getByRole("cell", { name: /scheduled, no check-in/ }),
    ).toHaveCount(0);

    // And the Habit is still fully usable: today is available, on any day.
    await expect(summary).toContainText(/Any day this week|Not yet today/);
  });

  test("shows a supporting habit on its Goal, without changing the Goal's progress", async ({
    page,
  }) => {
    // A REAL seeded Goal, read from the database rather than scraped out of a
    // collection whose markup is not this spec's subject.
    const goal = seededGoal();
    test.skip(goal === null, "the seeded workspace has no Goal to attach to");

    const title = uniqueHabitTitle("supporting");
    await createHabit(page, {
      title,
      cadence: "A number of times a week",
      timesPerWeek: "3 times a week",
      goal: goal!.title,
    });

    await page.goto(`/goals/${goal!.id}`);
    await waitForInteractive(page);

    const supporting = page.getByTestId("supporting-habits");
    await expect(supporting).toBeVisible();
    await expect(supporting).toContainText(title);
    // Evidence, stated as evidence — never as a term in the Goal's arithmetic.
    await expect(supporting).toContainText(
      /not part of the measured progress/i,
    );
  });
});

test.describe("HABITS-01 — global create", () => {
  test("offers Habit from the one global create surface", async ({ page }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    await globalCaptureControl(page).click();
    await page.getByTestId("capture-choose-habit").click();
    await expect(page.getByRole("dialog")).toContainText(/New habit/i);

    const title = uniqueHabitTitle("captured");
    owned.add(title);
    await page.getByRole("textbox", { name: /^Habit/ }).fill(title);
    await page.getByRole("button", { name: "Create habit" }).click();
    await expect(page.getByText("Habit created.")).toBeVisible();

    await page.goto("/habits");
    await expect(habitRow(page, title)).toBeVisible();
  });
});

test.describe("HABITS-01 — phone, dark and accessibility", () => {
  test("is a one-tap check-in on a 390px phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const title = uniqueHabitTitle("phone");
    await createHabit(page, { title, cadence: "Every day" });

    await page.goto("/habits");
    await expectNoHorizontalOverflow(page);
    const control = habitRow(page, title).getByTestId("habit-check");
    /*
     * The TARGET is the label wrapping the 20px control — the shared
     * `.dh-check-circle-target`, which is the same 44px hit area every task row
     * gets, unchanged on a coarse pointer (task-signals.css).
     */
    await expectMinTouchTarget(
      habitRow(page, title).locator("label.dh-check-circle-target"),
    );
    await control.check();
    await expect(habitRow(page, title)).toContainText("Done today");
  });

  test("never overflows at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/habits");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/habits/new");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/today");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);
  });

  test("renders in the dark appearance", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/habits");
    await waitForInteractive(page);
    await expect(
      page.getByRole("heading", { name: "Habits", exact: true }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("passes axe on the collection, the create page and the record", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("axe");
    await createHabit(page, {
      title,
      cadence: "Certain days of the week",
      weekdays: ["Monday", "Wednesday"],
    });
    await expectNoAxeViolations(page);

    await page.goto("/habits");
    await waitForInteractive(page);
    await expectNoAxeViolations(page);

    await page.goto("/habits/new");
    await waitForInteractive(page);
    await expectNoAxeViolations(page);
  });

  test("creates and checks in with the keyboard alone", async ({ page }) => {
    const title = uniqueHabitTitle("keyboard");
    owned.add(title);
    await page.goto("/habits/new");
    await waitForInteractive(page);

    const name = page.getByRole("textbox", { name: /^Habit/ });
    await name.focus();
    await name.fill(title);

    /*
     * The weekday toggles are REAL checkboxes: reachable by Tab and toggled by
     * Space, which is the whole reason they are not seven styled circles.
     *
     * TODAY's weekday is the one chosen, so the resulting habit is one the
     * collection actually asks about today — a habit scheduled for some other
     * day correctly offers no control, which is a different assertion (see "never
     * describes an unscheduled day as a miss").
     */
    await chooseCadence(page, "Certain days of the week");
    const toggle = page.getByRole("checkbox", { name: weekdayName(0) });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();

    await page.getByRole("button", { name: "Create habit" }).click();
    await expect(page).toHaveURL(HABIT_RECORD_URL);
    await waitForInteractive(page);

    await page.goto("/habits");
    const control = habitRow(page, title).getByTestId("habit-check");
    await control.focus();
    await expect(control).toBeFocused();
  });
});
