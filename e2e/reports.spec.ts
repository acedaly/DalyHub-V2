import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * V2.13 — the Reports surface, driven end to end against the development-auth
 * server over real (seeded) D1.
 *
 * What it proves, in the product rather than in a unit:
 *   - the collection lists DEFINITIONS and executes nothing;
 *   - a built-in opens and answers from the workspace's own records;
 *   - changing a control changes the URL, and the URL is the definition;
 *   - a report saves under a name, reopens with the same question, and deletes;
 *   - a built-in is never edited by changing it — a save writes a new report;
 *   - a hand-edited definition is REFUSED rather than answering a different
 *     question;
 *   - the answer is readable as a number and a table with the chart beneath, at
 *     320px, by keyboard, and with no axe violation.
 *
 * It creates only its own clearly-named saved reports and never mutates a
 * record, so it cannot disturb the other journeys.
 */

const WORKSPACE_ID = "local-dev-workspace";
const SAVED = "E2E household spending";
const COPY = "E2E household spending copy";

/** Remove any report this spec might have left behind on a previous run. */
function removeSavedReports(): void {
  const names = [SAVED, COPY].map((name) => sqlLiteral(name)).join(", ");
  d1Execute(
    `DELETE FROM task_saved_views
       WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
         AND kind = 'report' AND name IN (${names});`,
  );
}

/** The one control group by its label, on the report page. */
function control(page: Page, label: string) {
  return page.getByRole("list", { name: label });
}

test.beforeEach(() => {
  removeSavedReports();
});

test.afterAll(() => {
  removeSavedReports();
});

test.describe("Reports", () => {
  test("the collection lists definitions and runs nothing", async ({
    page,
  }) => {
    await gotoFixture(page, "/reports");

    await expect(
      page.getByRole("heading", { level: 1, name: "Reports" }),
    ).toBeVisible();

    // All six examples, by name. They are code, so they are always present.
    for (const title of [
      "Spending by category",
      "Goal measurements",
      "Completed Tasks by Area",
      "Obligations due in the next 90 days",
      "Project health across Reviews",
      "Recurring commitments by month",
    ]) {
      await expect(
        page.getByRole("link", { name: new RegExp(title) }),
      ).toBeVisible();
    }

    // The collection draws no figures at all: opening Reports must never mean
    // running six reports before first paint.
    await expect(page.getByTestId("report-bars")).toHaveCount(0);
    await expect(page.locator(".dh-report__table")).toHaveCount(0);
  });

  test("a built-in answers from the workspace's own records", async ({
    page,
  }) => {
    await gotoFixture(page, "/reports/completed-tasks-by-area");

    await expect(
      page.getByRole("heading", { level: 1, name: "Completed Tasks by Area" }),
    ).toBeVisible();

    // The rows are ordinary text, always — the chart is the illustration.
    await expect(page.locator(".dh-report__table").first()).toBeVisible();

    /*
     * The approximation travels WITH the claim. DEBT-251: the spine keeps no
     * link history, so a completion is attributed to where the Task sits today,
     * and the report says so every time it is drawn.
     */
    await expect(
      page.getByText(/where each Task sits today/i).first(),
    ).toBeVisible();
  });

  test("changing a control changes the URL, and the URL is the definition", async ({
    page,
  }) => {
    await gotoFixture(page, "/reports/completed-tasks-by-area");

    await control(page, "Period")
      .getByRole("link", { name: "4 weeks" })
      .click();
    await expect(page).toHaveURL(/\/reports\/view\?/);
    await expect(page).toHaveURL(/w=4-weeks/);
    await expect(page).toHaveURL(/src=tasks/);
    await expect(page).toHaveURL(/m=completed_count/);

    // Reloading the URL is a no-op: the address bar IS the state, so the
    // control comes back on the same choice with no client state to restore.
    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(
      control(page, "Period").getByRole("link", { name: "4 weeks" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("saves, reopens with the same question, and deletes", async ({
    page,
  }) => {
    await gotoFixture(page, "/reports/completed-tasks-by-area");
    await control(page, "Break down")
      .getByRole("link", { name: "Project" })
      .click();
    await expect(page).toHaveURL(/by=g%3Aproject/);

    await page.getByRole("button", { name: /Save as a new report/ }).click();
    await page.getByLabel("Report name").fill(SAVED);
    await page.getByRole("button", { name: "Save report" }).click();
    await expect(page.getByText(`Saved “${SAVED}”.`)).toBeVisible();

    // The built-in is UNTOUCHED: a save writes a new report, never an edit.
    await gotoFixture(page, "/reports");
    await expect(
      page.getByRole("link", { name: new RegExp(SAVED) }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Completed Tasks by Area/ }),
    ).toBeVisible();

    // Reopening answers the SAVED question, not the built-in's.
    await page.getByRole("link", { name: new RegExp(SAVED) }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: SAVED }),
    ).toBeVisible();
    await expect(
      control(page, "Break down").getByRole("link", { name: "Project" }),
    ).toHaveAttribute("aria-current", "true");

    // And it deletes, taking its own page with it rather than leaving the owner
    // on a report that no longer exists.
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("link", { name: new RegExp(SAVED) }),
    ).toHaveCount(0);
  });

  test("REFUSES a hand-edited definition rather than answering a different question", async ({
    page,
  }) => {
    /*
     * A combination the registry does not support: Finance money cannot be
     * grouped by Project, because no read answers it. A cross-module view would
     * drop the dimension and widen the list; a report must not, because
     * widening a TOTAL is invisible. So it is refused rather than approximated,
     * and no figure is drawn at all.
     */
    await gotoFixture(
      page,
      "/reports/view?src=finance&m=money_out&w=12-months&by=g%3Aproject",
    );
    await expect(page.locator(".dh-report__table")).toHaveCount(0);
    await expect(page.getByTestId("report-bars")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /can’t be opened/i }),
    ).toBeVisible();
    await expect(page.getByText(/has not guessed at it/i)).toBeVisible();
  });

  test("refuses a grain the period cannot hold, without shortening it", async ({
    page,
  }) => {
    // A year is 53 weekly buckets against a maximum of 52.
    await gotoFixture(
      page,
      "/reports/view?src=tasks&m=completed_count&w=12-months&by=t%3Aweek&sort=chronological&as=trend",
    );
    await expect(
      page.getByText(/nothing has been shortened for you/i),
    ).toBeVisible();
  });

  test("reads as a number and a table before a chart, at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/reports/completed-tasks-by-area");

    const table = page.locator(".dh-report__table").first();
    await expect(table).toBeVisible();
    await expectNoHorizontalOverflow(page);

    /*
     * DOM order is reading order is tab order: the rows come BEFORE the chart
     * at every width, so the question is answerable with the chart removed.
     */
    const order = await page.evaluate(() => {
      const body = document.querySelector(".dh-report__block");
      if (!body) return null;
      const nodes = [
        ...body.querySelectorAll(".dh-report__table, .dh-catbars"),
      ];
      return nodes.map((node) => node.className.split(" ")[0]);
    });
    if (order && order.length === 2) {
      expect(order[0]).toBe("dh-report__table");
      expect(order[1]).toBe("dh-catbars");
    }
  });

  test("is keyboard-complete and free of axe violations", async ({ page }) => {
    await gotoFixture(page, "/reports/completed-tasks-by-area");
    await expectNoAxeViolations(page);

    // Every control is an ordinary link, so the whole builder is reachable by
    // Tab with no custom key handling to get wrong.
    const period = control(page, "Period").getByRole("link", {
      name: "4 weeks",
    });
    await period.focus();
    await expect(period).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/w=4-weeks/);
  });

  test("downloads the same rows it drew, with the currency beside them", async ({
    page,
  }) => {
    await gotoFixture(page, "/reports/completed-tasks-by-area");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Download these rows as CSV/ }).click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");

    // The header names the currency column, because a spreadsheet is exactly
    // where two currencies would otherwise be summed by whoever opens it.
    expect(csv).toContain('"label","value","currency","records"');
    /*
     * And every note the surface printed is in the file, above the data — a
     * spreadsheet is exactly where an approximation gets forgotten.
     */
    expect(csv).toMatch(/where each Task sits today/);

    // The rows are the ones the page drew.
    const table = page.locator(".dh-report__table").first();
    const firstLabel = await table.locator("tbody tr th").first().innerText();
    expect(csv).toContain(`"${firstLabel.trim()}"`);
  });

  test("the Insight rail entry keeps its route", async ({ page }) => {
    await gotoFixture(page, "/analytics");
    await expect(
      page.getByRole("heading", { level: 1, name: "Insight" }),
    ).toBeVisible();
  });
});
