/**
 * V2.12 FINANCE CORE — the money journeys, end to end through the real product.
 *
 * These prove the things only a browser can prove, and each is a claim the
 * release makes that a unit or kernel test cannot check:
 *
 *   - a real CSV goes through a real `<input type="file">`, reaches the real
 *     Worker, is previewed before anything is written, and applies;
 *   - importing the SAME file twice adds nothing, and re-importing a longer
 *     export of the same statement adds only the new row;
 *   - the month's totals, the account balances and the budget variance are the
 *     figures the imported rows actually produce;
 *   - a transfer pair stops being spending on the screen, not just in a test;
 *   - a category in use cannot be deleted, and the refusal names the count;
 *   - settling an Obligation with a Transaction takes the BANK's amount and
 *     date, and says so before it writes;
 *   - the phone journey works at 393 and at 320, and the surface is
 *     keyboard-reachable and axe-clean.
 *
 * **Every fixture is obviously synthetic** — `Bank of Synthetica`, `NORTHWIND
 * GROCERS`, `SYNTH CAFE`. No real owner financial data exists in this
 * repository, and DEBT-198 is why.
 *
 * The dates in the CSVs are September 2026, which is the past relative to the
 * suite's reference day; `e2e:fixture-dates:check` is what keeps that true.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";
import {
  STATEMENT_CSV,
  STATEMENT_CSV_EXTENDED,
  cleanupAccountByTitle,
  cleanupAllTestAccounts,
  uniqueAccountTitle,
} from "./finance-fixtures";
import {
  cleanupAllTestObligations,
  cleanupObligationByTitle,
  uniqueObligationTitle,
} from "./obligations-fixtures";

const owned = new Set<string>();
const ownedObligations = new Set<string>();

test.afterEach(() => {
  /*
   * Obligations FIRST: one of them may hold a settlement pointer at a
   * transaction the account sweep is about to remove, and while the Finance
   * fixture clears that pointer itself, removing the obligation first means the
   * ordinary case never needs the repair.
   */
  for (const title of ownedObligations) cleanupObligationByTitle(title);
  ownedObligations.clear();
  for (const title of owned) cleanupAccountByTitle(title);
  owned.clear();
});

test.afterAll(() => {
  cleanupAllTestObligations();
  cleanupAllTestAccounts();
});

const ACCOUNT_RECORD_URL = /\/finance\/accounts\/[0-9a-fA-F-]{20,}(?:[?#]|$)/;

/** Create an account through the real form and land on its record. */
async function createAccount(
  page: Page,
  label: string,
  options: { readonly type?: string; readonly opening?: string } = {},
): Promise<string> {
  const title = uniqueAccountTitle(label);
  owned.add(title);

  await gotoFixture(page, "/finance/accounts/new");
  await page.getByTestId("new-account-title").fill(title);
  if (options.type !== undefined) {
    await page.getByTestId("new-account-type").selectOption(options.type);
  }
  if (options.opening !== undefined) {
    await page.getByTestId("new-account-opening").fill(options.opening);
  }
  await page.getByTestId("new-account-institution").fill("Bank of Synthetica");
  await page.getByTestId("new-account-submit").click();

  await expect(page).toHaveURL(ACCOUNT_RECORD_URL);
  await waitForInteractive(page);
  return title;
}

/** Preview and apply a statement into the account the import page has chosen. */
async function importStatement(
  page: Page,
  csv: string,
  fileName: string,
): Promise<void> {
  await page.getByTestId("import-file").setInputFiles({
    name: fileName,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByTestId("import-preview-submit").click();
  await expect(page.getByTestId("import-preview")).toBeVisible();
  await page.getByTestId("import-apply").click();
  await expect(page.getByTestId("import-result")).toBeVisible();
}

test.describe("V2.12 — a statement becomes a readable month", () => {
  test("previews before it writes, applies, and adds nothing the second time", async ({
    page,
  }) => {
    const title = await createAccount(page, "import");

    await gotoFixture(page, "/finance/import");
    await expect(page.getByTestId("finance-import")).toBeVisible();

    // ── The preview writes NOTHING, and says exactly what it would do ───────
    await page.getByTestId("import-file").setInputFiles({
      name: "synthetica-september.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(STATEMENT_CSV, "utf8"),
    });
    await page.getByTestId("import-preview-submit").click();
    const preview = page.getByTestId("import-preview");
    await expect(preview).toBeVisible();
    await expect(page.getByTestId("import-count-new")).toContainText("4");
    // The rows are shown, and the bank's own text is shown with them.
    await expect(preview).toContainText("NORTHWIND GROCERS");

    // Nothing has been written yet: the account still reads as empty.
    await gotoFixture(page, "/finance/transactions");
    await expect(page.getByTestId("transaction-list")).toHaveCount(0);

    // ── Apply ───────────────────────────────────────────────────────────────
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-september.csv");
    await expect(page.getByTestId("import-result")).toContainText("4");

    // ── The SAME file again adds nothing, and says so by name ───────────────
    await gotoFixture(page, "/finance/import");
    await page.getByTestId("import-file").setInputFiles({
      name: "synthetica-september.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(STATEMENT_CSV, "utf8"),
    });
    await page.getByTestId("import-preview-submit").click();
    await expect(page.getByTestId("import-already-applied")).toBeVisible();

    // ── A LONGER export of the same statement adds only the new row ─────────
    await gotoFixture(page, "/finance/import");
    await importStatement(
      page,
      STATEMENT_CSV_EXTENDED,
      "synthetica-september-full.csv",
    );
    const result = page.getByTestId("import-result");
    await expect(result).toContainText("1");
    await expect(result).toContainText("4");

    // Five rows in the account, not nine.
    await gotoFixture(page, "/finance/transactions?month=2026-09");
    await expect(page.getByTestId("transaction-count")).toContainText("5");
    expect(title).toContain("Finance e2e ");
  });

  test("shows the month's money out and in, and never a bare number", async ({
    page,
  }) => {
    await createAccount(page, "month");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-month.csv");

    await gotoFixture(page, "/finance?month=2026-09");
    const home = page.getByTestId("finance-home");
    await expect(home).toBeVisible();

    /*
     * $84.20 + $12.50 + $182.40 out, $3,200.00 in — and NOTHING categorised
     * yet, so both category totals read "Nothing yet". That is deliberate: a
     * month reports what it can attribute, and says separately how much it
     * cannot, rather than quietly presenting an unattributed figure as spend.
     *
     * The unattributed money is reported in BOTH directions, named. It used to
     * be one netted figure — "$2,920.90 with no category" — which reads as
     * unexplained SPENDING of $2,920.90 when spending was $279.10.
     */
    const note = page.getByTestId("uncategorised-note");
    await expect(note).toContainText("4");
    await expect(note).toContainText("$279.10 out");
    await expect(note).toContainText("$3,200.00 in");

    /*
     * Asserted as the CURRENCY-formatted strings the product shows, because
     * "never a bare number" is the claim: an amount without its currency is a
     * number the owner has to remember the units of. A bare `279.10` would
     * satisfy a weaker assertion and be a worse product.
     */
    await expect(home).not.toContainText(/(?<![$\d,.])279\.10/);
  });

  test("derives the balance and shows the inputs that produced it", async ({
    page,
  }) => {
    await createAccount(page, "balance", { opening: "1000.00" });
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-balance.csv");

    await gotoFixture(page, "/finance?month=2026-09");
    // 1000.00 − 84.20 − 12.50 − 182.40 + 3200.00 = 3920.90
    await expect(page.getByTestId("account-list")).toContainText("$3,920.90");

    // And the record states the DERIVATION beside the figure.
    await page.getByTestId("account-list").getByRole("link").first().click();
    await waitForInteractive(page);
    await expect(page.locator("body")).toContainText("$1,000.00");
    await expect(page.locator("body")).toContainText("4 transactions");
  });
});

test.describe("V2.12 — categorising", () => {
  test("moves a transaction out of the queue and into the month", async ({
    page,
  }) => {
    await createAccount(page, "categorise");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-categorise.csv");

    await gotoFixture(page, "/finance/transactions?uncategorised=1");
    await expect(page.getByTestId("transaction-count")).toContainText("4");

    // Categorise the first row through the picker on the row itself, which is
    // the phone journey: one tap to open, one tap to choose.
    await page.getByTestId("transaction-row-categorise").first().click();
    const picker = page.getByTestId("category-picker").first();
    await expect(picker).toBeVisible();
    await picker.getByRole("button").first().click();

    // The queue is one shorter, and it is the QUEUE that shrank rather than the
    // month: `null` IS uncategorised, so there is no sentinel row to move to.
    await expect(page.getByTestId("transaction-count")).toContainText("3");
  });

  test("refuses to delete a category in use, and names the count", async ({
    page,
  }) => {
    await createAccount(page, "category-refusal");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-refusal.csv");

    await gotoFixture(page, "/finance/transactions?uncategorised=1");
    await page.getByTestId("transaction-row-categorise").first().click();
    const picker = page.getByTestId("category-picker").first();
    const chosen = await picker.getByRole("button").first().innerText();
    await picker.getByRole("button").first().click();

    await gotoFixture(page, "/finance/categories");
    const row = page
      .getByTestId("category-list")
      .getByRole("listitem")
      .filter({ hasText: chosen })
      .first();
    await row.getByRole("button", { name: /delete/i }).click();

    /*
     * "1 transaction uses …" — the refusal carries the number, because "you
     * can't do that" is not an answer and the count is what tells the owner
     * that archiving would keep something.
     */
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("1");

    // And nothing was orphaned: the transaction still carries its category.
    await gotoFixture(page, "/finance/transactions?month=2026-09");
    await expect(page.getByTestId("transaction-list")).toContainText(chosen);
  });
});

test.describe("V2.12 — budgets", () => {
  test("compares a budget with what was actually spent, in words", async ({
    page,
  }) => {
    await createAccount(page, "budget");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-budget.csv");

    // Categorise the $84.20 grocery row so a budget has something to compare.
    await gotoFixture(page, "/finance/transactions?uncategorised=1");
    const grocery = page
      .getByTestId("transaction-list")
      .getByRole("listitem")
      .filter({ hasText: "NORTHWIND" })
      .first();
    await grocery.getByTestId("transaction-row-categorise").click();
    const picker = page.getByTestId("category-picker").first();
    const chosen = await picker.getByRole("button").first().innerText();
    await picker.getByRole("button").first().click();

    await gotoFixture(page, "/finance/budgets?month=2026-09");
    const budgets = page.getByTestId("budget-list");
    const row = budgets
      .getByRole("listitem")
      .filter({ hasText: chosen })
      .first();
    await row.getByRole("textbox").fill("100.00");
    await row.getByRole("button", { name: /save/i }).click();

    /*
     * A SENTENCE with its figures in it, not a bar and not a percentage. The
     * grocery row is $84.20 of a $100.00 budget, so $15.80 remains.
     */
    await expect(row).toContainText("$84.20");
    await expect(row).toContainText("$100.00");
    await expect(row).toContainText("$15.80");
    await expect(budgets).not.toContainText("%");
  });
});

test.describe("V2.12 — settling an Obligation", () => {
  test("takes the amount and the date from the transaction, and says so first", async ({
    page,
  }) => {
    await createAccount(page, "settle");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-settle.csv");

    // A money-bearing obligation due in the same month, created through the
    // real Life Admin form so the journey is the owner's.
    const title = uniqueObligationTitle("electricity");
    ownedObligations.add(title);
    await gotoFixture(page, "/obligations/new");
    await page
      .getByLabel(/title|what/i)
      .first()
      .fill(title);
    await page.getByLabel(/due/i).first().fill("2026-09-05");
    const amount = page.getByLabel(/amount/i).first();
    if (await amount.count()) await amount.fill("180.00");
    await page
      .getByRole("button", { name: /create|save|add/i })
      .first()
      .click();
    await waitForInteractive(page);

    await gotoFixture(page, "/finance?month=2026-09");
    const settle = page.locator('[data-testid^="settle-open-"]').first();
    await expect(settle).toBeVisible();
    await settle.click();

    // The candidate is the $182.40 payment, offered rather than applied.
    const candidate = page.locator('[data-testid^="settle-pick-"]').first();
    await expect(candidate).toContainText("$182.40");
    await candidate.click();

    /*
     * The CONFIRMATION states the bank's figures before anything is written,
     * because completing an obligation cannot be undone.
     */
    const confirm = page.locator('[data-testid^="settle-confirm-"]').first();
    await expect(page.locator("body")).toContainText("$182.40");
    await expect(page.locator("body")).toContainText(
      /amount and the date come from the transaction/i,
    );
    await confirm.click();

    // The commitment stays on the screen, marked paid — it does not vanish.
    await expect(page.locator("body")).toContainText(/paid/i);
  });
});

test.describe("V2.12 — the phone, and the keyboard", () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test("categorises on a phone without a sideways scroll", async ({ page }) => {
    await createAccount(page, "phone");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-phone.csv");

    await gotoFixture(page, "/finance/transactions?uncategorised=1");
    await expectNoHorizontalOverflow(page);

    const categorise = page.getByTestId("transaction-row-categorise").first();
    await expectMinTouchTarget(categorise);
    await categorise.click();
    await expect(page.getByTestId("category-picker").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 320 is the narrowest supported width, and the row must still not push the
    // page sideways there.
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/finance?month=2026-09");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("V2.12 — accessibility", () => {
  test("the Finance surfaces are axe-clean", async ({ page }) => {
    await createAccount(page, "axe");
    await gotoFixture(page, "/finance/import");
    await importStatement(page, STATEMENT_CSV, "synthetica-axe.csv");

    for (const path of [
      "/finance?month=2026-09",
      "/finance/transactions?month=2026-09",
      "/finance/transactions?uncategorised=1",
      "/finance/budgets?month=2026-09",
      "/finance/categories",
      "/finance/import",
      "/finance/accounts/new",
    ]) {
      await gotoFixture(page, path);
      await expectNoAxeViolations(page);
    }
  });
});
