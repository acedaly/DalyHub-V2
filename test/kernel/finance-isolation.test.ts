/**
 * V2.12 — Finance is workspace-isolated, proved from a HOSTILE second
 * workspace.
 *
 * The repository is bound to one `WorkspaceContext` at construction and no
 * method takes a workspace id, so isolation is structural rather than
 * discretionary. This file proves it anyway, from the other side: a second
 * workspace constructs its OWN repository and tries every read and every action
 * against the first workspace's ids.
 *
 * ## Why this file exists at all
 *
 * It was written after a falsification found the gap. Removing the workspace
 * bound from the grouped monthly statement — the read behind the whole Finance
 * home — left the entire suite green, because no test had ever asked a second
 * workspace what it could see. `finance-store.test.ts` had an `OTHER` workspace
 * constant, and used it only to keep the row alive across resets.
 *
 * ## What "isolated" has to mean here
 *
 * Two properties, and the second is the one that is easy to get wrong:
 *
 *   1. a workspace can never READ or CHANGE another's data; and
 *   2. a refusal must not distinguish "not yours" from "does not exist" — so
 *      every miss below is `null`, `[]`, `false` or `FinanceNotFoundError`, and
 *      NEVER a "forbidden". A workspace that can tell those apart can enumerate
 *      another workspace's ids one guess at a time.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `NORTHWIND GROCERS`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  FinanceNotFoundError,
  monthDirectionTotals,
  validateCsvMapping,
  type CsvMapping,
} from "~/kernel/finance";

import {
  FakeClock,
  makeContext,
  makeFinanceRepository,
  resetTables,
  sequentialIds,
} from "./support";

const MINE = "test-finance-isolation-mine";
const THEIRS = "test-finance-isolation-theirs";

const nextId = sequentialIds("iso");

const MAPPING: CsvMapping = validateCsvMapping({
  v: 1,
  headerRows: 1,
  date: 0,
  dateFormat: "dmy",
  description: 1,
  amount: { kind: "single", column: 2, invert: false },
  sourceId: null,
  balance: null,
});

const CSV = new TextEncoder().encode(
  [
    "Date,Description,Amount",
    "04/09/2026,NORTHWIND GROCERS,-84.20",
    "05/09/2026,SALARY SYNTHETIC HOLDINGS,3200.00",
  ].join("\n"),
);

function repo(workspace: string) {
  return makeFinanceRepository(makeContext(workspace), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

/** A workspace with an account, a category, a budget, an import and rows. */
async function seedMine() {
  const mine = repo(MINE);
  const account = await mine.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingDate: "2026-01-01",
    openingBalance: "1000.00",
    institution: "Bank of Synthetica",
  });
  const categories = await mine.listCategories();
  const groceries = categories.find((c) => c.name === "Groceries")!;

  const preview = await mine.previewImport({
    accountId: account.id,
    fileName: "september.csv",
    bytes: CSV,
    mapping: MAPPING,
  });
  await mine.applyImport({
    accountId: account.id,
    fileName: "september.csv",
    bytes: CSV,
    mapping: MAPPING,
    expectedSha256: preview.fileSha256,
  });

  const page = await mine.listTransactions({ limit: 10 });
  const transaction = page.items[0]!.transaction;
  await mine.updateTransaction(transaction.id, { categoryId: groceries.id });

  const budget = await mine.setBudget({
    categoryId: groceries.id,
    periodMonth: "2026-09",
    amount: "600.00",
    currencyCode: "AUD",
  });
  const imports = await mine.listImports();

  return {
    mine,
    accountId: account.id,
    categoryId: groceries.id,
    transactionId: transaction.id,
    budgetId: budget.id,
    importId: imports[0]!.id,
  };
}

describe("V2.12 — a hostile workspace sees and changes nothing", () => {
  beforeEach(async () => {
    await resetTables([MINE, THEIRS]);
  });

  it("reads nothing of another workspace's, from any collection read", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    // Mine is real, so a green assertion below is isolation rather than an
    // empty database.
    expect(await seeded.mine.listAccountsWithBalances()).toHaveLength(1);
    expect((await seeded.mine.listTransactions()).items).toHaveLength(2);

    expect(
      await theirs.listAccountsWithBalances({ includeClosed: true }),
    ).toEqual([]);
    expect((await theirs.listTransactions()).items).toEqual([]);
    expect((await theirs.listTransactions()).total).toBe(0);
    expect(await theirs.listImports()).toEqual([]);
    expect(await theirs.listBudgets("2026-09")).toEqual([]);
    expect(await theirs.countUncategorised()).toBe(0);
    expect(await theirs.listExpectedCommitments("2026-09")).toEqual([]);
    expect(await theirs.listLatestAssetValuations()).toEqual([]);

    /*
     * The month, which is the read behind the whole Finance home — and the one
     * a falsification proved nothing was watching.
     */
    const summary = await theirs.monthSummary("2026-09");
    expect(summary.categories).toEqual([]);
    expect(summary.uncategorisedCount).toBe(0);
    expect(summary.transferCount).toBe(0);
    const totals = monthDirectionTotals(summary);
    expect(totals.out).toEqual([]);
    expect(totals.in).toEqual([]);
    expect(totals.uncategorisedOut).toEqual([]);
    expect(totals.uncategorisedIn).toEqual([]);

    // A second workspace has its OWN vocabulary, and has not been given one:
    // categories are seeded with a workspace's first account, not globally.
    expect(await theirs.listCategories({ includeArchived: true })).toEqual([]);
    expect([...(await theirs.countTransactionsByCategory()).keys()]).toEqual([]);
  });

  it("cannot fetch one record by id, and the miss is a MISS", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    /*
     * `null`, exactly as for an id that never existed. A "forbidden" here would
     * let a workspace enumerate another's ids one guess at a time — the answer
     * would be the confirmation.
     */
    expect(await theirs.getAccount(seeded.accountId)).toBeNull();
    expect(await theirs.getTransaction(seeded.transactionId)).toBeNull();
    expect(await theirs.resolveSettlement(seeded.transactionId)).toBeNull();
    expect(await theirs.suggestCategories(["NORTHWIND GROCERS"])).toEqual([]);

    /*
     * `suggestTransferPartners` REFUSES rather than returning an empty list,
     * and that is the right shape: it is asked about ONE transaction, so "not
     * found" is the honest answer for an id this workspace cannot see. An empty
     * list would say "that transaction exists and has no candidates", which is
     * a different — and more informative — answer than a hostile caller should
     * get. The refusal is the same one an id that never existed gets.
     */
    await expect(
      theirs.suggestTransferPartners(seeded.transactionId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
  });

  it("cannot change one record, and every refusal is NOT FOUND", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    await expect(
      theirs.updateAccount(seeded.accountId, { title: "Taken" }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.deleteAccount(seeded.accountId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.saveAccountMapping(seeded.accountId, MAPPING),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    await expect(
      theirs.updateCategory(seeded.categoryId, { name: "Taken" }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.setCategoryArchived(seeded.categoryId, true),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.deleteCategory(seeded.categoryId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    await expect(
      theirs.updateTransaction(seeded.transactionId, {
        payeeDisplay: "Taken",
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.deleteTransaction(seeded.transactionId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.restoreTransaction(seeded.transactionId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.unlinkTransfer(seeded.transactionId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    await expect(
      theirs.deleteBudget(seeded.budgetId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
  });

  it("cannot write INTO another workspace's account, by any route", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    // A transaction naming someone else's account.
    await expect(
      theirs.createTransaction({
        accountId: seeded.accountId,
        occurredOn: "2026-09-10",
        amount: "-50.00",
        payeeDisplay: "PLANTED",
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    // A budget naming someone else's category.
    await expect(
      theirs.setBudget({
        categoryId: seeded.categoryId,
        periodMonth: "2026-09",
        amount: "1.00",
        currencyCode: "AUD",
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    // An import into someone else's account — refused BEFORE any parsing, so
    // the file is never read on behalf of a workspace that owns nothing.
    await expect(
      theirs.previewImport({
        accountId: seeded.accountId,
        fileName: "september.csv",
        bytes: CSV,
        mapping: MAPPING,
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.applyImport({
        accountId: seeded.accountId,
        fileName: "september.csv",
        bytes: CSV,
        mapping: MAPPING,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    // And nothing landed.
    expect((await seeded.mine.listTransactions()).total).toBe(2);
    expect(await seeded.mine.listBudgets("2026-09")).toHaveLength(1);
    expect(await seeded.mine.listImports()).toHaveLength(1);
  });

  it("cannot pair a transfer across workspaces", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);
    const theirAccount = await theirs.createAccount({
      title: "Their Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-01-01",
    });
    const theirLeg = await theirs.createTransaction({
      accountId: theirAccount.id,
      occurredOn: "2026-09-04",
      amount: "84.20",
      payeeDisplay: "PLANTED",
    });

    /*
     * The amounts are exactly opposite and the accounts are different, so this
     * pair would be legitimate WITHIN one workspace. It is refused because the
     * other leg is not theirs to see — and refused as not-found, so the refusal
     * does not confirm that the id names anything.
     */
    await expect(
      theirs.linkTransfer(seeded.transactionId, theirLeg.id),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(
      theirs.linkTransfer(theirLeg.id, seeded.transactionId),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);

    expect(
      (await theirs.getTransaction(theirLeg.id))?.transaction.transferGroupId,
    ).toBeNull();
    expect(
      (await seeded.mine.getTransaction(seeded.transactionId))?.transaction
        .transferGroupId,
    ).toBeNull();
  });

  it("copies nothing across workspaces when copying budgets", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    /*
     * Both months are read within the copying workspace, so a workspace with no
     * budgets copies nothing however many the other has. Zero, never one.
     */
    expect(await theirs.copyBudgets("2026-09", "2026-10")).toBe(0);
    expect(await theirs.listBudgets("2026-10")).toEqual([]);
    expect(await seeded.mine.listBudgets("2026-10")).toEqual([]);
  });

  it("does not let an id from another workspace into a cursor", async () => {
    const seeded = await seedMine();
    const theirs = repo(THEIRS);

    // A page from MY workspace, and the cursor it hands back.
    const page = await seeded.mine.listTransactions({ limit: 1 });
    expect(page.nextCursor).not.toBeNull();

    /*
     * The cursor is bound to the scope that issued it, so replaying it in
     * another workspace reads nothing rather than continuing someone else's
     * page. A cursor is an opaque string a client holds, which makes it the
     * most likely thing to be replayed by accident or on purpose.
     */
    const replayed = await theirs
      .listTransactions({ cursor: page.nextCursor!, limit: 10 })
      .catch(() => ({ items: [], total: 0, nextCursor: null }));
    expect(replayed.items).toEqual([]);
    expect(seeded.importId).toBeDefined();
  });
});
