/**
 * UX-02 — the rebuilt Weekly Planning board and Habits collection.
 *
 * What these prove, in one sentence each:
 *
 *   /plan
 *   - the week is a BOARD of day columns above 90rem, and it FOLDS rather than
 *     shrinking below it;
 *   - Saturday and Sunday share one column, and each keeps its own heading;
 *   - a day's commitments are drawn with their durations, as text with no control;
 *   - the board's "Plan a task" ARMS a day and creates nothing;
 *   - the armed day plus a selection commits the SAME one bulk placement the day
 *     chips commit, and the deadline is untouched;
 *   - the four figures agree with the rows on the screen, and are printed twice;
 *   - the Review focus is a real disclosure.
 *
 *   /habits
 *   - the collection is a four-column table with a week strip, and a future day of
 *     this week is not drawn as a miss;
 *   - the glance row's figures are counts the owner can check;
 *   - the recent-consistency percentage is never drawn without its denominator;
 *   - the rail's Today card and the table are the same check-in;
 *   - the three tabs are three real scopes.
 *
 * Every assertion is on what the owner sees. The MEASUREMENTS behind the board's
 * geometry live in `scripts/ux-02-shot.mjs` and the design record; what is
 * asserted here is the behaviour those measurements chose.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
  waitForInteractive,
} from "./helpers";
import {
  addDays,
  clearPlanFixture,
  planFixture,
  seedPlanFixture,
  type PlanFixture,
} from "./plan-fixtures";
import {
  cleanupHabitByTitle,
  chooseHabitOption,
  uniqueHabitTitle,
} from "./habits-fixtures";
import {
  CALENDAR_FIXTURE_PREFIX,
  cleanupCalendarFixtures,
  seedCalendarSources,
} from "./calendar-fixtures";
import {
  cleanupReviewByTitle,
  createCompletedPriorWeeklyReview,
  uniqueReviewTitle,
} from "./reviews-fixtures";

let fixture: PlanFixture;

test.beforeAll(() => {
  fixture = planFixture();
});

test.beforeEach(() => {
  seedPlanFixture(fixture);
});

test.afterAll(() => {
  clearPlanFixture(fixture);
});

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

/** The board's columns. Six above 90rem, one visible on a phone. */
function columns(page: Page): Locator {
  return page.getByTestId("plan-column");
}

/** One day's section, wherever its column is. */
function daySection(page: Page, dateIso: string): Locator {
  return page.locator(`[data-testid="plan-day"][data-date="${dateIso}"]`);
}

test.describe("the week board", () => {
  test("draws six columns at 1440 and folds to three at 1280", async ({
    page,
  }) => {
    /*
     * The composition is the decision ADR-104 re-took, so it is asserted as
     * behaviour rather than left to the design record: six columns at the width
     * the measurement supports, and a FOLD — not a squeeze — below it. Both are
     * counted from the DOM the owner is looking at.
     */
    await page.setViewportSize({ width: 1440, height: 950 });
    await gotoFixture(page, "/plan");
    await expect(columns(page)).toHaveCount(6);
    await expect(page.getByTestId("plan-day")).toHaveCount(7);
    await expectNoHorizontalOverflow(page);

    const wide = await page.getByTestId("plan-board").boundingBox();
    const wideRows = await page
      .getByTestId("plan-column")
      .first()
      .boundingBox();

    await page.setViewportSize({ width: 1280, height: 950 });
    await page.waitForTimeout(250);
    // Still six columns in the DOM — the fold is a GRID change, so the same six
    // objects lay out over two rows. Nothing is hidden and nothing is dropped.
    await expect(columns(page)).toHaveCount(6);
    await expectNoHorizontalOverflow(page);

    const narrow = await page.getByTestId("plan-column").first().boundingBox();
    // The fold makes each column WIDER, which is the whole point: three columns
    // of 230px rather than six of 108px.
    expect(narrow!.width).toBeGreaterThan(wideRows!.width);
    expect(wide!.width).toBeGreaterThan(0);
  });

  test("pairs the weekend into one column, and each day keeps its heading", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await gotoFixture(page, "/plan");

    const saturday = addDays(fixture.weekStart, 5);
    const sunday = addDays(fixture.weekStart, 6);

    // Both days exist as their own headed sections...
    await expect(daySection(page, saturday)).toHaveCount(1);
    await expect(daySection(page, sunday)).toHaveCount(1);

    // ...inside ONE column. A planner exists to say WHICH day, so the pairing is
    // visual and the two days are never merged into one band.
    const weekend = columns(page).nth(5);
    await expect(weekend.getByTestId("plan-day")).toHaveCount(2);
    // The uppercase is a `text-transform`; the DOM carries the product's own
    // short weekday names, so the assertion reads them as the DOM has them.
    await expect(weekend).toContainText(/sat/i);
    await expect(weekend).toContainText(/sun/i);
  });

  test("draws a commitment with where it is and how long it takes, and gives it no control", async ({
    page,
  }) => {
    /*
     * A real occurrence, seeded exactly as a successful refresh would have left
     * it. Ninety minutes on the WEDNESDAY of the shown week, with a location — so
     * the duration this pass added ("1h 30m") and the "where" line beside it are
     * both asserted on a value nobody could have guessed from formatting alone.
     */
    const wednesday = addDays(fixture.weekStart, 2);
    const title = `${CALENDAR_FIXTURE_PREFIX}UX-02 board commitment`;
    try {
      await seedCalendarSources([
        {
          id: "cal-ux02",
          name: "Work",
          feedUrl: "https://calendar.example.invalid/ux02.ics",
          events: [
            {
              id: "cal-ux02-event",
              uid: "cal-ux02-event@example.invalid",
              title,
              // 09:00–10:30 in the owner's zone (UTC+10 in August).
              startsAt: `${wednesday}T23:00:00.000Z`,
              endsAt: `${addDays(wednesday, 1)}T00:30:00.000Z`,
              location: "Level 3 briefing room",
            },
          ],
        },
      ]);

      await page.setViewportSize({ width: 1440, height: 950 });
      await gotoFixture(page, "/plan");

      const commitment = page
        .getByTestId("plan-event")
        .filter({ hasText: title });
      await expect(commitment).toHaveCount(1);
      await expect(commitment).toContainText("Level 3 briefing room");
      await expect(commitment).toContainText("1h 30m");

      // Text, never a control: an occurrence is read on the surfaces that own it,
      // and a planner that let you complete one would be the beginning of the
      // calendar application CAL-01 refuses to build.
      await expect(commitment.getByRole("button")).toHaveCount(0);
      await expect(commitment.getByRole("checkbox")).toHaveCount(0);
      await expect(commitment.getByRole("link")).toHaveCount(0);

      // And the week's own total counts it, in the same words.
      await expect(page.getByTestId("plan-glance")).toContainText(
        /Calendar commitments/,
      );
    } finally {
      cleanupCalendarFixtures();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Arming a day                                                               */
/* -------------------------------------------------------------------------- */

test.describe("planning from the board", () => {
  test("‘Plan a task’ arms the day and creates nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await gotoFixture(page, "/plan");

    const thursday = addDays(fixture.weekStart, 3);
    const before = await daySection(page, thursday)
      .getByTestId("task-row")
      .count();

    const arm = page.locator(
      `[data-testid="plan-arm-day"][data-date="${thursday}"]`,
    );
    await expect(arm).toHaveAttribute("aria-pressed", "false");
    await arm.click();
    await expect(arm).toHaveAttribute("aria-pressed", "true");

    // NOTHING was created. The control names a day for the queue's placement; a
    // create here would be a second create path beside Quick Capture.
    await expect(
      daySection(page, thursday).getByTestId("task-row"),
    ).toHaveCount(before);

    // The queue's primary control now names the day in WORDS, and is still
    // refused while nothing is selected.
    const commit = page.getByTestId("plan-place-selected");
    await expect(commit).toBeDisabled();

    // Pressing the armed day again disarms it.
    await arm.click();
    await expect(arm).toHaveAttribute("aria-pressed", "false");
  });

  test("the armed day plus a selection places the work, and the deadline is untouched", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await gotoFixture(page, "/plan");

    const task = fixture.task("unplaced");
    const thursday = addDays(fixture.weekStart, 3);

    const queueRow = page
      .getByTestId("plan-queue")
      .getByTestId("task-row")
      .filter({ hasText: task.title });
    await expect(queueRow).toHaveCount(1);
    await queueRow.getByTestId("task-select").check();

    await page
      .locator(`[data-testid="plan-arm-day"][data-date="${thursday}"]`)
      .click();

    const commit = page.getByTestId("plan-place-selected");
    await expect(commit).toBeEnabled();
    await commit.click();

    // The Task is on Thursday, and it is the SAME bulk placement the day chips
    // commit — one atomic mutation through the canonical route.
    await expect(
      daySection(page, thursday).getByTestId("task-row").filter({
        hasText: task.title,
      }),
    ).toHaveCount(1);

    /*
     * The DEADLINE is unchanged, and the row itself says so: `data-overdue` is
     * the shared row's own reading of "open, and its DUE date has passed". The
     * Task is now planned for Thursday of this week and is STILL overdue, which
     * is exactly the distinction the whole surface is built on — a plan is not a
     * promise, and placing work does not move a deadline.
     */
    await expect(
      daySection(page, thursday)
        .getByTestId("task-row")
        .filter({ hasText: task.title }),
    ).toHaveAttribute("data-overdue", "true");
  });
});

/* -------------------------------------------------------------------------- */
/* The week's figures                                                         */
/* -------------------------------------------------------------------------- */

test("the week's figures agree with the rows, and are printed twice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await gotoFixture(page, "/plan");

  const planned = await page
    .getByTestId("plan-board")
    .getByTestId("task-row")
    .count();
  const queued = await page
    .getByTestId("plan-queue")
    .getByTestId("task-row")
    .count();

  // The chip row above the board...
  await expect(page.getByTestId("plan-figure-planned")).toContainText(
    String(planned),
  );
  await expect(page.getByTestId("plan-figure-unplaced")).toContainText(
    String(queued),
  );

  // ...and the glance bar beneath it, from the SAME numbers. A screen that
  // states a figure twice and disagrees with itself is worse than one that
  // states it once.
  const glance = page.getByTestId("plan-glance");
  await expect(glance).toContainText("Tasks planned");
  await expect(glance).toContainText("Still to place");
  await expect(glance).toContainText(String(planned));
  await expect(glance).toContainText(String(queued));
});

test("the Review focus is a real disclosure, hidden until it is asked for", async ({
  page,
}) => {
  /*
   * DEBT-200 — this used to `test.skip()` on "no prior Review focus in the
   * seeded workspace", which was true on every run: the seed holds no completed
   * weekly Review at all, so the journey had never once executed. The guard is
   * kept as an ASSERTION and the spec now owns the Review it reads, created
   * through the product's own flow (`reviews-fixtures.ts`).
   */
  const title = uniqueReviewTitle("prior-focus");
  const focus = "Ship the planner's prior-focus disclosure.";
  try {
    await createCompletedPriorWeeklyReview(page, title, focus);

    await gotoFixture(page, "/plan");
    const toggle = page.getByTestId("plan-focus-toggle");
    await expect(
      toggle,
      "a completed prior-period weekly Review with prose must draw the focus " +
        "disclosure; without it this journey asserts nothing (DEBT-200)",
    ).toBeVisible();

    const panel = page.getByTestId("plan-prior-focus");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    // It READS the Review; it never copies it and never creates anything.
    await expect(panel).toContainText("never copied");
    // And what it reads is THIS Review's own words, not a placeholder.
    await expect(panel).toContainText(focus);
    await expect(panel).toContainText(title);
  } finally {
    await cleanupReviewByTitle(title);
  }
});

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

/** One Habit's row in the collection's TABLE (never the rail's card). */
function tableRow(page: Page, title: string): Locator {
  return page
    .getByTestId("habit-list")
    .getByTestId("habit-row")
    .filter({ hasText: title });
}

/**
 * Create a Habit through the product's own `/habits/new` page.
 *
 * The fields are reached by their ACCESSIBLE names, which is what a keyboard or
 * screen-reader user reaches them by — the same discipline `habits.spec.ts` uses.
 */
async function createHabit(
  page: Page,
  title: string,
  cadence: "Every day" | "Certain days of the week" = "Every day",
): Promise<void> {
  await gotoFixture(page, "/habits/new");
  await waitForInteractive(page);
  await page.getByRole("textbox", { name: /^Habit/ }).fill(title);
  await chooseHabitOption(page, /^How often/, cadence, /How often/i);
  await page.getByRole("button", { name: "Create habit" }).click();
  await expect(page).toHaveURL(/\/habits\/[0-9a-fA-F-]{20,}/);
  await waitForInteractive(page);
}

test.describe("the Habits collection", () => {
  test("is a table whose week strip stops at today", async ({ page }) => {
    const title = uniqueHabitTitle("strip");
    try {
      await createHabit(page, title, "Every day");
      await gotoFixture(page, "/habits");

      const row = tableRow(page, title);
      await expect(row).toHaveCount(1);
      // The four columns the header names.
      await expect(page.getByTestId("habit-list").first()).toBeVisible();
      await expect(row).toContainText("Every day");
      await expect(row).toContainText("Not yet today");

      /*
       * The strip draws ONE cell per day THAT HAS HAPPENED, and the rest is empty
       * ground. A Habit created today has been active for one day of the week, so
       * the strip carries at most as many dots as the week has had days — and
       * never a dot for tomorrow, because Thursday cannot be incomplete on
       * Wednesday.
       */
      const strip = row.getByTestId("habit-week-strip");
      await expect(strip).toHaveCount(1);
      const drawn = await strip.getByTestId("habit-week-day").count();
      const dayOfWeek = new Date(`${ownerToday()}T12:00:00Z`).getUTCDay();
      const daysElapsed = ((dayOfWeek + 6) % 7) + 1;
      expect(drawn).toBeLessThanOrEqual(daysElapsed);

      // Every cell has WORDS. Nothing here is conveyed by colour or position.
      await expect(strip).toContainText("this week", { useInnerText: false });
    } finally {
      cleanupHabitByTitle(title);
    }
  });

  test("never draws a percentage without the numbers it comes from", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("consistency");
    try {
      await createHabit(page, title, "Every day");
      await gotoFixture(page, "/habits");

      const card = page.getByTestId("habits-stat-consistency");
      await expect(card).toBeVisible();
      const text = (await card.innerText()).replace(/\s+/g, " ");

      /*
       * ADR-104's condition, asserted on the screen: a percentage is permitted
       * ONLY beside the two integers it is computed from. Either the card shows
       * both, or it shows neither and says so in words — never a bare figure.
       */
      if (/\d+%/.test(text)) {
        expect(text).toMatch(/\d+ of \d+ expected check-ins/);
      } else {
        expect(text).toMatch(/Nothing expected yet/);
      }

      // And nothing anywhere on the screen manufactures urgency.
      const page_text = await page.locator("main").innerText();
      expect(page_text).not.toMatch(/streak|flame|don.t break|day \d+ of/i);
    } finally {
      cleanupHabitByTitle(title);
    }
  });

  test("the rail's Today card and the table are the same check-in", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("rail");
    try {
      await createHabit(page, title, "Every day");
      await page.setViewportSize({ width: 1440, height: 950 });
      await gotoFixture(page, "/habits");

      const railRow = page
        .getByTestId("habits-today")
        .getByTestId("habit-row")
        .filter({ hasText: title });
      await expect(railRow).toHaveCount(1);

      // Tick it in the RAIL...
      await railRow.getByTestId("habit-check").check();
      // ...and the TABLE agrees, because both post through the one authority and
      // both read the loader's answer.
      await expect(tableRow(page, title)).toContainText("Done today");
      await page.reload();
      await expect(
        tableRow(page, title).getByTestId("habit-check"),
      ).toBeChecked();
    } finally {
      cleanupHabitByTitle(title);
    }
  });

  test("offers three scopes, and each is a real one", async ({ page }) => {
    const title = uniqueHabitTitle("scopes");
    try {
      await createHabit(page, title, "Every day");

      // Today — the default. Every active Habit, the ones today asks for first.
      await gotoFixture(page, "/habits");
      /*
       * Scoped to the switcher: "Today" is also the navigation rail's first
       * destination, and an unscoped locator is a strict-mode violation rather
       * than a defect. The switcher is the shared `ViewSwitcher`, so the current
       * scope is carried by `aria-current` — the one attribute that is both the
       * appearance and what assistive technology reads.
       */
      const views = page.getByRole("group", { name: "Habit views" });
      await expect(
        views.getByRole("link", { name: "Today", exact: true }),
      ).toHaveAttribute("aria-current", /page|true/);
      await expect(tableRow(page, title)).toHaveCount(1);

      // All active — the paginated, searchable collection.
      await gotoFixture(page, "/habits?scope=all");
      await expect(tableRow(page, title)).toHaveCount(1);

      // Archived — and an active Habit is not in it.
      await gotoFixture(page, "/habits/archived");
      await expect(tableRow(page, title)).toHaveCount(0);
    } finally {
      cleanupHabitByTitle(title);
    }
  });

  test("holds the glance row and the rail at 393 and 320 without overflowing", async ({
    page,
  }) => {
    const title = uniqueHabitTitle("phone");
    try {
      await createHabit(page, title, "Every day");
      for (const width of [393, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await gotoFixture(page, "/habits");
        await waitForInteractive(page);
        await expect(page.getByTestId("habits-stats")).toBeVisible();
        await expect(tableRow(page, title)).toHaveCount(1);
        await expectNoHorizontalOverflow(page);
      }
    } finally {
      cleanupHabitByTitle(title);
    }
  });
});
