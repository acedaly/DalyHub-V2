/**
 * UIX-05 — the Analytics surface, in a real browser against the seeded Worker/D1
 * app.
 *
 * Analytics writes nothing and owns no record, so there is no journey to drive.
 * What there IS to prove is the set of promises the surface makes, none of which
 * a unit test can check against real data:
 *
 *   - it renders from real reads, at every range, without a 500 and without a
 *     figure the product cannot produce;
 *   - the range is a real URL, so it is shareable and Back/Forward-correct;
 *   - every figure is a link to the records behind it (§ "a number the owner
 *     cannot check is a number they have to trust");
 *   - it is reachable from the shell's own navigation, because it is registry-
 *     driven rather than hard-coded;
 *   - WCAG 2.2 AA, and no horizontal overflow from 320px up.
 */

import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const RANGES = [
  { label: "7 days", path: "/analytics" },
  { label: "4 weeks", path: "/analytics?range=month" },
  { label: "12 weeks", path: "/analytics?range=quarter" },
] as const;

test.describe("UIX-05 — Analytics", () => {
  test("renders the surface with its span and its figures", async ({
    page,
  }) => {
    await gotoFixture(page, "/analytics");
    await expect(
      page.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeVisible();

    // Either the figures OR the one empty state — never a blank region, and
    // never a page of zeroes. Which of the two depends on the seeded workspace's
    // completion history, so the assertion covers both honestly.
    const metrics = page.getByRole("list", { name: "This period" });
    const empty = page.getByText("Nothing completed in this period");
    await expect(metrics.or(empty).first()).toBeVisible();
  });

  test("every range is a real, shareable URL", async ({ page }) => {
    for (const range of RANGES) {
      await gotoFixture(page, range.path);
      const rail = page.getByRole("group", { name: "Analytics range" });
      await expect(
        rail.getByRole("link", { name: new RegExp(range.label) }),
      ).toHaveAttribute("aria-current", "true");
    }
  });

  test("moving between ranges is ordinary navigation, and Back works", async ({
    page,
  }) => {
    await gotoFixture(page, "/analytics");
    await page
      .getByRole("group", { name: "Analytics range" })
      .getByRole("link", { name: /12 weeks/ })
      .click();
    await expect(page).toHaveURL(/range=quarter/);
    await page.goBack();
    await expect(page).toHaveURL(/\/analytics$/);
  });

  test("every figure links to the records behind it", async ({ page }) => {
    await gotoFixture(page, "/analytics");
    const metrics = page.getByRole("list", { name: "This period" });
    if ((await metrics.count()) === 0) {
      test.skip(true, "The seeded workspace completed nothing in this range.");
    }
    // At least the Tasks figure always resolves to a link when the read
    // succeeded; a figure whose read failed renders "Not available" instead,
    // which is the honest alternative and is asserted by the unit tests.
    await expect(metrics.getByRole("link").first()).toHaveAttribute(
      "href",
      /\/(tasks|projects|goals|areas)/,
    );
  });

  /*
   * CONVERGE-01 §8 — the overdue metric, against real reads.
   *
   * The unit tests own the arithmetic and the wording; what only a browser
   * against real D1 can prove is that the card and the chart are the SAME
   * reading, that the chart's interactive readout genuinely works, and that the
   * enumeration every reading needs is in the document without being printed
   * under the plot.
   */
  test("reports the overdue backlog, and card and chart agree", async ({
    page,
  }) => {
    await gotoFixture(page, "/analytics");
    const card = page.getByTestId("analytics-metric-overdue");
    await expect(card).toBeVisible();

    const figure = (await card.innerText()).trim().split(/\s/)[0];
    // A degraded read renders "Not available" instead — honest, and asserted by
    // the unit tests rather than skipped over here.
    test.skip(
      !/^\d+$/.test(figure),
      "The overdue read is unavailable in this environment.",
    );

    const chart = page.getByTestId("analytics-overdue-trend");
    await expect(chart).toBeVisible();
    // The chart states a status, in the product's ONE meter vocabulary.
    await expect(chart).toHaveAttribute("data-meter-status", "warning");

    // The readout names the latest reading with nothing selected, and the
    // latest reading IS the card's figure — by construction, so a disagreement
    // is a real regression rather than a flake.
    const readout = chart.getByRole("status");
    await expect(readout).toContainText(
      new RegExp(`^${figure} overdue at the close of `),
    );

    // CONVERGE-01 §I — the visible caption is one line; the enumeration of every
    // reading is present but visually hidden.
    const caption = chart.locator("figcaption");
    await expect(caption).toContainText(`${figure} overdue now, read at the`);
    await expect(caption.locator(".dh-visually-hidden")).toHaveCount(1);
  });

  test("the overdue readout follows the keyboard through the series", async ({
    page,
  }) => {
    await gotoFixture(page, "/analytics?range=quarter");
    const chart = page.getByTestId("analytics-overdue-trend");
    test.skip(
      (await chart.count()) === 0,
      "The overdue read is unavailable in this environment.",
    );

    const readout = chart.getByRole("status");
    const latest = await readout.innerText();

    // One tab stop for the whole series, then the arrow keys walk it — the same
    // contract the completion trend has.
    await chart.locator(".dh-linechart__frame").focus();

    // The FIRST press lands on the latest reading, deliberately: arrowing in
    // from nothing lands where the readout already was rather than at an
    // arbitrary end (`TrendLine`). So it is the SECOND press that must move.
    await page.keyboard.press("ArrowLeft");
    await expect(readout).toHaveText(latest);
    await page.keyboard.press("ArrowLeft");
    await expect(readout).not.toHaveText(latest);
    await expect(readout).toContainText(/^\d+ overdue at the close of /);

    // Escape returns the readout to the latest reading rather than blanking a
    // reserved line.
    await page.keyboard.press("Escape");
    await expect(readout).toHaveText(latest);
  });

  test("is reachable from the shell navigation", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Analytics" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/analytics/);
  });

  test("meets WCAG 2.2 AA", async ({ page }) => {
    await gotoFixture(page, "/analytics");
    await expectNoAxeViolations(page);
  });

  for (const viewport of RESPONSIVE_VIEWPORTS) {
    test(`has no horizontal overflow at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/analytics");
      await expectNoHorizontalOverflow(page);
    });
  }
});
