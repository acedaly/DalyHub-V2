/**
 * V2.12 FIN-00 — THE FINANCE REHEARSAL. Export, destroy, restore, and check
 * every machine value.
 *
 * V2.12's whole gate is recoverability, so this is the test the release rests
 * on, and it is written the only way it can be:
 *
 * ```
 *   1. seed a real Finance workspace — three accounts in two currencies, an
 *      applied import with a ledger row, categories, a budget, a transfer pair,
 *      a money-bearing obligation SETTLED by one of the transactions, and a
 *      receipt attached to another
 *   2. record every machine value BEFORE
 *   3. export the workspace
 *   4. DESTROY it — every Finance row, every entity, every link, every object
 *   5. restore from the archive
 *   6. compare every machine value AFTER
 * ```
 *
 * Step 6 is not a row count. It compares: each account's DERIVED balance,
 * recomputed from the restored rows rather than carried; the transfer pairing;
 * the category identity on every transaction; the fingerprint that makes a
 * re-import idempotent; the obligation's settlement link and its completed
 * amount; the receipt's bytes; and the month's totals per currency.
 *
 * **A balance is recomputed, never carried.** The archive holds the opening
 * balance and the transactions, and the figure is derived on both sides — so
 * this compares two independent computations of one definition rather than a
 * number against itself. That is the property ADR-120 decision 5 buys, and it is
 * why the archive has no balance to be wrong.
 *
 * **Every fixture is synthetic.** No real owner financial data exists in this
 * repository, and DEBT-198 is why.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import { createSystemActorContext } from "~/kernel/activity";
import { attachmentWorkspacePrefix, hexDigest } from "~/kernel/attachments";
import {
  deriveBalanceMinor,
  monthDirectionTotals,
  serialiseCsvMapping,
  type CsvMapping,
} from "~/kernel/finance";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  readAttachmentBytesForArchive,
} from "~/platform/export";
import {
  createR2ObjectStore,
  readAttachmentBytes,
  uploadAttachment,
} from "~/platform/attachments";
import {
  acknowledgeSafetyBackup,
  applyRestore,
  createSafetyBackup,
  prepareRestore,
  type RestoreDependencies,
} from "~/platform/restore";
import {
  createAttachmentRepository,
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";

import {
  FakeClock,
  makeContext,
  makeFinanceRepository,
  makeObligationRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_finance_rehearsal";
const OWNER = "owner-subject";
const APPLICATION = {
  name: "DalyHub",
  version: "2.12.0",
  releaseName: "FINANCE CORE",
  environment: "test",
  buildCommit: "test",
} as const;

/** A real 1x1 PNG. A receipt an owner would photograph. */
const RECEIPT = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

/** A synthetic bank CSV, so the ledger row and the fingerprints are real. */
const STATEMENT = [
  "Date,Description,Amount,Balance",
  "03/09/2026,EFTPOS NORTHWIND GROCERS 4821 DUBBO,-120.50,879.50",
  "04/09/2026,SYNTH CAFE 001,-12.50,867.00",
  "04/09/2026,SYNTH CAFE 001,-12.50,854.50",
  "05/09/2026,SYNTHETIC PAYROLL,2500.00,3354.50",
  "",
].join("\n");

const MAPPING: CsvMapping = {
  v: 1,
  headerRows: 1,
  date: 0,
  dateFormat: "dmy",
  description: 1,
  amount: { kind: "single", column: 2, invert: false },
  sourceId: null,
  balance: 3,
};

function objectStore() {
  return createR2ObjectStore(env.ATTACHMENTS);
}

function attachmentRepo() {
  return createAttachmentRepository(env.DB, makeContext(WS), {
    actorContext: createSystemActorContext(),
  });
}

function finance() {
  return makeFinanceRepository(makeContext(WS), {
    clock: new FakeClock("2026-09-06T00:00:00.000Z").now,
    idGenerator: sequentialIds("fin"),
  });
}

let restoreCounter = 0;

function restoreDeps(): RestoreDependencies {
  const context = makeContext(WS);
  return {
    restore: createWorkspaceRestoreRepository(env.DB, context),
    snapshot: createWorkspaceSnapshotRepository(env.DB, context),
    attachments: attachmentRepo(),
    objects: objectStore(),
    workspaceId: WS,
    ownerId: OWNER,
    application: APPLICATION,
    now: () => new Date("2026-09-06T00:00:00.000Z"),
    newId: () => `fin-rehearsal-${++restoreCounter}`,
  };
}

async function exportArchive(): Promise<Uint8Array> {
  const current = await buildWorkspaceSnapshot(
    createWorkspaceSnapshotRepository(env.DB, makeContext(WS)),
    {
      ownerId: OWNER,
      exportedAt: new Date("2026-09-06T00:00:00.000Z"),
      application: APPLICATION,
    },
  );
  return (
    await buildStructuredExportArchive(
      current,
      await readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: current.records.attachments,
        store: objectStore(),
      }),
    )
  ).bytes;
}

/**
 * Destroy the workspace completely — every Finance row, every entity, every
 * link, every object. Children strictly before parents, which is the SAME order
 * the restore's delete step uses, so a mistake in the dependency order shows up
 * here rather than in production.
 */
async function destroyWorkspace(): Promise<void> {
  const listed = await env.ATTACHMENTS.list({
    prefix: attachmentWorkspacePrefix(WS),
    limit: 1000,
  });
  for (const object of listed.objects) await env.ATTACHMENTS.delete(object.key);

  for (const table of [
    "activity_subjects",
    "activities",
    "entity_links",
    "attachments",
    "attachment_object_purges",
    "obligation_details",
    "finance_transaction_details",
    "finance_budgets",
    "finance_imports",
    "finance_categories",
    "finance_account_details",
    "spine_records",
    "entities",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`)
      .bind(WS)
      .run();
  }
}

async function restoreFrom(archive: Uint8Array): Promise<void> {
  const deps = restoreDeps();
  const preview = await prepareRestore(deps, archive);
  if (preview.mode === "replace") {
    const backup = await createSafetyBackup(deps, preview.operationId);
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      await hexDigest(backup.bytes),
    );
  }
  await applyRestore(deps, preview.operationId);
}

/**
 * Every machine value the rehearsal compares, read through the PRODUCT'S OWN
 * repository — never straight from SQL — so a restore that produced rows the
 * product cannot read still fails.
 */
async function machineValues() {
  const repo = finance();
  const accounts = await repo.listAccountsWithBalances({ includeClosed: true });
  const transactions = await repo.listTransactions({ limit: 200 });
  const categories = await repo.listCategories({ includeArchived: true });
  const budgets = await repo.listBudgets("2026-09");
  const imports = await repo.listImports();
  const month = await repo.monthSummary("2026-09");
  return {
    accounts: accounts
      .map((entry) => ({
        title: entry.account.title,
        type: entry.account.accountType,
        currency: entry.account.currencyCode,
        opening: entry.account.openingBalanceMinor,
        // RECOMPUTED, on both sides of the round trip, from the same rule.
        balance: entry.balanceMinor,
        transactionCount: entry.transactionCount,
        status: entry.account.status,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    transactions: transactions.items
      .map((view) => ({
        payee: view.transaction.payeeDisplay,
        source: view.transaction.sourceDescription,
        payeeKey: view.transaction.payeeKey,
        date: view.transaction.occurredOn,
        amount: view.transaction.amountMinor,
        currency: view.transaction.currencyCode,
        category: view.categoryName,
        fingerprint: view.transaction.fingerprint,
        transferred: view.transferPartnerId !== null,
        partnerAccount: view.transferPartnerAccountTitle,
        settles: view.settlesObligationTitle,
        fromImport: view.transaction.importId !== null,
      }))
      .sort((a, b) =>
        `${a.date}${a.payee}${a.amount}`.localeCompare(
          `${b.date}${b.payee}${b.amount}`,
        ),
      ),
    categories: categories.map((category) => ({
      name: category.name,
      kind: category.kind,
      archived: category.archivedAt !== null,
    })),
    budgets: budgets.map((budget) => ({
      month: budget.periodMonth,
      amount: budget.amountMinor,
      currency: budget.currencyCode,
    })),
    imports: imports.map((entry) => ({
      fileName: entry.fileName,
      sha: entry.fileSha256,
      rows: entry.rowCount,
      added: entry.addedCount,
      mapping: entry.mappingJson,
    })),
    month: monthDirectionTotals(month),
    uncategorised: month.uncategorisedCount,
    transfers: month.transferCount,
  };
}

beforeEach(async () => {
  await resetTables([WS]);
  const listed = await env.ATTACHMENTS.list({
    prefix: attachmentWorkspacePrefix(WS),
    limit: 1000,
  });
  for (const object of listed.objects) await env.ATTACHMENTS.delete(object.key);
});

describe("the Finance archive rehearsal", () => {
  it("reproduces every Finance fact after export, destruction and restore", async () => {
    const repo = finance();

    /* ---- 1. A real Finance workspace ------------------------------------ */

    const everyday = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
      openingBalance: "1000.00",
      institution: "Bank of Synthetica",
    });
    const card = await repo.createAccount({
      title: "Rewards Card",
      accountType: "credit_card",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
      openingBalance: "-400.00",
    });
    const overseas = await repo.createAccount({
      title: "Synthetica NZ",
      accountType: "savings",
      currencyCode: "NZD",
      openingDate: "2026-09-01",
      openingBalance: "500.00",
    });

    const categories = await repo.listCategories();
    const groceries = categories.find((c) => c.name === "Groceries")!;
    const dining = categories.find((c) => c.name === "Dining")!;
    const income = categories.find((c) => c.name === "Income")!;

    // A REAL import, so the ledger row and every fingerprint are the product's
    // own rather than a hand-written approximation.
    const bytes = new TextEncoder().encode(STATEMENT);
    const preview = await repo.previewImport({
      accountId: everyday.id,
      fileName: "synthetica-2026-09.csv",
      bytes,
      mapping: MAPPING,
    });
    const applied = await repo.applyImport({
      accountId: everyday.id,
      fileName: "synthetica-2026-09.csv",
      bytes,
      mapping: MAPPING,
      expectedSha256: preview.fileSha256,
      saveMapping: true,
    });
    expect(applied.addedCount).toBe(4);

    // Categorise the imported rows, so the round trip carries a category
    // IDENTITY on a row that came from a bank.
    const imported = await repo.listTransactions({
      filters: { accountId: everyday.id },
    });
    for (const view of imported.items) {
      const categoryId =
        view.transaction.amountMinor > 0
          ? income.id
          : view.transaction.payeeKey.includes("CAFE")
            ? dining.id
            : groceries.id;
      await repo.updateTransaction(view.transaction.id, { categoryId });
    }

    // A transfer pair across two accounts, so the fact that keeps a card
    // payment out of spending is on the round trip.
    const out = await repo.createTransaction({
      accountId: everyday.id,
      occurredOn: "2026-09-20",
      amount: "-400.00",
      payeeDisplay: "CARD PAYMENT",
    });
    const back = await repo.createTransaction({
      accountId: card.id,
      occurredOn: "2026-09-20",
      amount: "400.00",
      payeeDisplay: "PAYMENT RECEIVED",
    });
    await repo.linkTransfer(out.id, back.id);

    // A transaction in the OTHER currency, so the round trip proves unlike
    // money survives without being summed.
    await repo.createTransaction({
      accountId: overseas.id,
      occurredOn: "2026-09-11",
      amount: "-45.00",
      payeeDisplay: "NORTHWIND GROCERS NZ",
      categoryId: groceries.id,
    });

    await repo.setBudget({
      categoryId: groceries.id,
      periodMonth: "2026-09",
      amount: "600.00",
      currencyCode: "AUD",
    });

    // A money-bearing obligation, SETTLED by one of the imported transactions.
    const obligations = makeObligationRepository(makeContext(WS), {
      clock: new FakeClock("2026-09-06T00:00:00.000Z").now,
      idGenerator: sequentialIds("obl"),
    });
    const electricity = await obligations.create({
      category: "bill",
      title: "Electricity",
      dueDate: "2026-09-03",
      expectedAmount: "120.00",
      currencyCode: "AUD",
    });
    const grocerRow = imported.items.find(
      (view) => view.transaction.amountMinor === -12_050,
    )!;
    await obligations.complete(electricity.id, {
      settledByTransactionId: grocerRow.transaction.id,
    });

    // A receipt on a transaction — V2.11's mechanism, with no Finance
    // attachment implementation anywhere.
    const receipt = await uploadAttachment(
      {
        attachments: attachmentRepo(),
        objects: objectStore(),
        workspaceId: WS,
      },
      {
        ownerEntityId: grocerRow.transaction.id,
        filename: "grocery-receipt.png",
        declaredMediaType: "image/png",
        bytes: RECEIPT,
        uploadOperationId: "op-finance-receipt-0001",
      },
    );

    /* ---- 2. Record every machine value BEFORE --------------------------- */

    const before = await machineValues();
    // The balances are what the rest of the release depends on, so they are
    // named here rather than only compared: 1000 opening, minus 120.50, minus
    // 12.50 twice, plus 2500, minus the 400 card payment.
    const everydayBefore = before.accounts.find((a) => a.title === "Everyday")!;
    expect(everydayBefore.balance).toBe(
      deriveBalanceMinor(100_000, -12_050 - 1250 - 1250 + 250_000 - 40_000),
    );
    expect(
      before.accounts.find((a) => a.title === "Rewards Card")!.balance,
    ).toBe(0);
    expect(before.transfers).toBe(2);

    const archive = await exportArchive();

    /* ---- 3. Destroy --------------------------------------------------- */

    await destroyWorkspace();
    expect((await finance().listAccountsWithBalances()).length).toBe(0);

    /* ---- 4. Restore ---------------------------------------------------- */

    await restoreFrom(archive);

    /* ---- 5. Compare ----------------------------------------------------- */

    const after = await machineValues();
    expect(after).toEqual(before);

    // Named again, because `toEqual` on a big object is easy to read past and
    // these are the facts the release is gated on.
    const everydayAfter = after.accounts.find((a) => a.title === "Everyday")!;
    expect(everydayAfter.balance).toBe(everydayBefore.balance);
    expect(
      after.accounts.find((a) => a.title === "Rewards Card")!.balance,
    ).toBe(0);
    expect(
      after.accounts.find((a) => a.title === "Synthetica NZ")!.currency,
    ).toBe("NZD");

    // The obligation's settlement, its actual amount and its date.
    const settled = await obligations.get(electricity.id);
    expect(settled!.status).toBe("completed");
    expect(settled!.completedAmountMinor).toBe(12_050);
    expect(settled!.completedOn).toBe("2026-09-03");
    const settlingRow = after.transactions.find((t) => t.settles !== null);
    expect(settlingRow!.settles).toBe("Electricity");

    // The transfer pairing, by the ACCOUNT it points at rather than by an id
    // the restore is free to keep or not.
    const transferLegs = after.transactions.filter((t) => t.transferred);
    expect(transferLegs).toHaveLength(2);
    expect(transferLegs.map((leg) => leg.partnerAccount).sort()).toEqual([
      "Everyday",
      "Rewards Card",
    ]);

    // The receipt's BYTES, not merely its row — and read through the RESTORED
    // metadata, so a restore that kept the row and lost the object still fails.
    const restoredRecord = await attachmentRepo().get(receipt.attachment.id);
    expect(restoredRecord).not.toBeNull();
    expect(restoredRecord!.ownerEntityId).toBe(grocerRow.transaction.id);
    const restoredBytes = await readAttachmentBytes(
      {
        attachments: attachmentRepo(),
        objects: objectStore(),
        workspaceId: WS,
      },
      restoredRecord!,
    );
    expect(Array.from(restoredBytes)).toEqual(Array.from(RECEIPT));

    // The month, per currency, unchanged and never summed across them.
    expect(after.month.out).toEqual([
      { currencyCode: "AUD", minorUnits: 14_550, count: 3 },
      { currencyCode: "NZD", minorUnits: 4500, count: 1 },
    ]);
    expect(after.month.in).toEqual([
      { currencyCode: "AUD", minorUnits: 250_000, count: 1 },
    ]);
  });

  it("keeps a re-import idempotent ACROSS the restore", async () => {
    /*
     * The fingerprint and the file hash are FACTS, not derivations, so they are
     * in the archive. This proves what that buys: an owner who restores a
     * workspace and re-imports last month's statement still gets "0 new" —
     * which would not be true if the archive carried only the rows.
     */
    const repo = finance();
    const account = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    const bytes = new TextEncoder().encode(STATEMENT);
    const preview = await repo.previewImport({
      accountId: account.id,
      fileName: "synthetica-2026-09.csv",
      bytes,
      mapping: MAPPING,
    });
    await repo.applyImport({
      accountId: account.id,
      fileName: "synthetica-2026-09.csv",
      bytes,
      mapping: MAPPING,
      expectedSha256: preview.fileSha256,
    });

    const archive = await exportArchive();
    await destroyWorkspace();
    await restoreFrom(archive);

    const afterRepo = finance();
    const restored = await afterRepo.listAccountsWithBalances();
    expect(restored).toHaveLength(1);

    const again = await afterRepo.applyImport({
      accountId: restored[0]!.account.id,
      fileName: "synthetica-2026-09.csv",
      bytes,
      mapping: MAPPING,
      expectedSha256: preview.fileSha256,
    });
    expect(again.alreadyApplied).toBe(true);
    expect(again.addedCount).toBe(0);
    expect((await afterRepo.listTransactions()).total).toBe(4);
  });

  it("carries the saved column mapping, so the next import is one click", async () => {
    const repo = finance();
    const account = await repo.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-09-01",
    });
    await repo.saveAccountMapping(account.id, MAPPING);

    const archive = await exportArchive();
    await destroyWorkspace();
    await restoreFrom(archive);

    const restored = (await finance().listAccountsWithBalances())[0]!;
    expect(restored.account.importMappingJson).toBe(
      serialiseCsvMapping(MAPPING),
    );
  });
});
