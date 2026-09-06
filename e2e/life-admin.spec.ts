/**
 * V2.10 LIFE-02 — the Life Admin journeys, end to end through the real product.
 *
 * The invariants these prove are the ones the whole item exists for:
 *
 *   - an obligation can be created, found, opened and completed with NO Asset
 *     anywhere in the journey — the thing V2.9 could not do at all;
 *   - completing a recurring one produces the next occurrence, and says so;
 *   - the collection's headings count the whole band, not the page;
 *   - an amount never reaches Search, and never reaches a collection row;
 *   - the phone journey works at 390 and at 320.
 */

import { expect, test, type Page } from "@playwright/test";

import { d1Query } from "./d1";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";
import {
  chooseObligationOption,
  cleanupAllTestObligations,
  cleanupObligationByTitle,
  uniqueObligationTitle,
} from "./obligations-fixtures";

/** Every obligation this file created, torn down after each test. */
const owned = new Set<string>();

test.afterEach(() => {
  for (const title of owned) cleanupObligationByTitle(title);
  owned.clear();
});

test.afterAll(() => {
  // A belt-and-braces sweep: a test that failed before its title was registered
  // still leaves nothing behind for the next run to trip over.
  cleanupAllTestObligations();
});

/**
 * An obligation RECORD's URL.
 *
 * Deliberately not `/obligations/[^/]+$`: that also matches `/obligations/new`,
 * so a journey could "arrive" at the record while still on the create page.
 */
const OBLIGATION_RECORD_URL = /\/obligations\/[0-9a-fA-F-]{20,}(?:[?#]|$)/;

/** Open the ONE global search surface, the way an owner does. */
async function openSearch(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .locator(".dh-topbar")
    .getByRole("button", { name: /^Search DalyHub/ })
    .first()
    .click();
  const input = page.getByRole("combobox", { name: "Search everything" });
  await expect(input).toBeVisible();
  return input;
}

/** A date the given number of days from today, as the date input wants it. */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fill the create form and submit it, returning the title used. */
async function createObligation(
  page: Page,
  options: {
    readonly label: string;
    readonly dueInDays: number;
    readonly repeats?: boolean;
    readonly amount?: string;
  },
): Promise<string> {
  const title = uniqueObligationTitle(options.label);
  owned.add(title);

  await gotoFixture(page, "/obligations/new");
  await waitForInteractive(page);

  await page.getByRole("textbox", { name: /^Title/ }).fill(title);
  await page
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoDaysFromNow(options.dueInDays));
  if (options.amount) {
    await page
      .getByRole("textbox", { name: /^Expected amount/ })
      .fill(options.amount);
  }
  if (options.repeats) {
    await chooseObligationOption(page, /^Repeats/, "Every N years", /Repeats/);
  }
  await page.getByRole("button", { name: "Add obligation" }).click();
  await expect(page).toHaveURL(OBLIGATION_RECORD_URL);
  return title;
}

test.describe("Life Admin, with no Asset anywhere in it", () => {
  test("create → appears → search finds it → open → complete → successor", async ({
    page,
  }) => {
    const title = await createObligation(page, {
      label: "rego-free",
      dueInDays: 5,
      repeats: true,
    });

    /*
     * The subject is a FIELD, not a parent — so the record says what it is about
     * in words rather than leaving a gap, and what it says is "nothing".
     */
    await expect(page.getByText("Nothing in particular")).toBeVisible();

    // It appears in the collection, under the band its date puts it in.
    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);
    const thisWeek = page.getByRole("list", { name: "This week obligations" });
    // The row's own link, not "any text matching the title": every action button
    // names its obligation too, which is the point of naming them.
    await expect(
      thisWeek.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();

    // Search finds it by its title, through the surface an owner uses.
    const search = await openSearch(page);
    await search.fill(title);
    await expect(
      page
        .getByRole("listbox")
        .getByRole("option")
        .filter({ hasText: title })
        .first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Open it and record it as done.
    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);
    await page.getByRole("link", { name: `Open ${title}` }).click();
    await expect(page).toHaveURL(OBLIGATION_RECORD_URL);
    await page.getByRole("button", { name: "Record it as done" }).click();
    await page.getByRole("button", { name: "Record and complete" }).click();

    /*
     * The successor. A recurring obligation completed does not simply close: the
     * next occurrence exists, which is what makes "renewal" a durable answer
     * rather than a one-off tick.
     */
    await expect(async () => {
      const rows = d1Query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM obligation_details o
           JOIN entities e ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
          WHERE o.workspace_id = 'local-dev-workspace'
            AND e.title = '${title.replace(/'/g, "''")}'
            AND o.status = 'open'`,
      );
      expect(rows[0]?.n ?? 0).toBe(1);
    }).toPass();
  });

  test("the headings count the whole band, not the page", async ({ page }) => {
    // Seed one of our own, so the band is never empty and the test never has to
    // skip itself into a green that proved nothing.
    await createObligation(page, { label: "banded", dueInDays: 3 });

    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);

    const heading = page
      .getByRole("heading", { level: 2, name: /^This week/ })
      .first();
    await expect(heading).toBeVisible();

    const label = (await heading.textContent()) ?? "";
    const stated = Number(/\((\d+)\)/.exec(label)?.[1] ?? "0");
    const counted = d1Query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM obligation_details
        WHERE workspace_id = 'local-dev-workspace'
          AND status = 'open' AND deleted_at IS NULL
          AND due_date IS NOT NULL
          AND due_date >= date('now') AND due_date <= date('now', '+6 days')`,
    );
    expect(stated).toBe(counted[0]?.n ?? 0);
  });
});

test.describe("what an amount never reaches", () => {
  /*
   * The falsification D11 asks for, as a journey. A price is the most private
   * fact an obligation carries and a result list is the surface most likely to
   * be read over someone's shoulder.
   */
  test("an amount is not searchable and is not on a collection row", async ({
    page,
  }) => {
    const title = await createObligation(page, {
      label: "money",
      dueInDays: 4,
      amount: "1234.56",
    });

    const search = await openSearch(page);
    await search.fill("1234.56");
    // Give the query a chance to resolve before asserting an ABSENCE, so this
    // can never pass because nothing had loaded yet.
    await page.waitForTimeout(1200);
    await expect(
      page.getByRole("option").filter({ hasText: title }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);
    const row = page
      .locator('[data-testid="obligation-row"]')
      .filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("1,234.56");

    // The RECORD does show it — that is where the owner went to look.
    await page.getByRole("link", { name: `Open ${title}` }).click();
    await expect(page.getByText(/Expected .*1,234\.56/)).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the collection and the record fit, and stay reachable", async ({
    page,
  }) => {
    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await gotoFixture(page, "/obligations/ob-rc-tax");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);
    // The one action the record exists for is reachable without scrolling past
    // the fold — it is the first thing under the header.
    await expect(
      page.getByRole("button", { name: "Record it as done" }),
    ).toBeVisible();
  });
});

test.describe("at 320", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("nothing overflows", async ({ page }) => {
    await gotoFixture(page, "/obligations");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);
  });
});
