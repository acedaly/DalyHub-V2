/**
 * TASKS-12 — advanced recurrence and Task dependencies, driven end to end
 * against the development-auth server over real (seeded) D1.
 *
 * The journeys are the product's claims, in order:
 *
 *   - an nth-weekday rule, a multi-weekday rule and an "ends after N" rule are
 *     AUTHORED in the shared editor, stated in plain language before they are
 *     saved, and produce the right successors when completed;
 *   - the final occurrence of a bounded series creates nothing;
 *   - a dependency is added and removed from the Task record, and the blocked
 *     state it produces appears on the shared row wherever that row is drawn:
 *     the Tasks collection, Today and Weekly Planning;
 *   - completing the blocker unblocks; reopening it blocks again — DERIVED, with
 *     no reload of anything but the surface;
 *   - a cycle is REFUSED by the server, in the owner's words;
 *   - the phone experience is intentional at 393 and does not overflow at 320;
 *   - dependencies are manageable entirely by keyboard, and axe-clean in both
 *     appearances.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  comboboxOption,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
  taskRow,
} from "./helpers";
import {
  cleanupAllDependencyTasks,
  occurrenceAt,
  seedDependency,
  seedDependencyTask,
  storedBlockers,
} from "./dependency-fixtures";

/* -------------------------------------------------------------------------- */
/* Calendar anchors — RELATIVE to the owner's day, never absolute              */
/* -------------------------------------------------------------------------- */

/*
 * Every recurrence fixture below has to be seeded on a date that is AHEAD of the
 * owner's day, and the reason is the rule under test: a fixed schedule never
 * produces a successor on or before the day the work was actually finished. Seed
 * it in the past and the series legitimately skips forward, so the assertion
 * silently stops being about the rule it names.
 *
 * These were written as absolute dates with a comment saying they were ahead of
 * the owner's day — which was true when they were written and became false on
 * 2026-08-24. The Mon/Wed/Fri journey then failed PERMANENTLY (not on some days:
 * from that date onwards), expecting Wednesday 2026-08-26 and correctly getting
 * Friday 2026-08-28, because the owner's day had reached the Wednesday. Found by
 * V2.4-GATE-02 running the complete local gate; the branch touches neither this
 * spec, its fixture nor any recurrence code.
 *
 * `helpers.ts`'s own note on `ownerToday` names this exact shape — *"invisible in
 * the morning and certain in the evening, which is the worst shape a test can
 * have"* — and the fix is the one `plan-fixtures.ts` already uses for the same
 * reason: derive the dates, do not write them down.
 */

/** The weekday index (0 = Sunday) of a date-only ISO value, in UTC components. */
function weekdayOf(iso: string): number {
  return new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay();
}

/** Add whole days to a wall-calendar date, in UTC component arithmetic only. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The next `weekday` (0 = Sunday) STRICTLY AFTER the owner's calendar day. */
function nextWeekday(weekday: number): string {
  const today = ownerToday();
  for (let step = 1; step <= 7; step += 1) {
    const candidate = addDays(today, step);
    if (weekdayOf(candidate) === weekday) return candidate;
  }
  /* c8 ignore next */
  throw new Error("a weekday always occurs within seven days");
}

/** The last `weekday` of the month `iso` falls in. */
function lastWeekdayOfMonth(iso: string, weekday: number): string {
  const [year, month] = iso.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
  for (let step = 0; step < 7; step += 1) {
    const candidate = addDays(last, -step);
    if (weekdayOf(candidate) === weekday) return candidate;
  }
  /* c8 ignore next */
  throw new Error("a weekday always occurs within the last seven days");
}

/** The first month whose last `weekday` is strictly after the owner's day. */
function nextLastWeekdayOfMonth(weekday: number): string {
  const today = ownerToday();
  let probe = today;
  for (let month = 0; month < 3; month += 1) {
    const candidate = lastWeekdayOfMonth(probe, weekday);
    if (candidate > today) return candidate;
    // Step into the next month by walking past this month's end.
    probe = addDays(
      lastWeekdayOfMonth(probe, weekdayOf(probe)) > probe ? probe : probe,
      0,
    );
    const [year, monthNumber] = probe.split("-").map(Number);
    probe = new Date(Date.UTC(year!, monthNumber!, 1))
      .toISOString()
      .slice(0, 10);
  }
  /* c8 ignore next */
  throw new Error("a month always has a last weekday");
}

const FRIDAY = 5;
const MONDAY = 1;
const WEDNESDAY = 3;

/** The Tasks list with no grouping, newest first — where a seeded row is first. */
const TASKS_URL = "/tasks?view=list&group=none&sort=created&dir=desc";

function recordUrl(taskId: string): string {
  return `${TASKS_URL}&drawer=task%3A${taskId}`;
}

function record(page: Page): Locator {
  return page.getByRole("dialog");
}

function dependencies(page: Page): Locator {
  return record(page).getByTestId("task-dependencies");
}

/** Add one blocker through the record's picker. */
async function addBlocker(page: Page, title: string): Promise<void> {
  await dependencies(page).getByRole("button", { name: "Add blocker" }).click();
  const picker = dependencies(page).getByRole("combobox", {
    name: /Which task must happen first/,
  });
  await picker.click();
  await picker.fill(title);
  // DHDS-09 — the candidate listbox is portalled into the overlay layer, so it
  // is addressed through the combobox that owns it rather than through the
  // section that holds the field.
  await (await comboboxOption(picker, title)).first().click();
  await dependencies(page)
    .getByRole("button", { name: "Add blocker", exact: true })
    .last()
    .click();
}

/* ========================================================================== */
/* Advanced recurrence                                                        */
/* ========================================================================== */

test.describe("TASKS-12 — authoring an advanced repeat", () => {
  const TASK_ID = "e2e-dep-author";

  test.beforeEach(() => {
    seedDependencyTask({
      id: TASK_ID,
      title: "Board pack review",
      // The last Friday of the first month whose last Friday is still ahead.
      scheduledDate: nextLastWeekdayOfMonth(FRIDAY),
    });
  });

  test.afterEach(() => {
    cleanupAllDependencyTasks();
  });

  test("builds 'the last Friday of every month' and states it in words", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const drawer = record(page);

    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await (await comboboxOption(repeat, /^Custom/)).click();

    const unit = drawer.getByRole("combobox", { name: "Unit" });
    await unit.click();
    await unit.fill("month");
    await (await comboboxOption(unit, "month", { exact: true })).click();

    await drawer.getByRole("radio", { name: "A named weekday" }).click();
    const which = drawer.getByRole("combobox", { name: "Which one" });
    await which.click();
    await which.fill("Last");
    await (await comboboxOption(which, "Last")).click();
    const weekday = drawer.getByRole("combobox", { name: "Weekday" });
    await weekday.click();
    await weekday.fill("Friday");
    await (await comboboxOption(weekday, "Friday")).click();

    // The RESULT, read before it is committed to — no decoding required.
    await expect(drawer.getByTestId("task-recurrence-summary")).toHaveText(
      "The last Friday of every month",
    );
    await drawer.getByRole("button", { name: "Save repeat" }).click();
    await expect(page.getByRole("group", { name: /repeats/i })).toBeVisible();
  });

  test("offers weekend handling as OUTCOMES, never a 'skip weekends' flag", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const drawer = record(page);
    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await (await comboboxOption(repeat, /^Custom/)).click();

    const weekend = drawer.getByRole("combobox", {
      name: "If it falls on a weekend",
    });
    await weekend.click();
    // Every option is a sentence about what will happen.
    for (const wording of [
      "Leave it on the weekend",
      "Move it to the Friday before",
      "Move it to the Monday after",
      "Skip that occurrence",
    ]) {
      await expect(await comboboxOption(weekend, wording)).toBeVisible();
    }
    await (
      await comboboxOption(weekend, "Move it to the Friday before")
    ).click();
    await expect(drawer.getByTestId("task-recurrence-summary")).toContainText(
      "moved to the Friday before",
    );
  });

  test("builds an end condition and says the count includes this occurrence", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const drawer = record(page);
    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await (await comboboxOption(repeat, /^Custom/)).click();

    const ends = drawer.getByRole("combobox", { name: "Ends" });
    await ends.click();
    await (await comboboxOption(ends, "After a number of times")).click();
    const count = drawer.getByLabel("Number of times");
    await count.fill("3");
    // The counting rule is stated where the number is entered, not in a doc.
    await expect(drawer.getByText("Counts this occurrence.")).toBeVisible();
    await expect(drawer.getByTestId("task-recurrence-summary")).toContainText(
      "3 times",
    );
  });
});

test.describe("TASKS-12 — completing an advanced repeat", () => {
  const MONTHLY = "e2e-dep-lastfri";
  const MONTHLY_SERIES = "e2e-dep-lastfri-series";
  const WEEKLY = "e2e-dep-mwf";
  const WEEKLY_SERIES = "e2e-dep-mwf-series";
  const BOUNDED = "e2e-dep-bounded";
  const BOUNDED_SERIES = "e2e-dep-bounded-series";

  test.afterEach(() => {
    cleanupAllDependencyTasks();
  });

  test("a 'last Friday' occurrence produces the next month's last Friday", async ({
    page,
  }) => {
    // The last Friday of the first month whose last Friday is still ahead of the
    // owner's day — derived for the same reason the Mon/Wed/Fri anchor below is.
    const monthlyAnchor = nextLastWeekdayOfMonth(FRIDAY);
    seedDependencyTask({
      id: MONTHLY,
      title: "Last Friday review",
      scheduledDate: monthlyAnchor,
      repeat: {
        frequency: "month",
        seriesId: MONTHLY_SERIES,
        weekdays: [5],
        ordinal: "last",
        anchorDay: Number(monthlyAnchor.slice(8, 10)),
      },
    });
    await gotoFixture(page, recordUrl(MONTHLY));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();

    // The last Friday of the FOLLOWING month, derived rather than written down.
    const successor = occurrenceAt(MONTHLY_SERIES, 1);
    expect(successor?.scheduledDate).toBe(
      lastWeekdayOfMonth(addDays(monthlyAnchor, 7), FRIDAY),
    );
  });

  test("a Mon/Wed/Fri occurrence steps ONE day, staying in ONE series", async ({
    page,
  }) => {
    /*
     * The next MONDAY strictly after the owner's day — which is the whole point:
     * a fixed schedule never produces a date on or before the day the work was
     * actually finished, so an occurrence seeded in the past would legitimately
     * skip forward and the assertion would be about the wrong rule. This was a
     * hard-coded 2026-08-24 with that sentence beside it, and the sentence
     * stopped being true on 2026-08-24.
     */
    const monday = nextWeekday(MONDAY);
    seedDependencyTask({
      id: WEEKLY,
      title: "Standup notes",
      scheduledDate: monday,
      repeat: {
        frequency: "week",
        seriesId: WEEKLY_SERIES,
        weekdays: [1, 3, 5],
      },
    });
    await gotoFixture(page, recordUrl(WEEKLY));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
    expect(occurrenceAt(WEEKLY_SERIES, 1)?.scheduledDate).toBe(
      addDays(monday, 2),
    );
    expect(weekdayOf(addDays(monday, 2))).toBe(WEDNESDAY);

    // ...and completing THAT one steps to the Friday, in the same series.
    const wednesday = occurrenceAt(WEEKLY_SERIES, 1)!;
    await gotoFixture(page, recordUrl(wednesday.id));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
    expect(occurrenceAt(WEEKLY_SERIES, 2)?.scheduledDate).toBe(
      addDays(monday, 4),
    );
    expect(weekdayOf(addDays(monday, 4))).toBe(FRIDAY);
  });

  test("the FINAL occurrence of a bounded series creates no successor", async ({
    page,
  }) => {
    // "Ends after 2", and this is occurrence number two (sequence 1).
    seedDependencyTask({
      id: BOUNDED,
      title: "Final instalment",
      scheduledDate: "2026-08-20",
      repeat: {
        frequency: "week",
        seriesId: BOUNDED_SERIES,
        weekdays: [4],
        endsAfterCount: 2,
        sequence: 1,
      },
    });
    await gotoFixture(page, recordUrl(BOUNDED));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
    expect(occurrenceAt(BOUNDED_SERIES, 2)).toBeNull();
  });
});

/* ========================================================================== */
/* Dependencies                                                               */
/* ========================================================================== */

const BLOCKED = "e2e-dep-blocked";
const BLOCKER = "e2e-dep-blocker";
const OTHER = "e2e-dep-other";

function seedPair(options: { readonly planned?: boolean } = {}): void {
  seedDependencyTask({
    id: BLOCKER,
    title: "Get director approval",
    ...(options.planned ? { scheduledDate: ownerToday() } : {}),
  });
  seedDependencyTask({
    id: BLOCKED,
    title: "Publish the report",
    ...(options.planned ? { scheduledDate: ownerToday() } : {}),
  });
  seedDependencyTask({ id: OTHER, title: "Book the venue" });
}

test.describe("TASKS-12 — managing dependencies on the Task record", () => {
  test.beforeEach(() => {
    seedPair();
  });

  test.afterEach(() => {
    cleanupAllDependencyTasks();
  });

  test("adds a blocker, and the record says WHY the Task cannot proceed", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(BLOCKED));
    await expect(dependencies(page)).toContainText(
      "Nothing is holding this task up.",
    );

    await addBlocker(page, "Get director approval");

    // The record says WHAT is blocking, in the list; the record HEADER says the
    // Task is blocked, through the one display-state evaluator. Two renderings,
    // each adding something — never a third sentence repeating both.
    await expect(dependencies(page)).toContainText("Get director approval");
    // The blocker's state is a WORD beside it, never colour alone.
    await expect(dependencies(page)).toContainText("Waiting");
    await expect(record(page)).toContainText("Blocked");
    expect(storedBlockers(BLOCKED)).toEqual([BLOCKER]);
  });

  test("shows the other end of the SAME relationship on the blocker's record", async ({
    page,
  }) => {
    seedDependency(BLOCKED, BLOCKER);
    await gotoFixture(page, recordUrl(BLOCKER));
    await expect(dependencies(page)).toContainText("Blocks");
    await expect(dependencies(page)).toContainText("Publish the report");
    // And the blocker's own record offers no control on that direction: the
    // relationship is edited from the blocked end, on the other record.
    await expect(
      dependencies(page).getByRole("button", {
        name: /Remove Publish the report/,
      }),
    ).toHaveCount(0);
  });

  test("removes a blocker, and the Task is no longer blocked", async ({
    page,
  }) => {
    seedDependency(BLOCKED, BLOCKER);
    await gotoFixture(page, recordUrl(BLOCKED));
    await dependencies(page)
      .getByRole("button", { name: /Remove Get director approval/ })
      .click();
    await expect(dependencies(page)).toContainText(
      "Nothing is holding this task up.",
    );
    expect(storedBlockers(BLOCKED)).toEqual([]);
  });

  test("REFUSES a cycle, server-side, in the owner's words", async ({
    page,
  }) => {
    // "Get director approval" already waits on "Publish the report", so making
    // it a blocker OF that report would close a two-node cycle.
    seedDependency(BLOCKER, BLOCKED);
    await gotoFixture(page, recordUrl(BLOCKED));
    await addBlocker(page, "Get director approval");

    await expect(dependencies(page)).toContainText("wait for each other");
    // NOTHING was written: the refusal is a property of the graph, not of the UI.
    expect(storedBlockers(BLOCKED)).toEqual([]);
  });

  test("opens the blocking Task from the row that names it", async ({
    page,
  }) => {
    seedDependency(BLOCKED, BLOCKER);
    await gotoFixture(page, recordUrl(BLOCKED));
    await dependencies(page)
      .getByRole("link", { name: /Get director approval/ })
      .click();
    // The drawer STACKS, so the blocker's record is the topmost one — and it
    // shows the other end of the same relationship.
    const opened = page.getByRole("dialog").last();
    await expect(opened).toContainText("Get director approval");
    await expect(opened.getByTestId("task-dependencies")).toContainText(
      "Publish the report",
    );
  });

  test("is fully manageable by KEYBOARD", async ({ page }) => {
    await gotoFixture(page, recordUrl(BLOCKED));
    const add = dependencies(page).getByRole("button", { name: "Add blocker" });
    await add.focus();
    await page.keyboard.press("Enter");

    const picker = dependencies(page).getByRole("combobox", {
      name: /Which task must happen first/,
    });
    await expect(picker).toBeVisible();
    await picker.focus();
    await page.keyboard.type("Get director approval");
    // The candidate search is debounced and asynchronous, so the option has to
    // EXIST before a keyboard user can move to it.
    await expect(
      await comboboxOption(picker, "Get director approval"),
    ).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await dependencies(page)
      .getByRole("button", { name: "Add blocker", exact: true })
      .press("Enter");

    await expect(
      dependencies(page).getByRole("link", { name: /Get director approval/ }),
    ).toBeVisible();

    // Removing it returns focus to the control that adds one, so a keyboard user
    // is never dropped to the document body.
    await dependencies(page)
      .getByRole("button", { name: /Remove Get director approval/ })
      .press("Enter");
    await expect(
      dependencies(page).getByRole("button", { name: "Add blocker" }),
    ).toBeFocused();
  });

  test("has no accessibility violations, in light and in dark", async ({
    page,
  }) => {
    seedDependency(BLOCKED, BLOCKER);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, recordUrl(BLOCKED));
      await expect(dependencies(page)).toBeVisible();
      await expectNoAxeViolations(page, { include: "[role='dialog']" });
    }
  });
});

/* ========================================================================== */
/* Derived blocked state, on every surface                                    */
/* ========================================================================== */

test.describe("TASKS-12 — blocked state on the shared Task row", () => {
  test.beforeEach(() => {
    seedPair({ planned: true });
    seedDependency(BLOCKED, BLOCKER);
  });

  test.afterEach(() => {
    cleanupAllDependencyTasks();
  });

  test("appears on the Tasks collection", async ({ page }) => {
    await gotoFixture(page, TASKS_URL);
    const row = taskRow(page, "Publish the report");
    await expect(row.getByTestId("task-row-blocked")).toHaveText(
      "Blocked by Get director approval",
    );
    // ONE blocked label on the row: the status pill yields to the sentence that
    // says WHY, rather than repeating the word beside it.
    await expect(row.getByTestId("task-row-state")).toHaveCount(0);
  });

  test("appears on TODAY, and the Task stays where it was planned", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const row = taskRow(page, "Publish the report");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("task-row-blocked")).toHaveText(
      "Blocked by Get director approval",
    );
  });

  test("appears in WEEKLY PLANNING, and nothing is auto-rescheduled", async ({
    page,
  }) => {
    await gotoFixture(page, "/plan");
    const row = taskRow(page, "Publish the report");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("task-row-blocked")).toHaveText(
      "Blocked by Get director approval",
    );
  });

  test("narrows the collection through the shared Blocked filter", async ({
    page,
  }) => {
    await gotoFixture(page, `${TASKS_URL}&blocked=1`);
    await expect(taskRow(page, "Publish the report")).toBeVisible();
    await expect(taskRow(page, "Book the venue")).toHaveCount(0);

    await gotoFixture(page, `${TASKS_URL}&blocked=0`);
    await expect(taskRow(page, "Publish the report")).toHaveCount(0);
    await expect(taskRow(page, "Book the venue")).toBeVisible();
  });

  test("clears when the blocker is completed and RETURNS when it is reopened", async ({
    page,
  }) => {
    /*
     * SIX navigations, four of them to a Task COLLECTION, and the collection is
     * as large as the workspace is.
     *
     * V2.4-GATE-01 — this is the one test in the accumulated-state gate run that
     * failed for time rather than for truth. MEASURED on this sandbox against
     * the database a full twelve-partition sequence leaves behind (559 active
     * entities, 429 of them Tasks): the journey does **41.1 s** of real work and
     * the default 30 s budget cuts it off mid-assertion. Given 120 s it passes,
     * on the same tree, the same database and the same assertions — so the
     * product is right, the assertion is right, and the budget was wrong.
     *
     * This is a STATED measurement, not timeout inflation to bury a defect:
     * nothing is weakened, the final assertion still requires the blocked badge
     * to come back with its exact text, and a real regression fails here just as
     * loudly as before — only later. The precedent is `assets.spec.ts:65`, which
     * carries its own measurement for the same reason.
     */
    test.setTimeout(120_000);
    await gotoFixture(page, recordUrl(BLOCKER));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();

    await gotoFixture(page, TASKS_URL);
    await expect(
      taskRow(page, "Publish the report").getByTestId("task-row-blocked"),
    ).toHaveCount(0);

    // Reopening the blocker blocks it again — DERIVED, with nothing reconciled.
    await gotoFixture(page, recordUrl(BLOCKER));
    await record(page).getByRole("button", { name: "Reopen task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Complete task" }),
    ).toBeVisible();

    await gotoFixture(page, TASKS_URL);
    await expect(
      taskRow(page, "Publish the report").getByTestId("task-row-blocked"),
    ).toHaveText("Blocked by Get director approval");
  });
});

/* ========================================================================== */
/* Phone                                                                      */
/* ========================================================================== */

test.describe("TASKS-12 — phone", () => {
  test.beforeEach(() => {
    seedPair({ planned: true });
    seedDependency(BLOCKED, BLOCKER);
  });

  test.afterEach(() => {
    cleanupAllDependencyTasks();
  });

  test("manages a dependency at 393 with real thumb targets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, recordUrl(BLOCKED));
    const remove = dependencies(page).getByRole("button", {
      name: /Remove Get director approval/,
    });
    await expectMinTouchTarget(remove);
    await remove.click();
    await expect(dependencies(page)).toContainText(
      "Nothing is holding this task up.",
    );
    await expectMinTouchTarget(
      dependencies(page).getByRole("button", { name: "Add blocker" }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("keeps the recurrence editor usable at 393 without becoming a form", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, recordUrl(BLOCKED));
    const drawer = record(page);
    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await (await comboboxOption(repeat, /^Custom/)).click();
    await expect(drawer.getByTestId("task-recurrence-editor")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("does not overflow at 320, on the record OR on the collection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, TASKS_URL);
    await expect(
      taskRow(page, "Publish the report").getByTestId("task-row-blocked"),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoFixture(page, recordUrl(BLOCKED));
    await expect(dependencies(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
