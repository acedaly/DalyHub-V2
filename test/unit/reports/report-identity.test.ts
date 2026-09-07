/**
 * V2.14 — `reportResultDigest`: "are these still the same figures?"
 *
 * The question exists because something else now holds a DERIVED artefact about
 * a result — an explanation written about it — and prose paired with numbers it
 * was not written about is worse than no prose. The digest is Reports' own: it
 * is computed from the result, it names no AI concept, and Reports acquires no
 * dependency by having one.
 *
 * Two properties, and the second is the one that makes it usable at all: it
 * changes when a FIGURE changes, and it does NOT change when only the clock
 * does. A digest that moved every second would fire on every request and mean
 * nothing.
 */

import { describe, expect, it } from "vitest";

import {
  reportResultDigest,
  reportResultSource,
  type ReportBlock,
  type ReportConfig,
  type ReportResult,
  type ReportRow,
} from "~/kernel/reports";

const CONFIG: ReportConfig = {
  version: 1,
  source: "finance",
  measure: "money_out",
  window: { kind: "preset", preset: "12-months" },
  breakdown: { by: "group", group: "category" },
  filters: {},
  sort: "value_desc",
  visual: "bars",
};

function row(over: Partial<ReportRow> = {}): ReportRow {
  return {
    key: "k",
    label: "Groceries",
    value: 62010,
    detail: 12,
    period: null,
    referenceId: "cat-1",
    ...over,
  };
}

function block(over: Partial<ReportBlock> = {}): ReportBlock {
  return {
    key: "AUD",
    currencyCode: "AUD",
    rows: [row()],
    total: 241032,
    recordCount: 48,
    remainder: null,
    ...over,
  };
}

function result(over: Partial<ReportResult> = {}): ReportResult {
  return {
    definition: CONFIG,
    source: "finance",
    measure: "money_out",
    shape: "grouped",
    unit: "money",
    window: {
      periodStart: "2025-09-08",
      periodEnd: "2026-09-07",
      startInstantIso: "2025-09-07T14:00:00.000Z",
      endInstantIso: "2026-09-07T13:59:59.999Z",
    } as ReportResult["window"],
    grain: null,
    blocks: [block()],
    bounded: false,
    bound: null,
    boundReason: null,
    notes: [],
    availability: "ok",
    computedAtIso: "2026-09-07T00:00:00.000Z",
    ...over,
  };
}

describe("the identity of a result", () => {
  it("is the same for the same figures", async () => {
    expect(await reportResultDigest(result())).toBe(
      await reportResultDigest(result()),
    );
  });

  it("does NOT move when only the clock does", async () => {
    /*
     * Two executions a second apart over unchanged data must agree, or the
     * freshness check fires on every request and stops meaning anything.
     */
    expect(
      await reportResultDigest(
        result({ computedAtIso: "2026-09-07T00:00:01.000Z" }),
      ),
    ).toBe(await reportResultDigest(result()));
  });

  it("moves when a row's VALUE moves", async () => {
    expect(
      await reportResultDigest(
        result({ blocks: [block({ rows: [row({ value: 62011 })] })] }),
      ),
    ).not.toBe(await reportResultDigest(result()));
  });

  it("moves when a total, a record count or a remainder moves", async () => {
    const base = await reportResultDigest(result());
    for (const changed of [
      block({ total: 241033 }),
      block({ recordCount: 49 }),
      block({ remainder: { groups: 2, value: 1, detail: null } }),
    ]) {
      expect(await reportResultDigest(result({ blocks: [changed] }))).not.toBe(
        base,
      );
    }
  });

  it("moves when a NOTE changes — a lost caveat is a different answer", async () => {
    expect(
      await reportResultDigest(
        result({
          notes: [
            {
              code: "standing",
              text: "Transfers are excluded.",
              tone: "neutral",
            },
          ],
        }),
      ),
    ).not.toBe(await reportResultDigest(result()));
  });

  it("moves when the window moves", async () => {
    expect(
      await reportResultDigest(
        result({
          window: {
            periodStart: "2025-01-01",
            periodEnd: "2026-01-01",
            startInstantIso: "2024-12-31T13:00:00.000Z",
            endInstantIso: "2026-01-01T12:59:59.999Z",
          } as ReportResult["window"],
        }),
      ),
    ).not.toBe(await reportResultDigest(result()));
  });

  it("is a hex SHA-256, and its source carries no timestamp", async () => {
    expect(await reportResultDigest(result())).toMatch(/^[0-9a-f]{64}$/);
    expect(reportResultSource(result())).not.toContain("2026-09-07T00:00:00");
  });
});
