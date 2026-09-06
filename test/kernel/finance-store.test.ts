/**
 * V2.12 FIN-00 — the Finance store, against real D1.
 *
 * Real Workers runtime, real isolated D1, the real committed migrations. This
 * file proves the properties the release rests on, and every one of them is a
 * property a reviewer should be able to check by reading the assertion:
 *
 *   - a balance is DERIVED, and nothing anywhere stores one;
 *   - liabilities subtract because their balances are negative, with no
 *     per-type rule;
 *   - a transfer is excluded from spend by construction, so a credit-card
 *     payment is never a second thousand dollars of spending;
 *   - the entity types are RESERVED, so a bare `create` cannot make an account
 *     with no currency;
 *   - a category in use cannot be deleted, and nothing is orphaned in either
 *     branch;
 *   - unlike currencies are never summed.
 *
 * **Every fixture here is synthetic.** `Bank of Synthetica`, `NORTHWIND
 * GROCERS`, `SYNTH CAFE 001`. No real owner financial data exists in this
 * repository, and DEBT-198 is why.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ReservedEntityTypeError } from "~/kernel/entities";
import {
  FINANCE_STARTER_CATEGORIES,
  FinanceRefusedError,
  FinanceValidationError,
  monthDirectionTotals,
  totalMoney,
} from "~/kernel/finance";

import {
  FakeClock,
  countFinanceTransactionRows,
  deriveAccountBalance,
  makeContext,
  makeFinanceRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_finance_other";

function finance(ws = WS, prefix = "f") {
  return makeFinanceRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

/** An everyday account in AUD, opened at zero. */
async function everydayAccount(repo = finance()) {
  return repo.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingDate: "2026-09-01",
    institution: "Bank of Synthetica",
  });
}

describe("the account", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("stores the account's identity, and refuses a credential-shaped field by not having one", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);

    expect(account.title).toBe("Everyday");
    expect(account.accountType).toBe("transaction");
    expect(account.currencyCode).toBe("AUD");
    expect(account.openingBalanceMinor).toBe(0);
    expect(account.institution).toBe("Bank of Synthetica");
    expect(account.status).toBe("open");

    // The account model has no field a bank credential could live in. This is
    // the type asserting it, and `finance-boundaries.test.ts` asserts the same
    // thing over the schema.
    expect(Object.keys(account).sort()).toEqual([
      "accountType",
      "archivedAt",
      "createdAt",
      "currencyCode",
      "deletedAt",
      "id",
      "importMappingJson",
      "institution",
      "openingBalanceMinor",
      "openingDate",
      "status",
      "title",
      "updatedAt",
      "workspaceId",
    ]);
  });

  it("seeds the twelve starter categories with the FIRST account, and never again", async () => {
    const repo = finance();
    await everydayAccount(repo);

    const first = await repo.listCategories();
    expect(first).toHaveLength(FINANCE_STARTER_CATEGORIES.length);
    expect(first.map((category) => category.name)).toContain("Groceries");
    expect(first.every((category) => category.isBuiltin)).toBe(true);

    await repo.createAccount({
      title: "Savings",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    const second = await repo.listCategories();
    expect(second).toHaveLength(FINANCE_STARTER_CATEGORIES.length);
  });

  it("does not re-seed when the only account is deleted and another is made", async () => {
    /*
     * The regression. Deleting an account is ALLOWED while it holds no
     * transactions, so a workspace can legitimately return to zero accounts —
     * and it used to become "the first account" again, which re-ran the seed and
     * collided every one of the twelve with itself on
     * `finance_categories (workspace_id, name_key)`. The batch rolled back, so
     * the SECOND ACCOUNT COULD NOT BE CREATED AT ALL, and the owner was told
     * only "that could not be saved just now" — because a unique-constraint
     * failure is not a named domain refusal.
     *
     * Found by the E2E suite, which creates and sweeps accounts across specs.
     * The condition now asks about categories, which is what the invariant is
     * actually about.
     */
    const repo = finance();
    const first = await everydayAccount(repo);
    await repo.deleteAccount(first.id);

    const again = await repo.createAccount({
      title: "Everyday again",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    expect(again.title).toBe("Everyday again");

    // Still twelve, not twenty-four, and not zero.
    const categories = await repo.listCategories();
    expect(categories).toHaveLength(FINANCE_STARTER_CATEGORIES.length);
  });

  it("does not restore starter categories the owner deleted", async () => {
    /*
     * The other half of asking the right question. A workspace that HAS a
     * vocabulary is never re-seeded, whatever that vocabulary is — so an owner
     * who threw away eleven of the twelve does not find them back the next time
     * they add an account.
     */
    const repo = finance();
    const first = await everydayAccount(repo);
    const categories = await repo.listCategories();
    for (const category of categories.slice(1)) {
      await repo.deleteCategory(category.id);
    }
    expect(await repo.listCategories()).toHaveLength(1);

    await repo.deleteAccount(first.id);
    await repo.createAccount({
      title: "Second",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    expect(await repo.listCategories()).toHaveLength(1);
  });

  it("never nets money OUT against money IN in the uncategorised bucket", async () => {
    /*
     * The regression, found by the E2E suite reading the Finance home.
     *
     * Netting inside a CATEGORY is the refund model and is meaningful: a refund
     * in Groceries makes the month's Groceries smaller, because those rows are
     * about the same thing. Netting across the UNCATEGORISED bucket is not,
     * because those rows have nothing in common but the absence of a category —
     * and it produced a sentence that lied: a $3,200.00 salary and $279.10 of
     * purchases, none categorised, reported as "$2,920.90 with no category",
     * which reads as unexplained SPENDING of $2,920.90.
     */
    const repo = finance();
    const account = await everydayAccount(repo);
    for (const [amount, payee] of [
      ["-84.20", "NORTHWIND GROCERS"],
      ["-12.50", "SYNTH CAFE 001"],
      ["-182.40", "SYNTHETIC ENERGY CO"],
      ["3200.00", "SALARY SYNTHETIC HOLDINGS"],
    ] as const) {
      await repo.createTransaction({
        accountId: account.id,
        occurredOn: "2026-09-04",
        amount,
        payeeDisplay: payee,
      });
    }

    const totals = monthDirectionTotals(await repo.monthSummary("2026-09"));

    // Nothing is categorised, so both CATEGORY totals are empty …
    expect(totals.out).toEqual([]);
    expect(totals.in).toEqual([]);

    // … and the unattributed money is reported in BOTH directions, separately.
    expect(totals.uncategorisedOut).toEqual([
      { currencyCode: "AUD", minorUnits: 27_910, count: 3 },
    ]);
    expect(totals.uncategorisedIn).toEqual([
      { currencyCode: "AUD", minorUnits: 320_000, count: 1 },
    ]);

    // The count is still the whole bucket, not one of its halves.
    expect((await repo.monthSummary("2026-09")).uncategorisedCount).toBe(4);
  });

  it("refuses a bare entity create for a Finance type", async () => {
    const entities = makeRepository(makeContext(WS));
    await expect(
      entities.create({ type: "finance_account", title: "Sneaky" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
    await expect(
      entities.create({ type: "finance_transaction", title: "Sneaky" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
  });

  it("refuses an account with no currency, and one with an impossible date", async () => {
    const repo = finance();
    await expect(
      repo.createAccount({
        title: "No currency",
        accountType: "cash",
        currencyCode: "",
        openingDate: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
    await expect(
      repo.createAccount({
        title: "Impossible",
        accountType: "cash",
        currencyCode: "AUD",
        openingDate: "2026-02-30",
      }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
  });
});

describe("the balance is derived, and there is nothing to store", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("is the opening balance plus the transactions, and matches an independent re-derivation", async () => {
    const repo = finance();
    const account = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
      openingBalance: "1000.00",
    });

    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-120.50",
      payeeDisplay: "NORTHWIND GROCERS",
    });
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-04",
      amount: "2500.00",
      payeeDisplay: "SYNTHETIC PAYROLL",
    });

    const [withBalance] = await repo.listAccountsWithBalances();
    expect(withBalance!.balanceMinor).toBe(100_000 - 12_050 + 250_000);
    expect(withBalance!.transactionCount).toBe(2);

    // Two independent computations of one definition.
    expect(await deriveAccountBalance(WS, account.id)).toBe(
      withBalance!.balanceMinor,
    );
  });

  it("moves when a transaction is deleted, and moves back when it is restored", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const spent = await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-40.00",
      payeeDisplay: "SYNTH CAFE 001",
    });

    const before = (await repo.listAccountsWithBalances())[0]!.balanceMinor;
    expect(before).toBe(-4000);

    await repo.deleteTransaction(spent.id);
    expect((await repo.listAccountsWithBalances())[0]!.balanceMinor).toBe(0);

    await repo.restoreTransaction(spent.id);
    expect((await repo.listAccountsWithBalances())[0]!.balanceMinor).toBe(
      -4000,
    );
  });

  it("gives a credit card a NEGATIVE balance, with no per-type rule anywhere", async () => {
    const repo = finance();
    const card = await repo.createAccount({
      title: "Synthetica Rewards Card",
      accountType: "credit_card",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    await repo.createTransaction({
      accountId: card.id,
      occurredOn: "2026-09-05",
      amount: "-1000.00",
      payeeDisplay: "NORTHWIND GROCERS",
    });

    const [withBalance] = await repo.listAccountsWithBalances();
    expect(withBalance!.balanceMinor).toBe(-100_000);
  });
});

describe("categories cannot orphan a transaction", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("refuses to delete a category in use, and names the count", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-50.00",
      payeeDisplay: "NORTHWIND GROCERS",
      categoryId: groceries.id,
    });

    await expect(repo.deleteCategory(groceries.id)).rejects.toThrow(
      /1 transaction uses that category/,
    );
    await expect(repo.deleteCategory(groceries.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );
    // Nothing was orphaned by the refusal.
    expect(await countFinanceTransactionRows()).toBe(1);
  });

  it("archives a category in use, keeping every transaction that carries it", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const dining = (await repo.listCategories()).find(
      (category) => category.name === "Dining",
    )!;
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-22.00",
      payeeDisplay: "SYNTH CAFE 001",
      categoryId: dining.id,
    });

    const archived = await repo.setCategoryArchived(dining.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect((await repo.listCategories()).map((c) => c.id)).not.toContain(
      dining.id,
    );

    const page = await repo.listTransactions();
    expect(page.items[0]!.transaction.categoryId).toBe(dining.id);
    expect(page.items[0]!.categoryArchived).toBe(true);
  });

  it("renames a category without rewriting one transaction", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const dining = (await repo.listCategories()).find(
      (category) => category.name === "Dining",
    )!;
    const transaction = await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-22.00",
      payeeDisplay: "SYNTH CAFE 001",
      categoryId: dining.id,
    });

    await repo.updateCategory(dining.id, { name: "Eating out" });
    const after = await repo.getTransaction(transaction.id);
    // The IDENTITY is unchanged; only the display text moved.
    expect(after!.transaction.categoryId).toBe(dining.id);
    expect(after!.categoryName).toBe("Eating out");
  });

  it("deletes an unused category", async () => {
    const repo = finance();
    await everydayAccount(repo);
    const created = await repo.createCategory({
      name: "Boat maintenance",
      kind: "spending",
    });
    await repo.deleteCategory(created.id);
    expect(
      (await repo.listCategories({ includeArchived: true })).map((c) => c.id),
    ).not.toContain(created.id);
  });

  it("refuses a second category with the same folded name", async () => {
    const repo = finance();
    await everydayAccount(repo);
    await expect(
      repo.createCategory({ name: "  groceries ", kind: "spending" }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
  });
});

describe("an account with history is closed, never deleted", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("refuses to delete an account that holds a transaction", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-10.00",
      payeeDisplay: "SYNTH CAFE 001",
    });
    await expect(repo.deleteAccount(account.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );
  });

  it("refuses to delete one whose only transaction is DELETED, because the row still names it", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const transaction = await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-10.00",
      payeeDisplay: "SYNTH CAFE 001",
    });
    await repo.deleteTransaction(transaction.id);
    await expect(repo.deleteAccount(account.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );
  });

  it("deletes an account with no history at all", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    await repo.deleteAccount(account.id);
    expect(await repo.getAccount(account.id)).toBeNull();
  });

  it("keeps a CLOSED account's balance in the arithmetic", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-15.00",
      payeeDisplay: "SYNTH CAFE 001",
    });
    await repo.updateAccount(account.id, { status: "closed" });

    const all = await repo.listAccountsWithBalances({ includeClosed: true });
    expect(all).toHaveLength(1);
    expect(all[0]!.balanceMinor).toBe(-1500);

    const openOnly = await repo.listAccountsWithBalances({
      includeClosed: false,
    });
    expect(openOnly).toHaveLength(0);
  });
});

describe("transfers cannot inflate spending", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("excludes both legs from the month, so paying a card is not a second thousand dollars", async () => {
    const repo = finance();
    const everyday = await everydayAccount(repo);
    const card = await repo.createAccount({
      title: "Synthetica Rewards Card",
      accountType: "credit_card",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;

    // The groceries are bought ON THE CARD. That is the spending.
    await repo.createTransaction({
      accountId: card.id,
      occurredOn: "2026-09-05",
      amount: "-1000.00",
      payeeDisplay: "NORTHWIND GROCERS",
      categoryId: groceries.id,
    });
    // The card is then paid FROM the everyday account. That is not spending.
    const out = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-20",
      amount: "-1000.00",
      payeeDisplay: "CARD PAYMENT",
    });
    const back = await repo.createTransaction({
      accountId: card.id,
      occurredOn: "2026-09-20",
      amount: "1000.00",
      payeeDisplay: "PAYMENT RECEIVED",
    });
    await repo.linkTransfer(out.id, back.id);

    const summary = await repo.monthSummary("2026-09");
    const totals = monthDirectionTotals(summary);
    expect(totals.out).toEqual([
      { currencyCode: "AUD", minorUnits: 100_000, count: 1 },
    ]);
    expect(totals.in).toEqual([]);
    expect(summary.transferCount).toBe(2);

    /*
     * And the legs are out of the month ENTIRELY, not merely out of the
     * categorised totals.
     *
     * This half was added after a falsification: removing
     * `transfer_group_id IS NULL` from the grouped statement left every
     * assertion above green, because the legs are UNCATEGORISED and therefore
     * landed in the uncategorised bucket rather than in `out`/`in`. The month
     * would have read "2 transactions have no category yet — $1,000.00 out and
     * $1,000.00 in", which is the double count this whole design exists to
     * prevent, wearing a different label.
     */
    expect(totals.uncategorisedOut).toEqual([]);
    expect(totals.uncategorisedIn).toEqual([]);
    expect(summary.uncategorisedCount).toBe(0);
    expect(
      summary.categories.every((entry) => entry.transactionCount === 1),
    ).toBe(true);
    // And the balances are still coherent: the card is back to zero and the
    // everyday account is a thousand dollars down.
    const balances = await repo.listAccountsWithBalances();
    const byId = new Map(balances.map((b) => [b.account.id, b.balanceMinor]));
    expect(byId.get(card.id)).toBe(0);
    expect(byId.get(everyday.id)).toBe(-100_000);
  });

  it("refuses a pair in one account, a pair with the same sign, and a leg already paired", async () => {
    const repo = finance();
    const everyday = await everydayAccount(repo);
    const savings = await repo.createAccount({
      title: "Savings",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });

    const outA = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-10",
      amount: "-200.00",
      payeeDisplay: "TO SAVINGS",
    });
    const outB = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-10",
      amount: "-200.00",
      payeeDisplay: "ALSO OUT",
    });
    const inA = await repo.createTransaction({
      accountId: savings.id,
      occurredOn: "2026-09-10",
      amount: "200.00",
      payeeDisplay: "FROM EVERYDAY",
    });

    await expect(repo.linkTransfer(outA.id, outA.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );
    await expect(repo.linkTransfer(outA.id, outB.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );

    await repo.linkTransfer(outA.id, inA.id);
    await expect(repo.linkTransfer(outA.id, inA.id)).rejects.toBeInstanceOf(
      FinanceRefusedError,
    );
  });

  it("suggests the exactly-opposite unpaired leg in another account, and nothing else", async () => {
    const repo = finance();
    const everyday = await everydayAccount(repo);
    const savings = await repo.createAccount({
      title: "Savings",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });

    const out = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-10",
      amount: "-200.00",
      payeeDisplay: "TO SAVINGS",
    });
    const exact = await repo.createTransaction({
      accountId: savings.id,
      occurredOn: "2026-09-11",
      amount: "200.00",
      payeeDisplay: "FROM EVERYDAY",
    });
    // Same amount, but far outside the window.
    await repo.createTransaction({
      accountId: savings.id,
      occurredOn: "2026-09-25",
      amount: "200.00",
      payeeDisplay: "SOMETHING ELSE",
    });
    // The right shape, but in the SAME account.
    await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-10",
      amount: "200.00",
      payeeDisplay: "A REFUND",
    });

    const candidates = await repo.suggestTransferPartners(out.id);
    expect(candidates.map((candidate) => candidate.transactionId)).toEqual([
      exact.id,
    ]);
  });

  it("unlinks both legs at once", async () => {
    const repo = finance();
    const everyday = await everydayAccount(repo);
    const savings = await repo.createAccount({
      title: "Savings",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    const out = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-10",
      amount: "-200.00",
      payeeDisplay: "TO SAVINGS",
    });
    const back = await repo.createTransaction({
      accountId: savings.id,
      occurredOn: "2026-09-10",
      amount: "200.00",
      payeeDisplay: "FROM EVERYDAY",
    });
    await repo.linkTransfer(out.id, back.id);
    await repo.unlinkTransfer(out.id);

    expect(
      (await repo.getTransaction(out.id))!.transaction.transferGroupId,
    ).toBeNull();
    expect(
      (await repo.getTransaction(back.id))!.transaction.transferGroupId,
    ).toBeNull();
  });
});

describe("the month, and refunds", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("counts a refund in a spending category as LESS spend, never as income", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;

    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-200.00",
      payeeDisplay: "NORTHWIND GROCERS",
      categoryId: groceries.id,
    });
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-06",
      amount: "50.00",
      payeeDisplay: "NORTHWIND GROCERS REFUND",
      categoryId: groceries.id,
    });

    const totals = monthDirectionTotals(await repo.monthSummary("2026-09"));
    expect(totals.out).toEqual([
      { currencyCode: "AUD", minorUnits: 15_000, count: 2 },
    ]);
    expect(totals.in).toEqual([]);
  });

  it("reports uncategorised separately, folding it into NEITHER total", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-80.00",
      payeeDisplay: "SOMETHING UNKNOWN",
    });

    const summary = await repo.monthSummary("2026-09");
    const totals = monthDirectionTotals(summary);
    expect(totals.out).toEqual([]);
    expect(totals.in).toEqual([]);
    expect(totals.uncategorisedOut).toEqual([
      { currencyCode: "AUD", minorUnits: 8000, count: 1 },
    ]);
    expect(summary.uncategorisedCount).toBe(1);
    expect(await repo.countUncategorised()).toBe(1);
  });

  it("keeps unlike currencies apart rather than adding them", async () => {
    const repo = finance();
    const aud = await everydayAccount(repo);
    const nzd = await repo.createAccount({
      title: "Synthetica NZ",
      accountType: "transaction",
      currencyCode: "NZD",
      openingDate: "2026-09-01",
    });
    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;

    await repo.createTransaction({
      accountId: aud.id,
      occurredOn: "2026-09-03",
      amount: "-100.00",
      payeeDisplay: "NORTHWIND GROCERS",
      categoryId: groceries.id,
    });
    await repo.createTransaction({
      accountId: nzd.id,
      occurredOn: "2026-09-04",
      amount: "-180.00",
      payeeDisplay: "NORTHWIND GROCERS NZ",
      categoryId: groceries.id,
    });

    const totals = monthDirectionTotals(await repo.monthSummary("2026-09"));
    expect(totals.out).toEqual([
      { currencyCode: "AUD", minorUnits: 10_000, count: 1 },
      { currencyCode: "NZD", minorUnits: 18_000, count: 1 },
    ]);
    // And nothing anywhere produces one number across the two.
    const combined = totalMoney(
      totals.out.map((entry) => ({
        minorUnits: entry.minorUnits,
        currencyCode: entry.currencyCode,
      })),
    );
    expect(combined.mixed).toBe(true);
    expect(combined.totals).toHaveLength(2);
  });

  it("cuts the month by the transaction date, at both boundaries", async () => {
    const repo = finance();
    const account = await everydayAccount(repo);
    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;
    for (const date of [
      "2026-08-31",
      "2026-09-01",
      "2026-09-30",
      "2026-10-01",
    ]) {
      await repo.createTransaction({
        accountId: account.id,
        occurredOn: date,
        amount: "-10.00",
        payeeDisplay: "NORTHWIND GROCERS",
        categoryId: groceries.id,
      });
    }
    const totals = monthDirectionTotals(await repo.monthSummary("2026-09"));
    expect(totals.out).toEqual([
      { currencyCode: "AUD", minorUnits: 2000, count: 2 },
    ]);
  });
});

describe("a transaction's currency follows its account", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("stores the account's currency, so an aggregate reads one table", async () => {
    const repo = finance();
    const nzd = await repo.createAccount({
      title: "Synthetica NZ",
      accountType: "transaction",
      currencyCode: "NZD",
      openingDate: "2026-09-01",
    });
    const transaction = await repo.createTransaction({
      accountId: nzd.id,
      occurredOn: "2026-09-03",
      amount: "-12.34",
      payeeDisplay: "SYNTH CAFE 001",
    });
    expect(transaction.currencyCode).toBe("NZD");
  });
});
