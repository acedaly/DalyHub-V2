/**
 * ASSET-02 — the presentation derivations: timeline projection, cost and value
 * formatting, and the collection card signal.
 *
 * The Today deduplication rule left with the domain it belongs to in V2.10
 * LIFE-03: an obligation's subject may be an Asset, a Person or nothing at all,
 * so the rule is asserted in `test/unit/obligations/obligation-attention.test.ts`
 * against the kernel that now owns it.
 */

import { describe, expect, it } from "vitest";

import {
  formatHistoryDate,
  obligationSignal,
  serializeCostSummary,
  serializeValueHistory,
} from "~/modules/assets/asset-history-view";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

describe("formatHistoryDate", () => {
  it("formats a wall-calendar date without shifting it by a timezone", () => {
    expect(formatHistoryDate("2026-09-30")).toBe("30 September 2026");
    // The very edges of a day are the ones a timezone bug would move.
    expect(formatHistoryDate("2026-01-01")).toBe("1 January 2026");
    expect(formatHistoryDate("2026-12-31")).toBe("31 December 2026");
  });

  it("returns null for an absent or malformed date", () => {
    expect(formatHistoryDate(null)).toBeNull();
    expect(formatHistoryDate("not-a-date")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

describe("serializeCostSummary", () => {
  const summary = {
    currencyCode: "AUD",
    byGroup: { service: 40_000, repair: 25_050, renewal: 87_000, upgrade: 0 },
    ongoingTotalMinor: 152_050,
    purchasePriceMinor: 4_200_000,
    lifetimeTotalMinor: 4_352_050,
    costedEventCount: 3,
    mixedCurrency: false,
    excludedCurrencies: [],
  };

  it("omits a group with nothing recorded rather than showing a zero row", () => {
    const result = serializeCostSummary(summary);
    expect(result.lines.map((line) => line.group)).toEqual([
      "service",
      "repair",
      "renewal",
    ]);
  });

  it("keeps the purchase price separate from the ongoing total", () => {
    const result = serializeCostSummary(summary);
    expect(result.ongoingTotal).toContain("1,520.50");
    expect(result.purchasePrice).toContain("42,000.00");
    expect(result.lifetimeTotal).toContain("43,520.50");
  });

  it("offers no lifetime total when no purchase price is recorded", () => {
    const result = serializeCostSummary({
      ...summary,
      purchasePriceMinor: null,
      lifetimeTotalMinor: null,
    });
    expect(result.lifetimeTotal).toBeNull();
    expect(result.ongoingTotal).not.toBeNull();
  });

  it("reports an empty summary so the UI shows an empty state, not zeroes", () => {
    const result = serializeCostSummary({
      currencyCode: "AUD",
      byGroup: { service: 0, repair: 0, renewal: 0, upgrade: 0 },
      ongoingTotalMinor: 0,
      purchasePriceMinor: null,
      lifetimeTotalMinor: null,
      costedEventCount: 0,
      mixedCurrency: false,
      excludedCurrencies: [],
    });
    expect(result.isEmpty).toBe(true);
    expect(result.lines).toHaveLength(0);
  });

  it("passes the mixed-currency exclusion through to be stated, not hidden", () => {
    const result = serializeCostSummary({
      ...summary,
      mixedCurrency: true,
      excludedCurrencies: ["USD", "NZD"],
    });
    expect(result.mixedCurrency).toBe(true);
    expect(result.excludedCurrencies).toEqual(["USD", "NZD"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Value history                                                              */
/* -------------------------------------------------------------------------- */

describe("serializeValueHistory", () => {
  const point = (date: string, minor: number) => ({
    eventId: `e-${date}`,
    date,
    valueMinor: minor,
    currencyCode: "AUD",
    source: null,
  });

  it("says nothing at all when nothing is recorded", () => {
    const result = serializeValueHistory([]);
    expect(result.points).toHaveLength(0);
    expect(result.summary).toBeNull();
    expect(result.hasTrend).toBe(false);
  });

  it("refuses to call two points a trend", () => {
    const result = serializeValueHistory([
      point("2026-01-01", 3_800_000),
      point("2026-06-01", 3_550_000),
    ]);
    expect(result.hasTrend).toBe(false);
    expect(result.summary).toContain("too few to show a trend");
  });

  it("summarises a real trend in words, so the shape is never load-bearing", () => {
    const result = serializeValueHistory([
      point("2026-01-01", 3_800_000),
      point("2026-06-01", 3_550_000),
      point("2026-12-01", 3_200_000),
    ]);
    expect(result.hasTrend).toBe(true);
    expect(result.summary).toContain("fallen");
    expect(result.summary).toContain("3 valuations");
  });

  it("reports the newest recorded value as the current one", () => {
    const result = serializeValueHistory([
      point("2026-01-01", 3_800_000),
      point("2026-06-01", 3_550_000),
    ]);
    expect(result.currentAmount).toContain("35,500.00");
  });
});

/* -------------------------------------------------------------------------- */
/* The collection card signal                                                 */
/* -------------------------------------------------------------------------- */

describe("obligationSignal", () => {
  const base = {
    openCount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    nextDueDate: null as string | null,
    nextTitle: null as string | null,
    needsMeterReading: false,
  };

  it("shows nothing at all for an asset with no open obligations", () => {
    expect(obligationSignal(base)).toBeNull();
  });

  it("leads with overdue, which outranks everything else", () => {
    const signal = obligationSignal({
      ...base,
      openCount: 3,
      overdueCount: 2,
      dueSoonCount: 1,
    });
    expect(signal?.text).toBe("2 obligations overdue");
    expect(signal?.tone).toBe("danger");
  });

  it("falls back to due-soon, then to a needed reading, then to the next date", () => {
    expect(
      obligationSignal({ ...base, openCount: 1, dueSoonCount: 1 })?.text,
    ).toBe("1 obligation due soon");
    expect(
      obligationSignal({ ...base, openCount: 1, needsMeterReading: true })
        ?.text,
    ).toBe("Current meter reading needed");
    expect(
      obligationSignal({
        ...base,
        openCount: 1,
        nextDueDate: "2027-01-15",
        nextTitle: "Service",
      })?.text,
    ).toBe("Next: Service 15 January 2027");
  });

  it("uses the singular for one, so a card never reads '1 obligations'", () => {
    expect(
      obligationSignal({ ...base, openCount: 1, overdueCount: 1 })?.text,
    ).toBe("1 obligation overdue");
  });
});
