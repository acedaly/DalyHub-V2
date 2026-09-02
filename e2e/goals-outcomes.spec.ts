/**
 * UIX-03 — a Goal read as an OUTCOME, on the surface REDESIGN-04 shipped.
 *
 * `goals.spec.ts` covers the collection's alignment behaviour and its lifecycle
 * views; `goal-measurement.spec.ts` covers one Goal's whole measurement journey
 * end to end. This file covers what UIX-03 added on top of both: that a Goal
 * reads as an outcome, that the status views narrow it honestly, that the
 * record's chart shows the target it is aiming at, and that all of it survives a
 * phone and an accessibility scan.
 *
 * ── Why every locator in this file changed (HARDEN-05) ──────────────────────
 * UIX-03 expressed all of that on a GALLERY CARD (`goal-card`,
 * `goal-card-metric`, `goal-card-state`, `.dh-spark`). REDESIGN-04 §2.2
 * replaced the gallery with a master–detail WORKSPACE: the list is
 * `ProgressRow` (a tinted mark, the name, the Area, a thin bar and the Goal's
 * own value at the line's end), and the pane beside it is the selected Goal's
 * whole measurement surface. Not one of the card's test ids exists in the
 * product, so seven of this file's eleven journeys were asserting on a
 * component that had been deleted — which is why the file read as "the whole
 * feature is broken" in DEBT-149 when nothing about the feature was.
 *
 * The CONTRACT is unchanged and is what is asserted below, moved to where each
 * part of it now lives:
 *
 *   the reading leads          → the row's value, `60.0 / 70 kg`
 *   the journey is checkable   → the same value states both terms
 *   the sentence is announced  → the row's bar `aria-valuetext`, verbatim
 *   the trend                  → the pane's FULL chart. REDESIGN-04 dropped the
 *                                sparkline deliberately ("a 100px sketch of
 *                                twelve readings … can carry no scale") and
 *                                moved the trend to the pane, where it reads.
 *   absence is absence         → a Goal with no reading has no bar and no value
 *
 * It drives the REAL product against the shared E2E seed, creating the Goals it
 * needs through the UI, so nothing here depends on a fixture scenario a
 * developer has to remember to run.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { ownerDayPlus, shortCalendarDate } from "./calendar-dates";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  gotoFixture,
  hasNoHorizontalOverflow,
  ownerToday,
  waitForInteractive,
} from "./helpers";

/** A unique suffix, so a re-run never collides with the last one's records. */
const RUN = String(Date.now());
/**
 * The target date the journey types and reads back rendered — derived from the
 * owner's day rather than fixed, so the calendar cannot pass it (CONV-00-E).
 */
const TARGET_DATE = ownerDayPlus(100);

/** Create a measurable Goal through the product and return its record URL. */
async function createMeasurableGoal(
  page: Page,
  options: {
    readonly title: string;
    readonly unit: string;
    readonly start: string;
    readonly target: string;
    readonly targetDate?: string;
  },
): Promise<string> {
  await gotoFixture(page, "/areas/a-dh");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.getByRole("link", { name: "New Goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Goal" });
  await dialog.getByLabel(/Title/).fill(options.title);
  await dialog.getByTestId("new-goal-measurement-target_value").check();
  await dialog.getByRole("textbox", { name: /^Measure in/ }).fill(options.unit);
  await dialog
    .getByRole("textbox", { name: /^Starting value/ })
    .fill(options.start);
  await dialog
    .getByRole("textbox", { name: /^Target value/ })
    .fill(options.target);
  if (options.targetDate) {
    await dialog.getByLabel("Target date").fill(options.targetDate);
  }
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

/** One Goal's row in the workspace list, found by its name. */
function goalRow(page: Page, title: string): Locator {
  return page.getByTestId("goal-row").filter({ hasText: title });
}

/** Select a row and wait for its pane — the workspace's master–detail move. */
async function openGoalPane(page: Page, title: string): Promise<Locator> {
  await goalRow(page, title).getByRole("link").first().click();
  await waitForInteractive(page);
  const pane = page.getByTestId("goal-workspace-pane");
  await expect(pane).toBeVisible();
  return pane;
}

test.describe("UIX-03 — the Goal row reads as an outcome", () => {
  test("leads with the reading, states the journey, and shows a trend", async ({
    page,
  }) => {
    const title = `Reach 70 kg ${RUN}`;
    await createMeasurableGoal(page, {
      title,
      unit: "kg",
      start: "85",
      target: "70",
      targetDate: TARGET_DATE,
    });

    // Enough history for a real chart: two readings is the floor, and below it
    // the Goal must show no trend at all rather than a flat line.
    await logMeasurement(page, "85.0", "2026-06-10");
    await logMeasurement(page, "81.2", "2026-07-08");
    await logMeasurement(page, "79.3", "2026-08-08");

    await gotoFixture(page, "/goals");
    const row = goalRow(page, title);
    await expect(row).toBeVisible();

    // 1 & 2. The READING leads and the JOURNEY is stated, in ONE value — which
    //        is what makes the percentage checkable by eye. The unit is spoken
    //        once, on the target, exactly as `goalRowValue` writes it.
    await expect(row.locator(".dh-mrow__value")).toHaveText("79.3 / 70 kg");
    // 3. The bar announces the same sentence the record's bar announces. This
    //    is the assertion the card's `progressbar` carried, unchanged.
    await expect(row.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      /79.3 kg · \d+% complete · 9.3 kg remaining/,
    );
    // 4. NO sparkline anywhere in the list. REDESIGN-04 removed it on purpose,
    //    so its absence is the contract now, not its presence.
    await expect(
      page.getByTestId("goals-list").locator(".dh-spark"),
    ).toHaveCount(0);

    // 5. The trend, and what remains, and by when — on the pane, which is where
    //    the master–detail put them and where the chart has room to read.
    const pane = await openGoalPane(page, title);
    await expect(pane.getByTestId("goal-trend-chart")).toBeVisible();
    await expect(pane.locator(".dh-goal-measure__state")).toContainText(
      "9.3 kg to go",
    );
    await expect(pane).toContainText(shortCalendarDate(TARGET_DATE));
  });

  test("a Goal with one reading gets no trend line, and says the value instead", async ({
    page,
  }) => {
    const title = `Save $9,000 ${RUN}`;
    await createMeasurableGoal(page, {
      title,
      unit: "$",
      start: "0",
      target: "9000",
    });
    await logMeasurement(page, "1500", ownerToday());

    await gotoFixture(page, "/goals");
    await expect(goalRow(page, title).locator(".dh-mrow__value")).toHaveText(
      "1,500 / $9,000",
    );

    // One point has no direction; drawing a line through it would assert one.
    // The pane says so in words rather than plotting it.
    const pane = await openGoalPane(page, title);
    await expect(pane.getByTestId("goal-trend-chart")).toHaveCount(0);
    await expect(pane.getByTestId("goal-trend-thin")).toContainText(
      "More measurements needed for a trend",
    );
  });

  test("an unmeasured Goal states the absence, never a 0% reading", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    // The seed always holds at least one Goal with no measurement.
    const unmeasured = page
      .getByTestId("goal-row")
      .filter({ hasNot: page.getByRole("progressbar") })
      .first();
    await expect(unmeasured).toBeVisible();
    // No bar, and no invented value beside the name.
    await expect(unmeasured.locator(".dh-mrow__value")).toHaveCount(0);

    // …and the pane states the absence in words rather than showing 0%.
    const title = (await unmeasured.getByRole("link").innerText()).trim();
    const pane = await openGoalPane(page, title);
    await expect(pane.getByRole("progressbar")).toHaveCount(0);
    await expect(pane).toContainText(
      /No progress logged yet|No measurement configured|Not measured/,
    );
  });
});

test.describe("UIX-03 — the status views", () => {
  test("narrow the workspace to a real subset, and back again", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    const views = page.getByTestId("goals-views");
    await expect(views).toBeVisible();

    const all = await page.getByTestId("goal-row").count();
    expect(all).toBeGreaterThan(0);

    /*
     * "Needs attention" is a partition of statuses the evaluator produces, so
     * every row it shows must CARRY one of those statuses — the tab and the row
     * are two readings of the same derivation and can never disagree.
     *
     * The row states its status through the shared meter (`data-meter-status`),
     * because REDESIGN-04 deliberately gives the row a bar and a value rather
     * than a status word: `goalProgressMeterStatus` maps `needs_attention` to
     * `warning` and `overdue` to `danger`, and those are the only two statuses
     * `goalMatchesCollectionView("attention", …)` admits.
     */
    await views.getByRole("link", { name: /Needs attention/ }).click();
    await waitForInteractive(page);
    await expect(page).toHaveURL(/view=attention/);
    const narrowed = page.getByTestId("goal-row");
    const count = await narrowed.count();
    for (let index = 0; index < count; index += 1) {
      await expect(
        narrowed.nth(index).getByRole("progressbar"),
      ).toHaveAttribute("data-meter-status", /warning|danger/);
    }
    expect(count).toBeLessThanOrEqual(all);

    await views.getByRole("link", { name: "All" }).click();
    await waitForInteractive(page);
    await expect(page.getByTestId("goal-row")).toHaveCount(all);
  });

  test("a view matching nothing offers the way back, never a dead end", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals?view=completed");
    const rows = await page.getByTestId("goal-row").count();
    if (rows === 0) {
      await expect(
        page.getByRole("link", { name: "Show all Goals" }),
      ).toHaveAttribute("href", "/goals");
    }
  });
});

test.describe("UIX-03 — the Goal record's chart", () => {
  test("draws the target it is aiming at, and names it in text", async ({
    page,
  }) => {
    const title = `Reach 68 kg ${RUN}`;
    const url = await createMeasurableGoal(page, {
      title,
      unit: "kg",
      start: "85",
      target: "68",
    });
    await logMeasurement(page, "84.0", "2026-06-10");
    await logMeasurement(page, "82.5", "2026-07-08");
    await logMeasurement(page, "81.0", "2026-08-08");

    await gotoFixture(page, url);
    const chart = page.getByTestId("goal-trend-chart");
    await expect(chart).toBeVisible();

    /*
     * The regression UIX-03 exists to fix: a target far below every reading
     * used to be dropped from the chart entirely, so the plot answered "have I
     * moved?" and silently refused "am I getting there?".
     */
    await expect(chart.locator(".dh-linechart__target")).toHaveCount(1);
    await expect(chart).toContainText("Target 68 kg");
    // Never colour alone — the caption states both the series and the target.
    await expect(chart.getByRole("img")).toHaveAttribute(
      "aria-label",
      /3 measurements/,
    );

    // ONE tab stop for the whole series, not one per reading.
    await expect(chart.locator("[tabindex]")).toHaveCount(1);
    // …and it names a reading without any interaction at all.
    await expect(chart).toContainText(/81 kg on /);
  });

  test("the record states the reading, the target and what remains", async ({
    page,
  }) => {
    const title = `Read 20 books ${RUN}`;
    const url = await createMeasurableGoal(page, {
      title,
      unit: "books",
      start: "0",
      target: "20",
    });
    await logMeasurement(page, "8", ownerToday());
    await gotoFixture(page, url);

    /*
     * REDESIGN-04 recomposed this strip, deliberately, and the labels changed
     * with it: the trio is `Current · Target · Target date`, and "what remains"
     * moved to the STATE line beside the status word — "'1.9 km to go' is a
     * statement about progress, not a fourth measurement", in the panel's own
     * words. `Start` is no longer one of the three, which is why this journey
     * and `goal-measurement.spec.ts` both failed on `main` asking for it.
     *
     * Every fact UIX-03 required is still on the page and is still asserted;
     * two of them are simply one line lower than they were.
     */
    const metrics = page.getByTestId("goal-metrics");
    await expect(metrics).toContainText("Current");
    await expect(metrics).toContainText("8 books");
    await expect(metrics).toContainText("Target");
    await expect(metrics).toContainText("20 books");
    await expect(page.locator(".dh-goal-measure__state")).toContainText(
      "12 books to go",
    );
  });
});

test.describe("UIX-03 — phone and accessibility", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the workspace fits a phone and passes an axe scan", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    await expect(page.getByTestId("goal-row").first()).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    await expectNoAxeViolations(page);
  });

  test("the record's chart fits a phone and passes an axe scan", async ({
    page,
  }) => {
    const title = `Walk 500 km ${RUN}`;
    const url = await createMeasurableGoal(page, {
      title,
      unit: "km",
      start: "0",
      target: "500",
    });
    await logMeasurement(page, "120", "2026-07-01");
    await logMeasurement(page, "260", "2026-08-01");
    await gotoFixture(page, url);

    await expect(page.getByTestId("goal-trend-chart")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    await expectNoAxeViolations(page);
  });
});

/*
 * The project matrix plus 1920.
 *
 * `RESPONSIVE_VIEWPORTS` runs 320 → 2560 and brackets 1920 without landing on
 * it. The UIX-03 brief names 1920 explicitly, and it is the width at which the
 * workspace reaches its widest composition, so it is added HERE rather than to
 * the shared list — widening the shared matrix would add a width to every spec
 * in the suite, which is a suite-wide decision and not this pass's to make.
 */
const GOAL_VIEWPORTS = [
  ...RESPONSIVE_VIEWPORTS,
  { label: "desktop-1920", width: 1920, height: 1080 },
] as const;

test.describe("UIX-03 — the responsive matrix", () => {
  /*
   * The workspace and the record across every width the contract names — 320
   * through ultra-wide. The Goals workspace is a two-pane composition that
   * collapses to two SCREENS on a phone, which is exactly the shape most able
   * to force a wide page.
   */
  test("the Goals workspace never scrolls sideways at any supported width", async ({
    page,
  }) => {
    for (const viewport of GOAL_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/goals");
      await expect(page.getByTestId("goal-row").first()).toBeVisible();
      expect(
        await hasNoHorizontalOverflow(page),
        `horizontal overflow at ${viewport.label}`,
      ).toBe(true);
    }
  });

  test("a measurable Goal record never scrolls sideways at any supported width", async ({
    page,
  }) => {
    /*
     * A real budget for a journey that is genuinely long, rather than the
     * default 30s it had been failing against since UIX-03 added the eleventh
     * viewport: this test CREATES a measurable Goal, logs two measurements
     * through the product, and then loads the record at ELEVEN widths, each
     * `gotoFixture` waiting for the network to settle. It was one of the
     * failures DEBT-125 carried as "not yet diagnosed", and it is a budget
     * defect, not a flake — it exceeds 30s deterministically, on a CI runner and
     * locally. Nothing is retried and no assertion is relaxed; the same eleven
     * widths are still asserted. `linked-items.spec.ts` sets its own budget for
     * the same reason.
     */
    test.setTimeout(120_000);
    const url = await createMeasurableGoal(page, {
      title: `Cycle 2,000 km ${RUN}`,
      unit: "km",
      start: "0",
      target: "2000",
    });
    await logMeasurement(page, "300", "2026-06-01");
    await logMeasurement(page, "720", "2026-07-01");

    for (const viewport of GOAL_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, url);
      // The chart is the element most likely to force a wide page.
      await expect(page.getByTestId("goal-trend-chart")).toBeVisible();
      expect(
        await hasNoHorizontalOverflow(page),
        `horizontal overflow at ${viewport.label}`,
      ).toBe(true);
    }
  });
});
