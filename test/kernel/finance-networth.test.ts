/**
 * V2.12 — net worth, against real D1.
 *
 * This file exists because a defect got past the kernel suite: no test called
 * `listLatestAssetValuations`, its SQL named a column `asset_details` does not
 * have, and the Finance home caught the error and rendered its calm error state
 * — so net worth was silently absent from the product and every test was green.
 * The E2E suite found it on the first real page load.
 *
 * The lesson is written into the shape of the file: every read the Finance home
 * makes is CALLED here, against real D1 and the real committed migrations, so a
 * statement that cannot execute fails a test rather than degrading a screen.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `Synthetic Trailer`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { computeNetWorth, totalMoney } from "~/kernel/finance";

import {
  FakeClock,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeFinanceRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-finance-networth-workspace";

const nextId = sequentialIds("nw");

function finance() {
  return makeFinanceRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

function assets() {
  return makeAssetRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

function history() {
  return makeAssetHistoryRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}

describe("V2.12 — net worth", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("reads the latest Asset valuations at all — the statement executes", async () => {
    /*
     * The regression, at its bluntest. An empty workspace is enough: the defect
     * was a column that does not exist, so the statement threw before it could
     * return no rows.
     */
    await expect(finance().listLatestAssetValuations()).resolves.toEqual([]);
  });

  it("takes each Asset's most recent valuation, not its first and not its purchase price", async () => {
    const asset = await assets().create({
      title: "Synthetic Trailer",
      assetType: "vehicle",
      purchasePrice: "9000.00",
      currencyCode: "AUD",
    });
    const log = history();
    await log.recordEvent(asset.id, {
      category: "valuation",
      title: "First valuation",
      eventDate: "2026-03-01",
      value: "8000.00",
      currencyCode: "AUD",
    });
    await log.recordEvent(asset.id, {
      category: "valuation",
      title: "Latest valuation",
      eventDate: "2026-08-01",
      value: "7250.00",
      currencyCode: "AUD",
    });

    const valuations = await finance().listLatestAssetValuations();
    expect(valuations).toHaveLength(1);
    expect(valuations[0]?.valueMinor).toBe(725_000);
    expect(valuations[0]?.valuedOn).toBe("2026-08-01");
  });

  it("reports an Asset with NO valuation as null, never as zero", async () => {
    await assets().create({ title: "Synthetic Shed", assetType: "other" });

    const valuations = await finance().listLatestAssetValuations();
    expect(valuations).toHaveLength(1);
    expect(valuations[0]?.valueMinor).toBeNull();

    /*
     * And the arithmetic COUNTS it rather than valuing it. A house DalyHub has
     * never been told the value of is not worth nothing, and a net worth that
     * quietly included a zero for it would be wrong in the one direction an
     * owner would not notice.
     */
    const worth = computeNetWorth([], valuations);
    expect(worth.assetsWithoutValue).toBe(1);
    expect(worth.assetsTotal.totals).toEqual([]);
  });

  it("leaves a DISPOSED Asset out, and keeps an ARCHIVED one in", async () => {
    /*
     * ASSET-02's split, applied to money: status is about the THING, archive is
     * about the RECORD. An Asset the owner sold is not part of their net worth;
     * an Asset whose record they tidied away still is — which is the same rule
     * Finance applies to a closed account.
     */
    const repo = assets();
    const sold = await repo.create({
      title: "Synthetic Ute",
      assetType: "vehicle",
    });
    const tidied = await repo.create({
      title: "Synthetic Mower",
      assetType: "tool",
    });
    const log = history();
    for (const asset of [sold, tidied]) {
      await log.recordEvent(asset.id, {
        category: "valuation",
        title: "Valuation",
        eventDate: "2026-08-01",
        value: "1000.00",
        currencyCode: "AUD",
      });
    }
    await repo.update(sold.id, { status: "disposed" });
    await repo.archive(tidied.id);

    const valuations = await finance().listLatestAssetValuations();
    expect(valuations.map((entry) => entry.title)).toEqual(["Synthetic Mower"]);
  });

  it("adds account balances and Asset values, per currency, converting nothing", async () => {
    const fin = finance();
    const everyday = await fin.createAccount({
      title: "Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-01-01",
      openingBalance: "2500.00",
    });
    const card = await fin.createAccount({
      title: "Card",
      accountType: "credit_card",
      currencyCode: "AUD",
      openingDate: "2026-01-01",
      openingBalance: "-400.00",
    });
    await fin.createAccount({
      title: "Cross-Tasman",
      accountType: "savings",
      currencyCode: "NZD",
      openingDate: "2026-01-01",
      openingBalance: "1000.00",
    });
    expect(everyday.id).not.toBe(card.id);

    const asset = await assets().create({
      title: "Synthetic Trailer",
      assetType: "vehicle",
    });
    await history().recordEvent(asset.id, {
      category: "valuation",
      title: "Valuation",
      eventDate: "2026-08-01",
      value: "7250.00",
      currencyCode: "AUD",
    });

    const accounts = await fin.listAccountsWithBalances({
      includeClosed: true,
    });
    const worth = computeNetWorth(
      accounts.map((entry) => ({
        accountId: entry.account.id,
        title: entry.account.title,
        accountType: entry.account.accountType,
        currencyCode: entry.account.currencyCode,
        balanceMinor: entry.balanceMinor,
        closed: entry.account.status === "closed",
      })),
      await fin.listLatestAssetValuations(),
    );

    /*
     * AUD: 2500.00 − 400.00 + 7250.00 = 9350.00. The credit card subtracts
     * because its balance is NEGATIVE, not because a rule says liabilities
     * subtract — there is no per-type branch in this arithmetic.
     *
     * NZD is its own figure. Unlike currencies are never summed, and DalyHub
     * never converts.
     */
    const aud = worth.total.totals.find(
      (entry) => entry.currencyCode === "AUD",
    );
    const nzd = worth.total.totals.find(
      (entry) => entry.currencyCode === "NZD",
    );
    expect(aud?.minorUnits).toBe(935_000);
    expect(nzd?.minorUnits).toBe(100_000);
    expect(worth.total.totals).toHaveLength(2);
    expect(worth.total.mixed).toBe(true);
  });

  it("closing an account changes what is offered, never what the arithmetic says", async () => {
    const fin = finance();
    const account = await fin.createAccount({
      title: "Old Everyday",
      accountType: "transaction",
      currencyCode: "AUD",
      openingDate: "2026-01-01",
      openingBalance: "1500.00",
    });
    await fin.updateAccount(account.id, { status: "closed" });

    /*
     * A list that ASKS to exclude closed accounts stops offering it. The
     * repository's default is inclusive, deliberately: the Finance home shows a
     * closed account with a note saying it still counts, and only the surfaces
     * that need somewhere to WRITE — the import target, the new-transaction
     * account — pass `includeClosed: false`.
     */
    const offered = await fin.listAccountsWithBalances({
      includeClosed: false,
    });
    expect(offered.map((entry) => entry.account.id)).not.toContain(account.id);

    // And the money is still there.
    const all = await fin.listAccountsWithBalances({ includeClosed: true });
    const worth = computeNetWorth(
      all.map((entry) => ({
        accountId: entry.account.id,
        title: entry.account.title,
        accountType: entry.account.accountType,
        currencyCode: entry.account.currencyCode,
        balanceMinor: entry.balanceMinor,
        closed: entry.account.status === "closed",
      })),
      [],
    );
    expect(
      worth.total.totals.find((entry) => entry.currencyCode === "AUD")
        ?.minorUnits,
    ).toBe(150_000);
    expect(totalMoney([{ minorUnits: 1, currencyCode: "AUD" }])).toBeDefined();
  });
});
