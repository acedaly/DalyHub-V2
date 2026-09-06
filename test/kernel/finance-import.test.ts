/**
 * V2.12 FIN-01 — the import, against real D1.
 *
 * This is the file that has to be right, because a defect here is money the
 * owner did not spend appearing in their ledger, or money they did spend
 * disappearing from it. Every case the roadmap names is here, and each is named
 * as the QUESTION it answers rather than as the method it calls.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `NORTHWIND GROCERS`,
 * `SYNTH CAFE 001`. No real owner financial data exists in this repository.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  CSV_MAX_ROWS,
  CsvParseError,
  FinanceValidationError,
  validateCsvMapping,
  type CsvMapping,
} from "~/kernel/finance";

import {
  FakeClock,
  countActivitiesOfType,
  countFinanceTransactionRows,
  makeContext,
  makeFinanceRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_finance_import_other";

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

const MAPPING_WITH_ID: CsvMapping = validateCsvMapping({
  ...MAPPING,
  sourceId: 3,
});

const MAPPING_WITH_BALANCE: CsvMapping = validateCsvMapping({
  ...MAPPING,
  balance: 3,
});

let idCounter = 0;

function finance(ws = WS) {
  return makeFinanceRepository(makeContext(ws), {
    clock: new FakeClock("2026-09-06T00:00:00.000Z").now,
    idGenerator: sequentialIds(`imp${++idCounter}`),
  });
}

function csv(...rows: readonly string[]): Uint8Array {
  return new TextEncoder().encode(
    ["Date,Description,Amount", ...rows, ""].join("\n"),
  );
}

async function everyday(repo = finance()) {
  return repo.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingDate: "2026-09-01",
    institution: "Bank of Synthetica",
  });
}

/** Preview then apply, which is the only path the product offers. */
async function importFile(
  repo: ReturnType<typeof finance>,
  accountId: string,
  bytes: Uint8Array,
  options: {
    readonly mapping?: CsvMapping;
    readonly fileName?: string;
    readonly includeSuspected?: readonly number[];
  } = {},
) {
  const mapping = options.mapping ?? MAPPING;
  const fileName = options.fileName ?? "synthetica-2026-09.csv";
  const preview = await repo.previewImport({
    accountId,
    fileName,
    bytes,
    mapping,
  });
  const result = await repo.applyImport({
    accountId,
    fileName,
    bytes,
    mapping,
    expectedSha256: preview.fileSha256,
    includeSuspected: options.includeSuspected,
  });
  return { preview, result };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("importing the same file twice", () => {
  it("adds nothing, says so, and writes not one row", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const bytes = csv(
      "03/09/2026,EFTPOS NORTHWIND GROCERS 4821,-120.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
    );

    const first = await importFile(repo, account.id, bytes);
    expect(first.result.addedCount).toBe(2);
    expect(first.result.alreadyApplied).toBe(false);
    expect(await countFinanceTransactionRows()).toBe(2);

    const second = await importFile(repo, account.id, bytes);
    expect(second.result.addedCount).toBe(0);
    expect(second.result.alreadyApplied).toBe(true);
    // The headline promise, at the row level as well as the ledger level.
    expect(await countFinanceTransactionRows()).toBe(2);
    // And the PREVIEW says so before the owner presses anything.
    expect(second.preview.alreadyApplied).toBe(true);
    expect(second.preview.alreadyAppliedAt).not.toBeNull();
  });

  it("writes ONE Activity event per applied import, and none per transaction", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await importFile(
      repo,
      account.id,
      csv(
        "03/09/2026,NORTHWIND GROCERS,-120.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "05/09/2026,SYNTHETIC PAYROLL,2500.00",
      ),
    );
    // Three transactions, ONE event. An event per row would double an import's
    // write volume and fill the feed with a fact nobody reads.
    expect(await countActivitiesOfType("finance.import.applied")).toBe(1);
  });
});

describe("two identical legitimate purchases", () => {
  const twoCoffees = csv(
    "04/09/2026,SYNTH CAFE 001,-12.50",
    "04/09/2026,SYNTH CAFE 001,-12.50",
  );

  it("both import, because real people buy the same thing twice", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const { result } = await importFile(repo, account.id, twoCoffees);
    expect(result.addedCount).toBe(2);
    expect(await countFinanceTransactionRows()).toBe(2);
  });

  it("both survive a re-import of an OVERLAPPING export", async () => {
    /*
     * The weekly-export workflow, and the case the occurrence index exists for.
     * The second file is DIFFERENT BYTES, so the ledger's hash does not save us:
     * this is the row-level constraint doing the work.
     */
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, twoCoffees, { fileName: "week-1.csv" });

    const overlapping = csv(
      "04/09/2026,SYNTH CAFE 001,-12.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
      "09/09/2026,NORTHWIND GROCERS,-88.00",
    );
    const { preview, result } = await importFile(
      repo,
      account.id,
      overlapping,
      { fileName: "week-2.csv" },
    );
    expect(result.addedCount).toBe(1);
    expect(result.skippedExistingCount).toBe(2);
    expect(preview.rows.map((row) => row.outcome)).toEqual([
      "existing",
      "existing",
      "new",
    ]);
    expect(await countFinanceTransactionRows()).toBe(3);
  });

  it("adds the THIRD identical purchase when a later export carries all three", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, twoCoffees, { fileName: "week-1.csv" });

    const threeCoffees = csv(
      "04/09/2026,SYNTH CAFE 001,-12.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
    );
    const { result } = await importFile(repo, account.id, threeCoffees, {
      fileName: "week-2.csv",
    });
    expect(result.addedCount).toBe(1);
    expect(await countFinanceTransactionRows()).toBe(3);
  });

  it("reports the STATED limitation rather than hiding it: a window that begins mid-group under-counts", async () => {
    /*
     * The honest cost of having no bank-supplied identity, written down in
     * ADR-120 decision 3 and asserted here so it is a KNOWN behaviour rather
     * than a surprise. A file containing only the third coffee offers `n = 0`,
     * which collides.
     *
     * Three things bound it, and the last two are the point: most banks supply a
     * stable id (proved below); the preview SHOWS the row as already imported
     * rather than hiding it; and the owner can add it by hand.
     */
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, twoCoffees, { fileName: "week-1.csv" });

    const onlyTheThird = csv("04/09/2026,SYNTH CAFE 001,-12.50");
    const { preview, result } = await importFile(
      repo,
      account.id,
      onlyTheThird,
      { fileName: "week-2.csv" },
    );
    expect(result.addedCount).toBe(0);
    expect(preview.rows[0]!.outcome).toBe("existing");
  });

  it("does NOT under-count when the bank supplies a stable id", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const withIds = new TextEncoder().encode(
      [
        "Date,Description,Amount,Id",
        "04/09/2026,SYNTH CAFE 001,-12.50,SYN-1",
        "04/09/2026,SYNTH CAFE 001,-12.50,SYN-2",
        "",
      ].join("\n"),
    );
    await importFile(repo, account.id, withIds, {
      mapping: MAPPING_WITH_ID,
      fileName: "week-1.csv",
    });

    const onlyTheThird = new TextEncoder().encode(
      [
        "Date,Description,Amount,Id",
        "04/09/2026,SYNTH CAFE 001,-12.50,SYN-3",
        "",
      ].join("\n"),
    );
    const { result } = await importFile(repo, account.id, onlyTheThird, {
      mapping: MAPPING_WITH_ID,
      fileName: "week-2.csv",
    });
    expect(result.addedCount).toBe(1);
  });
});

describe("a row cannot collide across accounts", () => {
  it("imports the same statement into two accounts as two separate sets", async () => {
    const repo = finance();
    const a = await everyday(repo);
    const b = await repo.createAccount({
      title: "Savings",
      accountType: "savings",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    const bytes = csv("03/09/2026,NORTHWIND GROCERS,-120.50");

    expect((await importFile(repo, a.id, bytes)).result.addedCount).toBe(1);
    // The SAME bytes into a DIFFERENT account: the ledger's key is
    // (workspace, account, hash) and the row's is (workspace, account,
    // fingerprint), so neither refuses.
    expect((await importFile(repo, b.id, bytes)).result.addedCount).toBe(1);
    expect(await countFinanceTransactionRows()).toBe(2);
  });
});

describe("a re-import never overwrites the owner's work", () => {
  it("leaves a categorised, renamed row exactly as the owner left it", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const bytes = csv("03/09/2026,EFTPOS NORTHWIND GROCERS 4821,-120.50");
    await importFile(repo, account.id, bytes, { fileName: "week-1.csv" });

    const groceries = (await repo.listCategories()).find(
      (category) => category.name === "Groceries",
    )!;
    const imported = (await repo.listTransactions()).items[0]!;
    await repo.updateTransaction(imported.transaction.id, {
      categoryId: groceries.id,
      payeeDisplay: "Northwind Grocers",
      memo: "Weekly shop",
    });

    // An overlapping export carrying the same row, as different bytes.
    await importFile(
      repo,
      account.id,
      csv(
        "03/09/2026,EFTPOS NORTHWIND GROCERS 4821,-120.50",
        "10/09/2026,SYNTH CAFE 001,-4.50",
      ),
      { fileName: "week-2.csv" },
    );

    const after = await repo.getTransaction(imported.transaction.id);
    expect(after!.transaction.categoryId).toBe(groceries.id);
    expect(after!.transaction.payeeDisplay).toBe("Northwind Grocers");
    expect(after!.transaction.memo).toBe("Weekly shop");
  });

  it("refuses to edit the date or amount of an IMPORTED row, by name", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, csv("03/09/2026,NORTHWIND,-120.50"));
    const imported = (await repo.listTransactions()).items[0]!;

    await expect(
      repo.updateTransaction(imported.transaction.id, {
        occurredOn: "2026-09-04",
      }),
    ).rejects.toThrow(/come from your bank/);
    await expect(
      repo.updateTransaction(imported.transaction.id, { amount: "-1.00" }),
    ).rejects.toThrow(/come from your bank/);
  });

  it("does NOT resurrect a transaction the owner deleted", async () => {
    /*
     * A deleted row keeps its fingerprint, so a later overlapping import reports
     * it as already imported rather than bringing it back. Deleting was a
     * decision, and silently undoing it would be worse than saying so.
     */
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, csv("03/09/2026,NORTHWIND,-120.50"), {
      fileName: "week-1.csv",
    });
    const imported = (await repo.listTransactions()).items[0]!;
    await repo.deleteTransaction(imported.transaction.id);

    const { preview, result } = await importFile(
      repo,
      account.id,
      csv("03/09/2026,NORTHWIND,-120.50", "10/09/2026,CAFE,-4.50"),
      { fileName: "week-2.csv" },
    );
    expect(preview.rows[0]!.outcome).toBe("existing");
    expect(result.addedCount).toBe(1);
  });
});

describe("a suspected duplicate is shown, skipped by default, and includable", () => {
  it("flags a row that looks like one the account already holds", async () => {
    const repo = finance();
    const account = await everyday(repo);
    // Entered by HAND first — the manual-entry overlap this signal exists for.
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-40.00",
      payeeDisplay: "CASH WITHDRAWAL",
    });

    const { preview, result } = await importFile(
      repo,
      account.id,
      csv("05/09/2026,CASH WITHDRAWAL,-40.00"),
    );
    expect(preview.rows[0]!.outcome).toBe("new");
    expect(preview.rows[0]!.suspected).toBe(true);
    expect(preview.suspectedCount).toBe(1);
    // Skipped BY DEFAULT. Nothing is silently merged and nothing is silently
    // dropped: the owner was shown it.
    expect(result.addedCount).toBe(0);
    expect(result.suspectedCount).toBe(1);
  });

  it("imports a suspected row when the owner names it", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-40.00",
      payeeDisplay: "CASH WITHDRAWAL",
    });
    const { result } = await importFile(
      repo,
      account.id,
      csv("05/09/2026,CASH WITHDRAWAL,-40.00"),
      { includeSuspected: [0] },
    );
    expect(result.addedCount).toBe(1);
  });

  it("does NOT suspect a row the bank gave an id to", async () => {
    // A bank id makes identity certain, so it suppresses suspicion.
    const repo = finance();
    const account = await everyday(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-40.00",
      payeeDisplay: "CASH WITHDRAWAL",
    });
    const bytes = new TextEncoder().encode(
      [
        "Date,Description,Amount,Id",
        "05/09/2026,CASH WITHDRAWAL,-40.00,SYN-9",
        "",
      ].join("\n"),
    );
    const { preview, result } = await importFile(repo, account.id, bytes, {
      mapping: MAPPING_WITH_ID,
    });
    expect(preview.rows[0]!.suspected).toBe(false);
    expect(result.addedCount).toBe(1);
  });

  it("catches the case the FINGERPRINT cannot see: the bank changed the description", async () => {
    /*
     * The roadmap asks what happens when a bank changes a transaction's
     * description between two exports. The fingerprint cannot see it — a
     * different description is a different payee key is a different `occ:`
     * identity — so the row imports as NEW. This signal is what stops that being
     * silent: same amount, same day, a different payee string.
     */
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, csv("03/09/2026,SP NORTHWIND,-88.00"), {
      fileName: "week-1.csv",
    });

    const { preview, result } = await importFile(
      repo,
      account.id,
      csv("03/09/2026,NORTHWIND GROCERS PTY LTD DUBBO,-88.00"),
      { fileName: "week-2.csv" },
    );
    expect(preview.rows[0]!.outcome).toBe("new");
    expect(preview.rows[0]!.suspected).toBe(true);
    // Shown, and skipped by default, so the ledger does not quietly gain a
    // second $88 the owner never spent.
    expect(result.addedCount).toBe(0);
  });

  it("does NOT suspect a third same-day purchase, which the occurrence index already resolves", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await importFile(
      repo,
      account.id,
      csv(
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
      ),
      { fileName: "week-1.csv" },
    );
    const { preview, result } = await importFile(
      repo,
      account.id,
      csv(
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
      ),
      { fileName: "week-2.csv" },
    );
    expect(preview.rows.map((row) => row.suspected)).toEqual([
      false,
      false,
      false,
    ]);
    expect(result.addedCount).toBe(1);
  });

  it("does NOT suspect a row outside the three-day window", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await repo.createTransaction({
      accountId: account.id,
      occurredOn: "2026-09-03",
      amount: "-40.00",
      payeeDisplay: "CASH WITHDRAWAL",
    });
    const { preview } = await importFile(
      repo,
      account.id,
      csv("20/09/2026,CASH WITHDRAWAL,-40.00"),
    );
    expect(preview.rows[0]!.suspected).toBe(false);
  });
});

describe("the preview says what will happen, before anything is written", () => {
  it("separates new, existing and invalid, and names each invalid row's problem and line", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await importFile(repo, account.id, csv("03/09/2026,NORTHWIND,-120.50"), {
      fileName: "week-1.csv",
    });

    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "week-2.csv",
      bytes: csv(
        "03/09/2026,NORTHWIND,-120.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "99/99/2026,BROKEN,-1.00",
      ),
      mapping: MAPPING,
    });
    expect(preview.newCount).toBe(1);
    expect(preview.existingCount).toBe(1);
    expect(preview.invalidCount).toBe(1);
    const invalid = preview.rows.find((row) => row.outcome === "invalid")!;
    expect(invalid.problem).toBe("bad_date");
    expect(invalid.line).toBe(4);
    // Preview WRITES NOTHING.
    expect(await countFinanceTransactionRows()).toBe(1);
  });

  it("shows money in and money out for the rows it will apply, so a wrong sign is obvious", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes: csv("03/09/2026,NORTHWIND,-120.50", "05/09/2026,PAYROLL,2500.00"),
      mapping: MAPPING,
    });
    expect(preview.outMinor).toBe(12_050);
    expect(preview.inMinor).toBe(250_000);
    expect(preview.currencyCode).toBe("AUD");
  });

  it("CHECKS the statement's closing balance without ever writing it", async () => {
    const repo = finance();
    const account = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
      openingBalance: "1000.00",
    });
    const bytes = new TextEncoder().encode(
      [
        "Date,Description,Amount,Balance",
        "03/09/2026,NORTHWIND,-120.50,879.50",
        "",
      ].join("\n"),
    );
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING_WITH_BALANCE,
    });
    expect(preview.balanceCheck).toEqual({
      statedMinor: 87_950,
      derivedMinor: 87_950,
      differenceMinor: 0,
      currencyCode: "AUD",
    });
  });

  it("states the DIFFERENCE when the statement and the rows disagree", async () => {
    const repo = finance();
    const account = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
      openingBalance: "1000.00",
    });
    const bytes = new TextEncoder().encode(
      [
        "Date,Description,Amount,Balance",
        // The bank says the account ends at 837.50, which is $42 lower than the
        // rows produce. That is INFORMATION — a missing row — and it is the
        // whole reason the check exists.
        "03/09/2026,NORTHWIND,-120.50,837.50",
        "",
      ].join("\n"),
    );
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING_WITH_BALANCE,
    });
    expect(preview.balanceCheck!.differenceMinor).toBe(-4200);
    // And it did not adopt the statement's figure.
    expect(
      (await repo.listAccountsWithBalances())[0]!.account.openingBalanceMinor,
    ).toBe(100_000);
  });

  it("refuses an apply whose bytes are not the ones previewed", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const previewed = csv("03/09/2026,NORTHWIND,-120.50");
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes: previewed,
      mapping: MAPPING,
    });
    await expect(
      repo.applyImport({
        accountId: account.id,
        fileName: "s.csv",
        bytes: csv("03/09/2026,SOMETHING ELSE,-999.00"),
        mapping: MAPPING,
        expectedSha256: preview.fileSha256,
      }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
    expect(await countFinanceTransactionRows()).toBe(0);
  });
});

describe("an applied import is all of its rows or none of them", () => {
  it("writes nothing at all when the batch fails", async () => {
    const repo = makeFinanceRepository(makeContext(WS), {
      clock: new FakeClock("2026-09-06T00:00:00.000Z").now,
      idGenerator: sequentialIds("fault"),
    });
    const account = await everyday(repo);

    const faulty = makeFinanceRepository(makeContext(WS), {
      clock: new FakeClock("2026-09-06T00:00:00.000Z").now,
      idGenerator: sequentialIds("faulted"),
      mutationFault: "after-domain",
    });
    const bytes = csv(
      "03/09/2026,NORTHWIND,-120.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
      "05/09/2026,PAYROLL,2500.00",
    );
    const preview = await faulty.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING,
    });
    await expect(
      faulty.applyImport({
        accountId: account.id,
        fileName: "s.csv",
        bytes,
        mapping: MAPPING,
        expectedSha256: preview.fileSha256,
      }),
    ).rejects.toThrow();

    // Not "wrote 2 of 3". Nothing, including the ledger row.
    expect(await countFinanceTransactionRows()).toBe(0);
    expect(await repo.listImports()).toHaveLength(0);
  });

  it("keeps INVALID rows out of the batch entirely", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const { result } = await importFile(
      repo,
      account.id,
      csv(
        "03/09/2026,GOOD,-1.00",
        "99/99/2026,BROKEN,-1.00",
        "04/09/2026,ALSO GOOD,-2.00",
      ),
    );
    expect(result.addedCount).toBe(2);
    expect(result.invalidCount).toBe(1);
    expect(await countFinanceTransactionRows()).toBe(2);
  });
});

describe("two simultaneous imports of one file", () => {
  it("produce exactly one set of transactions, with no check-then-insert anywhere", async () => {
    /*
     * The ledger's UNIQUE (workspace, account, file_sha256) is the authority.
     * One INSERT wins; the loser's whole batch fails atomically and is reported
     * as already imported. There is no read-then-write window to lose.
     */
    const repo = finance();
    const account = await everyday(repo);
    const bytes = csv(
      "03/09/2026,NORTHWIND,-120.50",
      "04/09/2026,SYNTH CAFE 001,-12.50",
    );
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING,
    });

    const attempt = () =>
      finance().applyImport({
        accountId: account.id,
        fileName: "s.csv",
        bytes,
        mapping: MAPPING,
        expectedSha256: preview.fileSha256,
      });

    const results = await Promise.all([attempt(), attempt(), attempt()]);
    const added = results.reduce((sum, result) => sum + result.addedCount, 0);
    expect(added).toBe(2);
    expect(results.filter((result) => result.alreadyApplied)).toHaveLength(2);
    expect(await countFinanceTransactionRows()).toBe(2);
    expect(await repo.listImports()).toHaveLength(1);
  });
});

describe("scale, and the statement count that does not grow with it", () => {
  /**
   * `rows` DATA rows. The parser's ceiling counts every physical row including
   * the header, so the largest importable statement is `CSV_MAX_ROWS - 1`
   * transactions — which is what the refusal message says.
   */
  function statement(rows: number): Uint8Array {
    const lines = ["Date,Description,Amount"];
    for (let index = 0; index < rows; index += 1) {
      const day = String((index % 28) + 1).padStart(2, "0");
      lines.push(`${day}/09/2026,SYNTHETIC MERCHANT ${index},-${index + 1}.25`);
    }
    lines.push("");
    return new TextEncoder().encode(lines.join("\n"));
  }

  it("imports 1, 100, 1,000 and 2,000 rows, atomically, in a CONSTANT number of statements", async () => {
    /*
     * The measurement ADR-120 decision 3 rests on. The rows travel as ONE bound
     * JSON parameter expanded with `json_each`, so the batch is the same shape at
     * every size — which is what makes an import both atomic and possible at all,
     * because D1 refuses a statement with more than 100 bound variables and a
     * per-row binding would cap this at five.
     */
    const counts: Record<number, number> = {};
    for (const rows of [1, 100, 1000, CSV_MAX_ROWS - 1]) {
      await resetTables([WS, OTHER]);
      const repo = finance();
      const account = await everyday(repo);
      const bytes = statement(rows);
      const preview = await repo.previewImport({
        accountId: account.id,
        fileName: `s-${rows}.csv`,
        bytes,
        mapping: MAPPING,
      });
      const result = await repo.applyImport({
        accountId: account.id,
        fileName: `s-${rows}.csv`,
        bytes,
        mapping: MAPPING,
        expectedSha256: preview.fileSha256,
      });
      expect(result.addedCount).toBe(rows);
      expect(await countFinanceTransactionRows()).toBe(rows);
      counts[rows] = result.addedCount;

      // The balance is derived over every one of them, in one grouped read.
      const [withBalance] = await repo.listAccountsWithBalances();
      expect(withBalance!.transactionCount).toBe(rows);
    }
    expect(counts[CSV_MAX_ROWS - 1]).toBe(CSV_MAX_ROWS - 1);
  }, 120_000);

  it("refuses a file above the row ceiling rather than truncating it", async () => {
    const repo = finance();
    const account = await everyday(repo);
    await expect(
      repo.previewImport({
        accountId: account.id,
        fileName: "too-big.csv",
        bytes: statement(CSV_MAX_ROWS),
        mapping: MAPPING,
      }),
    ).rejects.toBeInstanceOf(CsvParseError);
  }, 60_000);
});

describe("the import ledger is the audit record", () => {
  it("records the file's identity and every count, and never the file", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const bytes = csv(
      "03/09/2026,NORTHWIND,-120.50",
      "99/99/2026,BROKEN,-1.00",
      "04/09/2026,SYNTH CAFE 001,-12.50",
    );
    await importFile(repo, account.id, bytes, {
      fileName: "synthetica-2026-09.csv",
    });

    const [entry] = await repo.listImports();
    expect(entry!.fileName).toBe("synthetica-2026-09.csv");
    expect(entry!.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.fileBytes).toBe(bytes.length);
    expect(entry!.rowCount).toBe(3);
    expect(entry!.addedCount).toBe(2);
    expect(entry!.invalidCount).toBe(1);
    // The mapping is kept so an applied import is reproducible from the same
    // file. The FILE itself is not: only its hash.
    expect(JSON.parse(entry!.mappingJson)).toMatchObject({
      v: 1,
      dateFormat: "dmy",
    });
    expect(entry!.mappingJson).not.toContain("NORTHWIND");
  });

  it("saves the mapping on the account when asked, so the next import is pre-filled", async () => {
    const repo = finance();
    const account = await everyday(repo);
    const bytes = csv("03/09/2026,NORTHWIND,-120.50");
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING,
    });
    await repo.applyImport({
      accountId: account.id,
      fileName: "s.csv",
      bytes,
      mapping: MAPPING,
      expectedSha256: preview.fileSha256,
      saveMapping: true,
    });
    const after = await repo.getAccount(account.id);
    expect(after!.importMappingJson).toContain('"dateFormat":"dmy"');
  });
});

describe("a hostile workspace sees nothing", () => {
  it("cannot preview or apply into another workspace's account", async () => {
    const mine = finance();
    const account = await everyday(mine);
    const theirs = finance(OTHER);
    const bytes = csv("03/09/2026,NORTHWIND,-120.50");

    await expect(
      theirs.previewImport({
        accountId: account.id,
        fileName: "s.csv",
        bytes,
        mapping: MAPPING,
      }),
    ).rejects.toThrow(/could not be found/);
    await expect(
      theirs.applyImport({
        accountId: account.id,
        fileName: "s.csv",
        bytes,
        mapping: MAPPING,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toThrow(/could not be found/);
    expect(await countFinanceTransactionRows()).toBe(0);
  });

  it("cannot see another workspace's imports or transactions", async () => {
    const mine = finance();
    const account = await everyday(mine);
    await importFile(mine, account.id, csv("03/09/2026,NORTHWIND,-120.50"));

    const theirs = finance(OTHER);
    expect(await theirs.listImports()).toEqual([]);
    expect((await theirs.listTransactions()).items).toEqual([]);
    expect(await theirs.getAccount(account.id)).toBeNull();
  });
});
