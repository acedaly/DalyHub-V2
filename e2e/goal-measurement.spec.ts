import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
  postSameOrigin,
  waitForInteractive,
} from "./helpers";

/**
 * GOAL-02 — the measurable-Goal journey, end to end through the real UI.
 *
 * It follows the brief's own acceptance scenario: create "Reach 70 kg" measured
 * from a baseline of 85 kg towards a target of 70 kg, record readings over time,
 * and check that every derived figure — current value, progress, remaining,
 * change from baseline, the trend, the history — is what the arithmetic says it
 * should be. Then it edits a reading, deletes one, and verifies the page
 * recalculates rather than caching.
 *
 * The phone half is not a smaller copy of the desktop half: the check-in is the
 * interaction this feature has to be good at on a phone, so it is driven at
 * 390px with the touch-target and horizontal-overflow guards the responsive
 * contract requires.
 */

/** The measured Goal the whole spec is built on. */
async function createMeasurableGoal(page: Page, title: string) {
  await gotoFixture(page, "/areas/a-dh");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.getByRole("link", { name: "New Goal" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New Goal" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Title/).fill(title);

  // The creation flow ASKS how the Goal will be measured — that question is the
  // product claim this feature exists to make.
  await expect(
    dialog.getByText("How will you measure this Goal?"),
  ).toBeVisible();
  await dialog.getByTestId("new-goal-measurement-target_value").check();

  // Located by ROLE, not by label text: each measurement choice is a radio whose
  // accessible name includes its description ("…from a starting value towards a
  // target"), so a substring label match would be ambiguous with the fields.
  await dialog.getByRole("textbox", { name: /^Measure in/ }).fill("kg");
  await dialog.getByRole("textbox", { name: /^Starting value/ }).fill("85");
  await dialog.getByRole("textbox", { name: /^Target value/ }).fill("70");
  await dialog.getByLabel("Target date").fill("2026-12-31");

  // The direction is INFERRED and stated back — the owner never picks one.
  await expect(
    dialog.getByText("Progress means this number going down."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: /ascending|descending/i }),
  ).toHaveCount(0);

  await dialog.getByRole("button", { name: "Create Goal" }).click();
  await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
  await waitForInteractive(page);
  return page.url();
}

/** Record one reading through the check-in sheet. */
async function logMeasurement(page: Page, value: string, measuredOn: string) {
  await page.getByTestId("goal-record-measurement").first().click();
  const sheet = page.getByTestId("goal-check-in-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: /^Measurement/ }).fill(value);
  await sheet.getByLabel("Date").fill(measuredOn);
  await page.getByTestId("goal-check-in-save").click();
  await expect(sheet).toHaveCount(0);
}

test.describe("GOAL-02 — measurable Goals", () => {
  test("create a measurable Goal, record progress, and see honest figures", async ({
    page,
  }) => {
    const title = `Reach 70 kg ${Date.now()}`;
    const goalUrl = await createMeasurableGoal(page, title);

    // 1. A configured Goal with nothing recorded invites a first measurement —
    //    it does NOT show a 0% bar for a denominator it has not got.
    const panel = page.getByTestId("goal-progress");
    await expect(panel.getByText("No progress logged yet")).toBeVisible();
    await expect(panel.getByRole("progressbar")).toHaveCount(0);
    await expectNoAxeViolations(page);

    // 2. The first reading. One value is not a trend, and the page says so.
    await logMeasurement(page, "81.6", "2026-07-05");
    await expect(page.getByTestId("goal-trend-thin")).toContainText(
      "More measurements needed for a trend",
    );
    await expect(page.getByTestId("goal-trend-chart")).toHaveCount(0);

    // 3. Two more readings — now there is a trend, and the acceptance figures.
    await logMeasurement(page, "79.3", "2026-07-31");
    await logMeasurement(page, "79.0", "2026-08-09");

    /*
     * UIX-03 — the figures are a labelled STRIP, not a run-on sentence.
     *
     * "38% · 9.3 kg remaining · ↓ 5.7 kg from baseline" became four terms with
     * four values, so each is asserted through its own label: the pairing is
     * the behaviour, and a "79 kg" with no "Now" above it is the layout this
     * replaced.
     */
    const metrics = panel.getByTestId("goal-metrics");
    await expect(metrics).toContainText("Current");
    await expect(metrics).toContainText("79 kg");
    await expect(metrics).toContainText("Target");
    await expect(metrics).toContainText("70 kg");
    /*
     * REDESIGN-04 recomposed the strip into the reference's TRIO —
     * `Current · Target · Target date` — and moved "what remains" to the state
     * line: "'1.9 km to go' is a statement about progress, not a fourth
     * measurement, and beside the status word is where it reads as one"
     * (`GoalMeasurementPanel`). `Start` left the strip with it, because the
     * baseline is what the JOURNEY line states.
     *
     * Every figure this journey required is still on the page and still
     * asserted; two of them are one line lower than they were. This is the
     * assertion `goals-outcomes.spec.ts` also had to move, and it is the real
     * cause of the two `goal-measurement` failures DEBT-149 attributed to
     * accumulated measurements — the readings were fine, the labels had moved.
     */
    await expect(panel.locator(".dh-goal-measure__state")).toContainText(
      "9 kg to go",
    );
    await expect(panel.getByText("40%", { exact: true })).toBeVisible();
    // The journey, in the same words the gallery card uses for this Goal.
    await expect(panel.getByText("from 85 kg → 70 kg")).toBeVisible();

    // The bar announces the same sentence the page prints — the chart and the
    // bar are never the only way to read this.
    const bar = page.getByRole("progressbar", { name: `${title} progress` });
    await expect(bar).toHaveAttribute("aria-valuenow", "40");
    await expect(bar).toHaveAttribute(
      "aria-valuetext",
      /79 kg · 40% complete · 9 kg remaining/,
    );

    // 4. The chart, with a text equivalent stating the series.
    const chart = page.getByTestId("goal-trend-chart").getByRole("img");
    await expect(chart).toHaveAttribute("aria-label", /3 measurements/);
    await expect(chart).toHaveAttribute("aria-label", /81\.6 kg/);

    // 5. The history, newest first, each with its change from the one before.
    const history = page.getByTestId("goal-history");
    const rows = history.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("79 kg");
    await expect(rows.nth(0)).toContainText("↓ 0.3 kg");
    await expect(rows.nth(2)).toContainText("First measurement");
    await expectNoAxeViolations(page);

    // 6. Correcting a reading recalculates everything.
    await rows.nth(0).getByRole("button", { name: /^Edit/ }).click();
    const editSheet = page.getByTestId("goal-check-in-sheet");
    await expect(editSheet).toBeVisible();
    await editSheet.getByRole("textbox", { name: /^Measurement/ }).fill("77.5");
    await page.getByTestId("goal-check-in-save").click();
    await expect(editSheet).toHaveCount(0);
    await expect(panel.getByText("77.5 kg").first()).toBeVisible();
    await expect(panel.getByText(/50%/)).toBeVisible();
    // What remains recomputes from the corrected reading — on the state line,
    // for the reason given at the trio above.
    await expect(panel.locator(".dh-goal-measure__state")).toContainText(
      "7.5 kg to go",
    );

    // 7. Removing one uses the shared destructive confirmation, and the figures
    //    fall back to the reading beneath it.
    await history
      .getByRole("listitem")
      .nth(0)
      .getByRole("button", { name: /^Remove measurement/ })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Remove this measurement?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(panel.getByText("79.3 kg").first()).toBeVisible();
    await expect(history.getByRole("listitem")).toHaveCount(2);

    /*
     * 8. The COLLECTION carries the same numbers, from the same evaluator — a
     *    collection can never disagree with a record.
     *
     * REDESIGN-04 replaced the Goals gallery card with the workspace's
     * `ProgressRow`, so the same claim is read off the row: its value states
     * both terms of the journey (`goalRowValue`) and its bar announces the
     * evaluator's whole sentence (`goalProgressSummaryText`) — which is a
     * STRONGER check that the two surfaces agree than the card's prose was,
     * because the sentence is generated once and consumed by both.
     */
    await gotoFixture(page, "/goals");
    const row = page.getByTestId("goal-row").filter({ hasText: title }).first();
    await expect(row.locator(".dh-mrow__value")).toHaveText("79.3 / 70 kg");
    await expect(row.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      /79.3 kg · \d+% complete · 9.3 kg remaining/,
    );

    // 9. And the record is still reachable and correct.
    await gotoFixture(page, goalUrl);
    await expect(page.getByTestId("goal-progress")).toContainText("79.3 kg");
  });

  test("an unmeasured Goal keeps working and is never shown as 0%", async ({
    page,
  }) => {
    // The migration adds no measurement to existing Goals, so a seeded fixture
    // Goal is the real "before" state this must not break. It is addressed by id
    // rather than "the first card", because earlier tests in this file add
    // measured Goals to the same development database.
    await gotoFixture(page, "/goals/g-launch");

    const panel = page.getByTestId("goal-progress");
    await expect(panel.getByText("Not measured yet")).toBeVisible();
    await expect(panel.getByRole("progressbar")).toHaveCount(0);
    await expect(panel.getByText("0%")).toHaveCount(0);
    // The invitation teaches the next action rather than dead-ending.
    await expect(panel.getByTestId("goal-configure-measurement")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe("on a real phone", () => {
    /*
     * A phone is a WIDTH and a touch pointer, and this block needs both.
     *
     * `hasTouch` is what makes the browser report `(pointer: coarse)`, and that
     * is the condition DalyHub's touch guarantees are actually written against —
     * `tokens.css` floors every compact target back to 44px there, deliberately
     * on the input mechanism rather than on the window ("a 27-inch monitor driven
     * by a trackpad is not compact"). Setting the viewport alone reports a FINE
     * pointer, so a target-floor assertion made that way is asserting DalyHub's
     * touch contract in a context the contract explicitly does not cover — and it
     * duly measured 32-36px on `main` @ f994aa0 against controls that are 44px on
     * every real phone. `collection-header.spec.ts` records the same diagnosis in
     * the same words for its own narrow block.
     */
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test("check in from a phone without horizontal scrolling", async ({
      page,
    }) => {
      const title = `Phone goal ${Date.now()}`;
      await createMeasurableGoal(page, title);

      const record = page.getByTestId("goal-record-measurement").first();
      await expect(record).toContainText("Log weight");
      await expectMinTouchTarget(record);
      await record.click();

      const sheet = page.getByTestId("goal-check-in-sheet");
      await expect(sheet).toBeVisible();
      // The numeric field summons a decimal keypad rather than a QWERTY keyboard.
      const value = sheet.getByRole("textbox", { name: /^Measurement/ });
      await expect(value).toHaveAttribute("inputmode", "decimal");
      // The date defaults to the owner's today, which is what it nearly always is.
      await expect(sheet.getByLabel("Date")).toHaveValue(ownerToday());
      await expectMinTouchTarget(page.getByTestId("goal-check-in-save"));
      await expectNoHorizontalOverflow(page);
      await expectNoAxeViolations(page);

      await value.fill("79.4");
      await sheet.getByLabel("Date").fill("2026-08-09");
      await page.getByTestId("goal-check-in-save").click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId("goal-progress")).toContainText("79.4 kg");
      await expectNoHorizontalOverflow(page);
    });
  });

  test("the Goal record fits every phone width the contract names", async ({
    page,
  }) => {
    const title = `Width goal ${Date.now()}`;
    await createMeasurableGoal(page, title);
    await logMeasurement(page, "83.0", "2026-07-05");
    await logMeasurement(page, "79.0", "2026-08-09");

    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(50);
      await expect(page.getByTestId("goal-trend-chart")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("GOAL-02 — Today", () => {
  test("shows measurable Goal progress and the 7-day workload trend", async ({
    page,
  }) => {
    const title = `Today goal ${Date.now()}`;
    await createMeasurableGoal(page, title);
    await logMeasurement(page, "83.0", "2026-07-05");
    await logMeasurement(page, "79.0", ownerToday());

    await gotoFixture(page, "/today");
    const goals = page.getByTestId("today-goal-progress");
    await expect(goals).toBeVisible();
    /*
     * Today shows at most four Goals, chosen by its own ranking, and this
     * development database accumulates Goals across the suite. So the assertion
     * is about the SECTION's behaviour — a measurable Goal with its value, its
     * target and what remains, and one action — rather than about which Goal the
     * ranking happened to choose. `todayGoalRank` is unit-tested directly.
     */
    const row = goals.locator(".dh-today__goal").first();
    await expect(row).toContainText(/kg/);
    await expect(row).toContainText("Target 70 kg");
    /*
     * Today states the percentage and the state WORD, not the remainder.
     *
     * `GoalProgressReadout` at `glance` size deliberately drops "N remaining"
     * (see its `size` doc): a glance surface answers "how is this going?", and
     * the Goal record is one tap away for the arithmetic. This assertion used
     * to require "remaining" and had been failing on main because of it —
     * fixed here rather than left red, since UIX-03 is the pass that owns these
     * surfaces.
     */
    await expect(row).toContainText(/\d+%/);
    await expect(row).toContainText(
      /On track|Ahead|In progress|Needs attention|Target achieved|No recent update/,
    );
    // Hold on to WHICH Goal this is: recording a measurement changes its rank
    // (a Goal just checked in is no longer waiting for one), so the row can move.
    const chosenTitle = (
      await row.locator(".dh-today__goal-title").innerText()
    ).trim();

    // The one action Today offers for a Goal — the same shared check-in sheet.
    const update = row.getByTestId("today-goal-update");
    await expect(update).toContainText("Log weight");
    await expectMinTouchTarget(update);
    await update.click();
    const sheet = page.getByTestId("goal-check-in-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("textbox", { name: /^Measurement/ }).fill("78.6");
    await page.getByTestId("goal-check-in-save").click();
    await expect(sheet).toHaveCount(0);
    // The new reading reaches Today without leaving it. The assertion is on the
    // SECTION rather than a fixed row, because recording a measurement changes
    // that Goal's rank and the ranking may legitimately reorder the list.
    await expect(goals).toContainText("78.6 kg");
    // Same reason as above: the glance readout states the value and the
    // percentage, and leaves the remainder to the record.
    await expect(goals).toContainText(/\d+%/);
    expect(chosenTitle.length).toBeGreaterThan(0);

    await expectNoAxeViolations(page);
  });

  test("shows the workload trend once the week has something in it", async ({
    page,
    request,
  }) => {
    /*
     * Complete one task from the day. That is a real completion on the owner's
     * calendar today, which is what gives the week something to compare.
     *
     * It completes a task THIS TEST CREATED, and that is the whole of the
     * change HARDEN-04 made here. It used to tick `.dh-day-row__check` FIRST —
     * whatever happened to be at the top of the Focus panel, which is the
     * oldest row of the OVERDUE band, which in the shared development workspace
     * is the seeded "Submit the abstract". Completing it takes the "Conference
     * talk" Project off at-risk permanently, and `project-health.spec.ts:31`
     * exists to assert that Project IS at risk. The two specs never shared a
     * runner under the old count-based shard split, so the leak was invisible;
     * they do now, and it failed on the first run of the new partition
     * (31748745557, `E2E p08`) with "On track — All tasks complete".
     *
     * Owning the record also removes the `if (count)` guard, which could make
     * this journey assert nothing at all on a day the fixture happened to be
     * empty, and the 500 ms sleep that stood in for a signal.
     */
    const title = `GOAL02 trend ${Date.now()}`;
    const created = await postSameOrigin(request, "/tasks/new", {
      form: { title, dueDate: ownerToday() },
    });
    const body = (await created.json()) as {
      ok: boolean;
      taskId?: string;
      formError?: string;
    };
    expect(body.ok, `creating "${title}": ${body.formError ?? ""}`).toBe(true);

    await gotoFixture(page, "/today");
    const own = page
      .locator(".dh-taskrow", { hasText: title })
      .getByRole("checkbox", { name: `Complete ${title}` });
    await own.check();
    // The row's own state is the signal that the completion landed — no sleep.
    await expect(
      page
        .locator(".dh-taskrow", { hasText: title })
        .getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();

    await gotoFixture(page, "/today");

    /*
     * REDESIGN-03 — the week is a MEASURE now, not a chart.
     *
     * The workload trend restated the summary's own first two figures ("21
     * completed · 124 created") one screen below them, and its single linear
     * scale made a day of bulk capture flatten the rest of the week to
     * hairlines. It is gone; Analytics owns the shape of a week, and the
     * measure the completion above just moved links there.
     */
    await expect(page.getByTestId("today-activity-trend")).toHaveCount(0);
    const summary = page.getByTestId("today-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Tasks completed");
    await expect(
      summary.getByRole("link", { name: /Tasks completed/ }),
    ).toHaveAttribute("href", "/analytics");
    await expectNoAxeViolations(page);
  });

  test("Today's progress sections fit a 320px phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/today");
    await expect(page.getByTestId("today-goal-progress")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
