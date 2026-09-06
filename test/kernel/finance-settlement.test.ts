/**
 * V2.12 FIN-04 — settling an Obligation with a Transaction, against real D1.
 *
 * The seam this file proves is deliberately narrow and one-way: Finance
 * implements `ObligationSettlementGateway` and the obligation repository reads
 * through it; Life Admin never joins a Finance table, and Finance never writes
 * to `obligation_details`. Everything below is asserted through the two
 * products' own repositories rather than by reading columns, because the
 * columns are an implementation detail and the behaviour is not.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `SYNTHETIC ENERGY CO`.
 * No real owner financial data exists in this repository.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import { ObligationValidationError } from "~/kernel/obligations";

import {
  FakeClock,
  makeContext,
  makeFinanceRepository,
  makeObligationRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_finance_settlement_other";

function finance(ws = WS, prefix = "sf") {
  return makeFinanceRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function obligations(ws = WS, prefix = "so") {
  return makeObligationRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

/** An everyday account in AUD, opened at zero. */
async function account(repo = finance(), currencyCode = "AUD") {
  return repo.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode,
    openingDate: "2026-01-01",
    institution: "Bank of Synthetica",
  });
}

/** A money-OUT transaction — the shape that can settle a bill. */
async function payment(
  repo = finance(),
  accountId: string,
  amount = "-182.40",
  occurredOn = "2026-09-04",
) {
  return repo.createTransaction({
    accountId,
    occurredOn,
    amount,
    payeeDisplay: "SYNTHETIC ENERGY CO",
  });
}

/** A money-bearing obligation due in September. */
async function bill(repo = obligations(), expectedAmount = "180.00") {
  return repo.create({
    category: "bill",
    title: "Electricity",
    dueDate: "2026-09-05",
    expectedAmount,
    currencyCode: "AUD",
  });
}

describe("V2.12 FIN-04 — a transaction settles an obligation", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("takes the amount and the date from the BANK, not from the owner", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id, "-182.40", "2026-09-04");
    const owed = await bill(obs);

    await obs.complete(owed.id, { settledByTransactionId: paid.id });

    const after = await obs.get(owed.id);
    expect(after?.status).toBe("completed");
    /*
     * The obligation EXPECTED $180.00 and the bank took $182.40. The completion
     * records what actually happened, which is the whole point of settling
     * against a transaction rather than typing a figure that agrees with the
     * bill.
     *
     * The figure is a POSITIVE magnitude, and the gateway is where the two
     * conventions meet: Finance signs its amounts (negative is money out), and
     * an obligation's amount is what it COST — `obligation_details` CHECKs it
     * non-negative, and its expected amount is stored the same way. Carrying
     * the sign across would put a minus on every completed bill in Life Admin.
     */
    expect(after?.completedAmountMinor).toBe(18_240);
    expect(after?.completedOn).toBe("2026-09-04");
    expect(after?.settledByTransactionId).toBe(paid.id);
  });

  it("refuses a typed amount beside a settlement, rather than silently picking one", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const owed = await bill(obs);

    await expect(
      obs.complete(owed.id, {
        settledByTransactionId: paid.id,
        completedAmount: "180.00",
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);

    // And nothing was written: a refused completion leaves the obligation open.
    expect((await obs.get(owed.id))?.status).toBe("open");
  });

  it("refuses a chosen date beside a settlement, for the same reason", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const owed = await bill(obs);

    await expect(
      obs.complete(owed.id, {
        settledByTransactionId: paid.id,
        completedOn: "2026-09-05",
      }),
    ).rejects.toBeInstanceOf(ObligationValidationError);
  });

  it("refuses money COMING IN, because a refund cannot pay a bill", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const refund = await fin.createTransaction({
      accountId: acct.id,
      occurredOn: "2026-09-04",
      amount: "182.40",
      payeeDisplay: "SYNTHETIC ENERGY CO REFUND",
    });
    const owed = await bill(obs);

    await expect(
      obs.complete(owed.id, { settledByTransactionId: refund.id }),
    ).rejects.toThrow(/money coming in/);
  });

  it("refuses a transaction that already settles ANOTHER obligation", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const first = await bill(obs);
    const second = await obs.create({
      category: "bill",
      title: "Water",
      dueDate: "2026-09-06",
      expectedAmount: "60.00",
      currencyCode: "AUD",
    });

    await obs.complete(first.id, { settledByTransactionId: paid.id });

    await expect(
      obs.complete(second.id, { settledByTransactionId: paid.id }),
    ).rejects.toThrow(/already settles another obligation/);

    /*
     * The database says the same thing independently: a partial unique index on
     * `(workspace_id, settled_by_transaction_id)` makes one transaction settling
     * two obligations impossible even if this check were removed. The refusal
     * above is the sentence; the index is the guarantee.
     */
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM obligation_details WHERE workspace_id = ? AND settled_by_transaction_id = ?",
    )
      .bind(WS, paid.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("refuses a transaction in a different currency, because nothing is converted", async () => {
    const fin = finance();
    const obs = obligations();
    const nzAccount = await fin.createAccount({
      title: "Cross-Tasman",
      accountType: "transaction",
      currencyCode: "NZD",
      openingDate: "2026-01-01",
    });
    const paid = await payment(fin, nzAccount.id);
    const owed = await bill(obs);

    await expect(
      obs.complete(owed.id, { settledByTransactionId: paid.id }),
    ).rejects.toThrow(/never converted/);
  });

  it("refuses a transaction from ANOTHER workspace as one that does not exist", async () => {
    const theirs = finance(OTHER, "of");
    const theirAccount = await account(theirs);
    const theirPayment = await payment(theirs, theirAccount.id);

    const obs = obligations();
    const owed = await bill(obs);

    /*
     * "is not a transaction in this workspace" — the same sentence an id that
     * never existed gets. A workspace must not learn that a record exists
     * elsewhere from the shape of a refusal.
     */
    await expect(
      obs.complete(owed.id, { settledByTransactionId: theirPayment.id }),
    ).rejects.toThrow(/is not a transaction in this workspace/);
  });

  it("refuses an id that is not a transaction at all, with the same sentence", async () => {
    const obs = obligations();
    const owed = await bill(obs);

    await expect(
      obs.complete(owed.id, { settledByTransactionId: owed.id }),
    ).rejects.toThrow(/is not a transaction in this workspace/);
  });

  it("projects the settlement as an EntityLink in the same write", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const owed = await bill(obs);

    await obs.complete(owed.id, { settledByTransactionId: paid.id });

    /*
     * ADR-118's shape, applied to a second relationship: the authoritative FK
     * and its reserved EntityLink projection are written in ONE batch, so the
     * two representations cannot disagree. The link is read directly here
     * precisely because no product surface offers it — it is excluded from the
     * generic picker for the same reason the subject link is.
     */
    const link = await env.DB.prepare(
      "SELECT source_entity_id, target_entity_id, type FROM entity_links WHERE workspace_id = ? AND source_entity_id = ? AND type = 'obligation.settled_by' AND deleted_at IS NULL",
    )
      .bind(WS, owed.id)
      .first<{
        source_entity_id: string;
        target_entity_id: string;
        type: string;
      }>();
    expect(link?.target_entity_id).toBe(paid.id);
  });

  it("carries no AMOUNT into the Activity payload", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id, "-182.40");
    const owed = await bill(obs);

    await obs.complete(owed.id, { settledByTransactionId: paid.id });

    /*
     * The feed records THAT a transaction settled it, never how much. An
     * Activity payload is read by the whole product and lives forever; an
     * amount in one is an amount in a place nobody decided to put it
     * (ADR-049 decision 5).
     */
    const rows = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE workspace_id = ? AND type = 'obligation.completed'",
    )
      .bind(WS)
      .all<{ payload_json: string }>();
    expect(rows.results.length).toBeGreaterThan(0);
    for (const row of rows.results) {
      expect(row.payload_json).toContain("settledByTransaction");
      expect(row.payload_json).not.toContain("18240");
      expect(row.payload_json).not.toContain("182.40");
      expect(row.payload_json).not.toContain("18000");
    }
  });

  it("reports the settlement on the month's commitments, from Finance's own read", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const owed = await bill(obs);

    const before = await fin.listExpectedCommitments("2026-09");
    expect(before).toHaveLength(1);
    expect(before[0]?.settledByTransactionId).toBeNull();
    expect(before[0]?.expectedAmountMinor).toBe(18_000);

    await obs.complete(owed.id, { settledByTransactionId: paid.id });

    const after = await fin.listExpectedCommitments("2026-09");
    expect(after[0]?.settledByTransactionId).toBe(paid.id);
  });

  it("clears the settlement when the obligation is deleted, so the transaction is free again", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id);
    const first = await bill(obs);

    await obs.complete(first.id, { settledByTransactionId: paid.id });
    await obs.delete(first.id);

    /*
     * The recovery path, and the only one: V2.10 refuses to REOPEN a completed
     * obligation ("cannot be changed once the obligation is completed"), so an
     * owner who settled the wrong bill deletes it and makes it again. That has
     * to actually free the transaction, or the second attempt would be refused
     * by the first attempt's mistake.
     */
    const second = await obs.create({
      category: "bill",
      title: "Electricity",
      dueDate: "2026-09-05",
      expectedAmount: "180.00",
      currencyCode: "AUD",
    });
    await expect(
      obs.complete(second.id, { settledByTransactionId: paid.id }),
    ).resolves.toBeDefined();
  });

  it("says what a transaction settled, through the gateway Finance implements", async () => {
    const fin = finance();
    const obs = obligations();
    const acct = await account(fin);
    const paid = await payment(fin, acct.id, "-182.40", "2026-09-04");
    const owed = await bill(obs);

    /*
     * A positive magnitude and a separate `inflow` flag, rather than a signed
     * figure: the reader is Life Admin, whose amounts are magnitudes, and the
     * direction it actually needs to know is "was this money going out?" —
     * which it refuses on rather than a sign it would have to interpret.
     */
    const before = await fin.resolveSettlement(paid.id);
    expect(before).toEqual({
      amountMinor: 18_240,
      currencyCode: "AUD",
      occurredOn: "2026-09-04",
      inflow: false,
      settlesObligationId: null,
    });

    await obs.complete(owed.id, { settledByTransactionId: paid.id });

    expect((await fin.resolveSettlement(paid.id))?.settlesObligationId).toBe(
      owed.id,
    );
  });

  it("resolves nothing for a transaction in another workspace", async () => {
    const theirs = finance(OTHER, "of");
    const theirAccount = await account(theirs);
    const theirPayment = await payment(theirs, theirAccount.id);

    expect(await finance().resolveSettlement(theirPayment.id)).toBeNull();
  });
});
