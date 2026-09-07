/**
 * V2.14 GROUND-03 — `ReportResult` → `FactBlock`.
 *
 * The conversion is pure, so it can be driven with a result built by hand and
 * asserted exactly. What is under test is the CONTRACT, not the arithmetic:
 * every note becomes a bound the answer is told not to contradict; a currency
 * never meets another; a total is kept when a row is dropped; and a figure that
 * is absent stays absent rather than becoming zero.
 */

import { describe, expect, it } from "vitest";

import { renderFactBlock } from "~/kernel/ai";
import type {
  ReportBlock,
  ReportConfig,
  ReportNote,
  ReportResult,
  ReportRow,
} from "~/kernel/reports";
import { reportFactBlock } from "~/platform/ai";

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

function build(over: Partial<ReportResult> = {}, maxFacts = 48) {
  return reportFactBlock({
    result: result(over),
    title: "Spending by category",
    question: "Where did my money go over the last year?",
    href: "/reports/spend-by-category",
    maxFacts,
  });
}

describe("what the block carries", () => {
  it("names the report and the period it is about", () => {
    const built = build();
    expect(built.intent).toBe("report_explanation");
    expect(built.subject).toBe("Spending by category");
    expect(built.period).toMatchObject({
      startIso: "2025-09-08",
      endIso: "2026-09-07",
    });
  });

  it("formats money the way the report formats it, and keeps the minor units", () => {
    const built = build();
    const total = built.facts.find((fact) => fact.label.startsWith("Total"));
    expect(total?.display).toBe("$2,410.32");
    expect(total?.value).toMatchObject({
      kind: "money",
      minorUnits: 241032,
      currencyCode: "AUD",
    });
  });

  it("links a category row back to the transactions behind it", () => {
    const built = build();
    const groceries = built.facts.find((fact) =>
      fact.label.startsWith("Groceries"),
    );
    expect(groceries?.reference).toMatchObject({
      kind: "category",
      href: "/finance/transactions?category=cat-1",
    });
  });

  it("keeps an ABSENT reading absent rather than calling it zero", () => {
    const built = build({
      unit: "value",
      shape: "series",
      blocks: [
        {
          key: "single",
          currencyCode: null,
          rows: [row({ value: null, referenceId: null, detail: null })],
          total: null,
          recordCount: null,
          remainder: null,
        },
      ],
    });
    const fact = built.facts[0];
    expect(fact?.value).toEqual({ kind: "absent" });
    expect(fact?.display).toBe("no reading");
  });
});

describe("bounds travel with the claim", () => {
  const notes: readonly ReportNote[] = [
    {
      code: "standing",
      text: "Transfers between your own accounts are excluded.",
      tone: "neutral",
    },
    {
      code: "bounded_groups",
      text: "Only the largest 24 categories are listed.",
      tone: "neutral",
    },
    {
      code: "mixed_currency",
      text: "More than one currency is present.",
      tone: "warning",
    },
  ];

  it("turns every report note into a bound the answer is given", () => {
    const built = build({ notes });
    expect(built.bounds.map((bound) => bound.code)).toEqual([
      "standing",
      "bounded",
      "mixed_currency",
    ]);
    const rendered = renderFactBlock(built);
    for (const note of notes) expect(rendered).toContain(note.text);
    expect(rendered).toContain("bounds you must not contradict");
  });

  it("says an unavailable report has nothing to explain", () => {
    const built = build({ availability: "unavailable", blocks: [] });
    expect(built.facts).toHaveLength(0);
    expect(built.bounds.some((bound) => bound.code === "no_records")).toBe(
      true,
    );
  });

  it("keeps the remainder as an arithmetic fact, with what it folded in", () => {
    const built = build({
      blocks: [block({ remainder: { groups: 9, value: 15000, detail: 30 } })],
    });
    const remainder = built.facts.find((fact) =>
      fact.label.startsWith("Everything else"),
    );
    expect(remainder?.display).toBe("$150.00");
    expect(remainder?.note).toContain("9 further groups");
  });
});

describe("currencies never meet", () => {
  it("keeps one block per currency and lists both", () => {
    const built = build({
      blocks: [
        block(),
        block({
          key: "NZD",
          currencyCode: "NZD",
          total: 5000,
          recordCount: 2,
          rows: [row({ label: "Travel", value: 5000, referenceId: "cat-2" })],
        }),
      ],
    });
    expect(built.currencies).toEqual(["AUD", "NZD"]);
    const labels = built.facts.map((fact) => fact.label);
    expect(labels.some((label) => label.includes("(AUD)"))).toBe(true);
    expect(labels.some((label) => label.includes("(NZD)"))).toBe(true);
    expect(renderFactBlock(built)).toContain("never combined");
  });
});

describe("the ceiling keeps the totals, not the tail", () => {
  it("drops ROWS before it drops a block's own figures", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      row({
        key: `k${index}`,
        label: `Category ${index}`,
        value: 1000 - index,
        referenceId: `cat-${index}`,
      }),
    );
    const built = build({ blocks: [block({ rows })] }, 6);
    expect(built.facts).toHaveLength(6);
    // The block's total and record count come first, whatever else is cut.
    expect(built.facts[0]?.label.startsWith("Total")).toBe(true);
    expect(built.facts[1]?.label.startsWith("Records counted")).toBe(true);
    expect(built.truncated).toBe(true);
  });
});
