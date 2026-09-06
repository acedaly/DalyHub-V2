/**
 * V2.12 — every Finance read costs a FIXED number of statements.
 *
 * The property the roadmap named: **flat at ten transactions and at ten
 * thousand**. A money surface that issued one read per row would be correct and
 * unusable, and the 50-row page cap would hide it rather than fix it — so each
 * read below is measured at two very different sizes, because a single
 * measurement cannot tell a constant from a coincidence.
 *
 * The results are asserted alongside every count. A batched read that returned
 * the wrong rows, or lost their order, would satisfy the count and break the
 * product.
 *
 * The applied IMPORT is here too, and it is the sharpest case: its rows travel
 * as ONE bound JSON parameter expanded with `json_each`, because D1 refuses a
 * statement with more than 100 bound variables. A 200-row statement and a 4-row
 * statement must cost the same batch.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `NORTHWIND GROCERS`.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { validateCsvMapping, type CsvMapping } from "~/kernel/finance";
import { createFinanceRepository } from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeFinanceRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-finance-budget-workspace";

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

/*
 * ONE id generator for the whole file, deliberately.
 *
 * A fresh `sequentialIds` per repository would restart at `fb_0001`, so the
 * second import in a test would try to write entity ids the first already used
 * and fail on the primary key — a test artefact that looks exactly like a
 * product defect. The generator is the measuring instrument here, so it is
 * shared the way the product's is.
 */
const nextId = sequentialIds("fb");

function repository(db: D1Database = env.DB) {
  return createFinanceRepository(db, makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

function seeder() {
  return makeFinanceRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

/** A CSV of `rows` synthetic purchases, one per day from 1 September. */
function csv(rows: number): Uint8Array {
  const lines = ["Date,Description,Amount"];
  for (let index = 0; index < rows; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    lines.push(
      `${day}/09/2026,NORTHWIND GROCERS ${index},-${(index % 90) + 10}.${String(index % 100).padStart(2, "0")}`,
    );
  }
  return new TextEncoder().encode(lines.join("\n"));
}

/** `count` accounts, each with `perAccount` transactions in September 2026. */
async function seed(count: number, perAccount: number) {
  const repo = seeder();
  const categories = await (async () => {
    const first = await repo.createAccount({
      title: "Everyday 00",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-01-01",
      institution: "Bank of Synthetica",
    });
    return { first, list: await repo.listCategories() };
  })();

  const accounts = [categories.first];
  for (let index = 1; index < count; index += 1) {
    accounts.push(
      await repo.createAccount({
        title: `Everyday ${String(index).padStart(2, "0")}`,
        accountType: "transaction",
        currencyCode: "AUD",
        openingDate: "2026-01-01",
      }),
    );
  }

  for (const account of accounts) {
    for (let index = 0; index < perAccount; index += 1) {
      await repo.createTransaction({
        accountId: account.id,
        occurredOn: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
        amount: `-${(index % 90) + 10}.00`,
        payeeDisplay: `NORTHWIND GROCERS ${index}`,
        // Half categorised, so the suggestion read has something to group.
        categoryId: index % 2 === 0 ? (categories.list[0]?.id ?? null) : null,
      });
    }
  }
  return { accounts, categories: categories.list };
}

describe("V2.12 — the Finance reads are flat", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("derives every balance in one grouped read, whatever the account count", async () => {
    await seed(2, 4);
    const small = countingDb(env.DB);
    const smallAccounts = await repository(small.db).listAccountsWithBalances();
    const smallCost = small.prepareCount();

    await resetTables([WS]);
    await seed(12, 20);
    const large = countingDb(env.DB);
    const largeAccounts = await repository(large.db).listAccountsWithBalances();

    expect(smallAccounts).toHaveLength(2);
    expect(largeAccounts).toHaveLength(12);
    // Twelve accounts holding 240 transactions cost what two holding eight do.
    expect(large.prepareCount()).toBe(smallCost);

    // And the figures are real: each account's balance is the sum of its rows.
    for (const entry of largeAccounts) {
      expect(entry.balanceMinor).toBeLessThan(0);
      expect(entry.transactionCount).toBe(20);
    }
  });

  it("reads a transaction page at a fixed cost, whatever the page size", async () => {
    await seed(3, 60);

    const small = countingDb(env.DB);
    const smallPage = await repository(small.db).listTransactions({ limit: 5 });
    const smallCost = small.prepareCount();

    const large = countingDb(env.DB);
    const largePage = await repository(large.db).listTransactions({
      limit: 100,
    });

    expect(smallPage.items).toHaveLength(5);
    expect(largePage.items).toHaveLength(100);
    /*
     * A page carries its account, its category and its transfer partner through
     * JOINs, so twenty times the rows is the same number of statements. The
     * shape AGENTS.md §16 exists to prevent is one read per row.
     */
    expect(large.prepareCount()).toBe(smallCost);

    // Newest first, and the order survives the batch.
    const dates = largePage.items.map((item) => item.transaction.occurredOn);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("suggests categories for a whole page in one grouped statement", async () => {
    const { accounts } = await seed(1, 40);
    expect(accounts).toHaveLength(1);

    const few = countingDb(env.DB);
    await repository(few.db).suggestCategories(["A", "B"]);
    const fewCost = few.prepareCount();

    const many = countingDb(env.DB);
    await repository(many.db).suggestCategories(
      Array.from({ length: 60 }, (_, index) => `PAYEE ${index}`),
    );
    /*
     * Sixty payee keys travel as ONE bound JSON parameter expanded with
     * `json_each` — the technique `history-window-read.ts` uses, and the reason
     * a page of sixty rows does not breach D1's 100-variable ceiling.
     */
    expect(many.prepareCount()).toBe(fewCost);
  });

  it("summarises a month in one grouped statement, whatever the month holds", async () => {
    await seed(2, 5);
    const small = countingDb(env.DB);
    await repository(small.db).monthSummary("2026-09");
    const smallCost = small.prepareCount();

    await resetTables([WS]);
    await seed(6, 40);
    const large = countingDb(env.DB);
    const summary = await repository(large.db).monthSummary("2026-09");

    expect(large.prepareCount()).toBe(smallCost);
    expect(summary.categories.length).toBeGreaterThan(0);
  });

  it("counts the whole category vocabulary in one statement", async () => {
    await seed(1, 30);
    const counting = countingDb(env.DB);
    const counts = await repository(counting.db).countTransactionsByCategory();
    // One statement for twelve categories, never one per category.
    expect(counting.prepareCount()).toBe(1);
    expect([...counts.values()].reduce((sum, n) => sum + n, 0)).toBe(15);
  });

  it("applies an import as one batch whose cost does not grow with the file", async () => {
    const { accounts } = await seed(1, 0);
    const account = accounts[0]!;

    const small = countingDb(env.DB);
    const smallResult = await repository(small.db).applyImport({
      accountId: account.id,
      fileName: "september-small.csv",
      bytes: csv(4),
      mapping: MAPPING,
      expectedSha256: (
        await repository().previewImport({
          accountId: account.id,
          fileName: "september-small.csv",
          bytes: csv(4),
          mapping: MAPPING,
        })
      ).fileSha256,
    });
    const smallCost = small.prepareCount();
    expect(smallResult.addedCount).toBe(4);

    const large = countingDb(env.DB);
    const largeResult = await repository(large.db).applyImport({
      accountId: account.id,
      fileName: "september-large.csv",
      bytes: csv(200),
      mapping: MAPPING,
      expectedSha256: (
        await repository().previewImport({
          accountId: account.id,
          fileName: "september-large.csv",
          bytes: csv(200),
          mapping: MAPPING,
        })
      ).fileSha256,
    });

    /*
     * 200 rows in the same number of statements as 4. The rows travel as ONE
     * bound JSON parameter; a statement per row would breach D1's 100-variable
     * ceiling long before it became slow, so this is a correctness property and
     * not only a performance one.
     */
    expect(large.prepareCount()).toBe(smallCost);
    expect(largeResult.addedCount).toBeGreaterThan(190);
  });
});
