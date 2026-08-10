/**
 * UIX-03 — the Goals gallery as an OUTCOMES surface.
 *
 * `goals.spec.ts` covers the collection's alignment behaviour and its lifecycle
 * views; `goal-measurement.spec.ts` covers one Goal's whole measurement journey
 * end to end. This file covers what UIX-03 added on top of both: that a Goal
 * card reads as an outcome, that the status views narrow it honestly, that the
 * record's chart shows the target it is aiming at, and that all of it survives a
 * phone and an accessibility scan.
 *
 * It drives the REAL product against the shared E2E seed, creating the Goals it
 * needs through the UI, so nothing here depends on a fixture scenario a
 * developer has to remember to run.
 */

import { expect, test, type Page } from "@playwright/test";

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

test.describe("UIX-03 — the Goal card reads as an outcome", () => {
  test("leads with the reading, states the journey, and shows a trend", async ({
    page,
  }) => {
    const title = `Reach 70 kg ${RUN}`;
    await createMeasurableGoal(page, {
      title,
      unit: "kg",
      start: "85",
      target: "70",
      targetDate: "2026-12-10",
    });

    // Enough history for a sparkline: two readings is the floor, and below it
    // the card must show no chart at all rather than a flat line.
    await logMeasurement(page, "85.0", "2026-06-10");
    await logMeasurement(page, "81.2", "2026-07-08");
    await logMeasurement(page, "79.3", "2026-08-08");

    await gotoFixture(page, "/goals");
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card).toBeVisible();

    // 1. The READING leads — the thing the owner set out to change.
    await expect(card.getByTestId("goal-card-metric")).toContainText("79.3 kg");
    // 2. The JOURNEY, which is what makes the percentage checkable by eye.
    await expect(card).toContainText("from 85 kg → 70 kg");
    // 3. The state, what remains, and by when.
    const state = card.getByTestId("goal-card-state");
    await expect(state).toContainText("9.3 kg to go");
    await expect(state).toContainText("by 10 Dec 2026");
    // 4. ONE visual: the sparkline, which is decorative because every fact it
    //    carries is printed beside it.
    const spark = card.locator(".dh-spark");
    await expect(spark).toHaveCount(1);
    await expect(spark).toHaveAttribute("aria-hidden", "true");
    // 5. The bar announces the same sentence the record's bar announces.
    await expect(card.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      /79.3 kg · \d+% complete · 9.3 kg remaining/,
    );
  });

  test("a Goal with one reading gets no sparkline, and says the value instead", async ({
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
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card.getByTestId("goal-card-metric")).toContainText("$1,500");
    // One point has no direction; drawing a line through it would assert one.
    await expect(card.locator(".dh-spark")).toHaveCount(0);
  });

  test("an unmeasured Goal states the absence, never a 0% reading", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    const card = page
      .getByTestId("goal-card")
      .filter({ has: page.getByTestId("goal-card-note") })
      .first();
    // The seed always holds at least one Goal with no measurement.
    await expect(card).toBeVisible();
    await expect(card.getByTestId("goal-card-note")).toContainText(
      /Not measured|No measurement recorded yet/,
    );
    // No reading block, so no invented current value beside the absence.
    await expect(card.getByTestId("goal-card-metric")).toHaveCount(0);
  });
});

test.describe("UIX-03 — the status views", () => {
  test("narrow the gallery to a real subset, and back again", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    const views = page.getByTestId("goals-views");
    await expect(views).toBeVisible();

    const all = await page.getByTestId("goal-card").count();
    expect(all).toBeGreaterThan(0);

    // "Needs attention" is a partition of statuses the evaluator produces, so
    // every card it shows must say one of those words — the tab and the card
    // are two readings of the same derivation and can never disagree.
    await views.getByRole("link", { name: /Needs attention/ }).click();
    await waitForInteractive(page);
    await expect(page).toHaveURL(/view=attention/);
    const narrowed = page.getByTestId("goal-card");
    const count = await narrowed.count();
    for (let index = 0; index < count; index += 1) {
      await expect(
        narrowed.nth(index).getByTestId("goal-card-state"),
      ).toContainText(/Needs attention|Overdue/);
    }
    expect(count).toBeLessThanOrEqual(all);

    await views.getByRole("link", { name: "All" }).click();
    await waitForInteractive(page);
    await expect(page.getByTestId("goal-card")).toHaveCount(all);
  });

  test("a view matching nothing offers the way back, never a dead end", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals?view=completed");
    const cards = await page.getByTestId("goal-card").count();
    if (cards === 0) {
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

  test("the record states start, now, target and what remains", async ({
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

    const metrics = page.getByTestId("goal-metrics");
    await expect(metrics).toContainText("Start");
    await expect(metrics).toContainText("Now");
    await expect(metrics).toContainText("8 books");
    await expect(metrics).toContainText("Target");
    await expect(metrics).toContainText("20 books");
    await expect(metrics).toContainText("12 books to go");
  });
});

test.describe("UIX-03 — phone and accessibility", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the gallery fits a phone and passes an axe scan", async ({ page }) => {
    await gotoFixture(page, "/goals");
    await expect(page.getByTestId("goal-card").first()).toBeVisible();
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
 * gallery reaches its widest column count, so it is added HERE rather than to
 * the shared list — widening the shared matrix would add a width to every spec
 * in the suite, which is a suite-wide decision and not this pass's to make.
 */
const GOAL_VIEWPORTS = [
  ...RESPONSIVE_VIEWPORTS,
  { label: "desktop-1920", width: 1920, height: 1080 },
] as const;

test.describe("UIX-03 — the responsive matrix", () => {
  /*
   * The gallery and the record across every width the contract names — 320
   * through ultra-wide. The Goal card is the newest composition in the product
   * and the one most able to overflow: a tinted block holding a display-size
   * value, a sparkline and a currency figure, three or four to a row.
   */
  test("the Goals gallery never scrolls sideways at any supported width", async ({
    page,
  }) => {
    for (const viewport of GOAL_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/goals");
      await expect(page.getByTestId("goal-card").first()).toBeVisible();
      expect(
        await hasNoHorizontalOverflow(page),
        `horizontal overflow at ${viewport.label}`,
      ).toBe(true);
    }
  });

  test("a measurable Goal record never scrolls sideways at any supported width", async ({
    page,
  }) => {
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
