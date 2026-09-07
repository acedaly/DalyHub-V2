/**
 * V2.13 RPT-03 — the executor's ASSEMBLY rules, against fake adapters.
 *
 * The adapters' own correctness is proven against real D1 in
 * `test/kernel/reports.test.ts`; what is proven here is everything the executor
 * decides on their behalf, because those decisions are the ones a single
 * careless adapter could otherwise get wrong on its own:
 *
 *   - an empty bucket is `0` for a FLOW and ABSENT for a LEVEL;
 *   - unlike currencies land in separate BLOCKS and are never added;
 *   - a bounded grouped result carries an arithmetically truthful remainder;
 *   - a failed read is "not available", never a zero;
 *   - a grain the window cannot hold is REFUSED, never truncated;
 *   - every standing approximation the registry declares reaches the result.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_REPORT_GROUPS,
  REPORT_CONFIG_VERSION,
  executeReport,
  type ReportCell,
  type ReportConfig,
  type ReportExecutionContext,
  type ReportRead,
  type ReportResult,
} from "~/kernel/reports";

const TODAY = "2026-09-07";

/** Owner-local midnight in Australia/Sydney (UTC+10, standard time in September). */
const startOfOwnerDay = (dayIso: string): Date | null =>
  new Date(`${dayIso}T00:00:00.000+10:00`);

function context(
  read: ReportRead | (() => Promise<ReportRead>),
  overrides: Partial<ReportExecutionContext> = {},
): ReportExecutionContext {
  const adapter = typeof read === "function" ? read : async () => read;
  return {
    todayIso: TODAY,
    startOfOwnerDay,
    availableSources: ["tasks", "goals", "projects", "obligations", "finance"],
    adapters: {
      tasks: adapter,
      goals: adapter,
      projects: adapter,
      obligations: adapter,
      finance: adapter,
    },
    now: new Date("2026-09-07T02:00:00.000Z"),
    ...overrides,
  };
}

function config(overrides: Partial<ReportConfig> = {}): ReportConfig {
  return {
    version: REPORT_CONFIG_VERSION,
    source: "finance",
    measure: "money_out",
    window: { kind: "preset", preset: "12-months" },
    breakdown: { by: "group", group: "category" },
    filters: {},
    sort: "value_desc",
    visual: "bars",
    ...overrides,
  };
}

async function run(
  definition: ReportConfig,
  read: ReportRead | (() => Promise<ReportRead>),
  overrides: Partial<ReportExecutionContext> = {},
): Promise<ReportResult> {
  const execution = await executeReport(definition, context(read, overrides));
  if (!execution.ok) {
    throw new Error(
      `expected a result, got a refusal: ${execution.refusal.code}`,
    );
  }
  return execution.result;
}

const cell = (
  over: Partial<ReportCell> & Pick<ReportCell, "key">,
): ReportCell => ({
  label: over.key,
  currencyCode: null,
  value: 0,
  ...over,
});

describe("currency", () => {
  it("puts unlike currencies in separate blocks and never adds them", async () => {
    const result = await run(config(), {
      cells: [
        cell({
          key: "groceries",
          label: "Groceries",
          currencyCode: "AUD",
          value: 42_000,
        }),
        cell({
          key: "rent",
          label: "Rent",
          currencyCode: "AUD",
          value: 120_000,
        }),
        cell({
          key: "travel",
          label: "Travel",
          currencyCode: "GBP",
          value: 8_000,
        }),
      ],
    });

    expect(result.blocks.map((block) => block.currencyCode)).toEqual([
      "AUD",
      "GBP",
    ]);
    expect(result.blocks[0].total).toBe(162_000);
    expect(result.blocks[1].total).toBe(8_000);
    // The sum that must never exist anywhere in the result.
    expect(result.blocks.some((block) => block.total === 170_000)).toBe(false);
    expect(result.notes.map((note) => note.code)).toContain("mixed_currency");
  });

  it("gives a count measure exactly one block, with no currency", async () => {
    const result = await run(
      config({
        source: "tasks",
        measure: "completed_count",
        breakdown: { by: "group", group: "area" },
      }),
      { cells: [cell({ key: "a", label: "Health", value: 12 })] },
    );
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].currencyCode).toBeNull();
    expect(result.notes.map((note) => note.code)).not.toContain(
      "mixed_currency",
    );
  });
});

describe("empty buckets", () => {
  it("fills a FLOW's silent bucket with a true zero", async () => {
    const result = await run(
      config({
        source: "finance",
        measure: "money_in",
        breakdown: { by: "time", grain: "month" },
        sort: "chronological",
        visual: "trend",
      }),
      {
        cells: [
          cell({
            key: "b0",
            label: "Oct 2025",
            currencyCode: "AUD",
            value: 500_000,
          }),
        ],
      },
    );
    const block = result.blocks[0];
    expect(block.rows).toHaveLength(12);
    expect(block.rows[0].value).toBe(500_000);
    expect(block.rows.slice(1).every((row) => row.value === 0)).toBe(true);
    expect(block.rows.every((row) => row.period !== null)).toBe(true);
  });

  it("leaves a LEVEL's silent bucket ABSENT, never zero", async () => {
    const result = await run(
      config({
        source: "goals",
        measure: "measurement_value",
        window: { kind: "preset", preset: "12-months" },
        breakdown: { by: "time", grain: "month" },
        filters: { goalId: "goal-1" },
        sort: "chronological",
        visual: "trend",
      }),
      { cells: [cell({ key: "b11", label: "Sep 2026", value: 71.4 })] },
    );
    const block = result.blocks[0];
    expect(block.rows).toHaveLength(12);
    expect(block.rows[11].value).toBe(71.4);
    // A month with no weigh-in is neither 70 kg nor 0 kg.
    expect(block.rows.slice(0, 11).every((row) => row.value === null)).toBe(
      true,
    );
    expect(block.rows.some((row) => row.value === 0)).toBe(false);
    // And twelve monthly weigh-ins do not add up to anything.
    expect(block.total).toBeNull();
  });
});

describe("boundedness", () => {
  it("folds groups beyond the cap into a truthful remainder", async () => {
    const cells = Array.from(
      { length: MAX_REPORT_GROUPS + 5 },
      (_unused, index) =>
        cell({
          key: `c${index}`,
          label: `Category ${index}`,
          currencyCode: "AUD",
          // Descending, so the folded rows are the smallest five: 4+3+2+1+0.
          value: MAX_REPORT_GROUPS + 4 - index,
        }),
    );
    const result = await run(config(), { cells });
    const block = result.blocks[0];

    expect(block.rows).toHaveLength(MAX_REPORT_GROUPS);
    expect(block.remainder).toEqual({
      groups: 5,
      value: 4 + 3 + 2 + 1 + 0,
      detail: 0,
    });
    // The point of the remainder: the total still adds up.
    const everyValue = cells.reduce(
      (sum, entry) => sum + (entry.value ?? 0),
      0,
    );
    expect(block.total).toBe(everyValue);
    expect(result.bounded).toBe(true);
    expect(result.notes.map((note) => note.code)).toContain("bounded_groups");
  });

  it("carries the history kernel's own series bound through", async () => {
    // 24 months at a week grain needs 105 buckets against a maximum of 52.
    const result = await run(
      config({
        window: { kind: "preset", preset: "24-months" },
        breakdown: { by: "time", grain: "month" },
        sort: "chronological",
        visual: "trend",
      }),
      { cells: [] },
    );
    expect(result.blocks[0].rows).toHaveLength(24);
    expect(result.bounded).toBe(false);
  });
});

describe("refusals and failures", () => {
  it("REFUSES a grain the window cannot hold, rather than shortening it", async () => {
    // A year is 53 weekly buckets against a maximum of 52 — the INS-03 rule.
    const execution = await executeReport(
      config({
        source: "tasks",
        measure: "completed_count",
        window: { kind: "preset", preset: "12-months" },
        breakdown: { by: "time", grain: "week" },
        sort: "chronological",
        visual: "trend",
      }),
      context({ cells: [] }),
    );
    expect(execution.ok).toBe(false);
    if (!execution.ok) {
      expect(execution.refusal.code).toBe("grain_exceeds_maximum");
      expect(execution.refusal.message).toMatch(/nothing has been shortened/i);
    }
  });

  it("refuses a source whose module the owner has turned off", async () => {
    const execution = await executeReport(
      config(),
      context({ cells: [] }, { availableSources: ["tasks"] }),
    );
    expect(execution.ok).toBe(false);
    if (!execution.ok)
      expect(execution.refusal.code).toBe("source_unavailable");
  });

  it("reports a FAILED read as unavailable, never as a zero", async () => {
    const result = await run(config(), async () => {
      throw new Error("D1 fell over");
    });
    expect(result.availability).toBe("unavailable");
    expect(result.blocks).toEqual([]);
    // The question it could not answer is still named.
    expect(result.definition.measure).toBe("money_out");
    expect(result.window.periodEnd).toBe(TODAY);
  });

  it("says NOTHING MATCHED rather than drawing an empty chart", async () => {
    const result = await run(config(), { cells: [] });
    expect(result.availability).toBe("ok");
    expect(result.notes.map((note) => note.code)).toContain("no_records");
  });
});

describe("notes", () => {
  it("always carries the measure's standing approximation", async () => {
    const result = await run(
      config({
        source: "tasks",
        measure: "completed_count",
        breakdown: { by: "group", group: "area" },
      }),
      { cells: [cell({ key: "a", label: "Health", value: 3 })] },
    );
    const standing = result.notes.find((note) => note.code === "standing");
    // DEBT-251: the approximation travels with the claim, every time.
    expect(standing?.text).toMatch(/where each Task sits today/i);
  });

  it("says when a window is FIXED rather than moving with the calendar", async () => {
    const result = await run(
      config({
        window: {
          kind: "custom",
          startIso: "2026-01-01",
          endIso: "2026-06-30",
        },
      }),
      { cells: [] },
    );
    expect(result.notes.map((note) => note.code)).toContain("fixed_window");
    expect(result.window.periodStart).toBe("2026-01-01");
    expect(result.window.periodEnd).toBe("2026-06-30");
  });

  it("passes an adapter's own exclusions through", async () => {
    const result = await run(config(), {
      cells: [],
      notes: [
        {
          code: "excluded",
          text: "Two commitments repeat on a meter and were excluded.",
          tone: "warning",
        },
      ],
    });
    expect(result.notes.map((note) => note.code)).toContain("excluded");
  });
});

describe("ordering", () => {
  it("orders a grouped result by value, largest first", async () => {
    const result = await run(config(), {
      cells: [
        cell({ key: "a", label: "Alpha", currencyCode: "AUD", value: 10 }),
        cell({ key: "b", label: "Bravo", currencyCode: "AUD", value: 90 }),
        cell({ key: "c", label: "Charlie", currencyCode: "AUD", value: 50 }),
      ],
    });
    expect(result.blocks[0].rows.map((row) => row.label)).toEqual([
      "Bravo",
      "Charlie",
      "Alpha",
    ]);
  });

  it("orders a month group by its sort key, not alphabetically", async () => {
    const result = await run(
      config({
        source: "obligations",
        measure: "due_count",
        window: { kind: "ahead", days: 90 },
        breakdown: { by: "group", group: "month" },
        sort: "label_asc",
      }),
      {
        cells: [
          cell({
            key: "2026-11",
            label: "November 2026",
            value: 2,
            sortKey: "2026-11",
          }),
          cell({
            key: "2026-09",
            label: "September 2026",
            value: 5,
            sortKey: "2026-09",
          }),
          cell({
            key: "2026-10",
            label: "October 2026",
            value: 3,
            sortKey: "2026-10",
          }),
        ],
      },
    );
    expect(result.blocks[0].rows.map((row) => row.label)).toEqual([
      "September 2026",
      "October 2026",
      "November 2026",
    ]);
  });

  it("sorts an ABSENT value last, whichever way the numbers go", async () => {
    const result = await run(config({ sort: "value_asc" }), {
      cells: [
        cell({ key: "a", label: "Alpha", currencyCode: "AUD", value: null }),
        cell({ key: "b", label: "Bravo", currencyCode: "AUD", value: 5 }),
      ],
    });
    // "No reading" is not the smallest reading.
    expect(result.blocks[0].rows.map((row) => row.label)).toEqual([
      "Bravo",
      "Alpha",
    ]);
  });
});

describe("the window", () => {
  it("resolves a preset backwards from the owner's today", async () => {
    const result = await run(config(), { cells: [] });
    expect(result.window.periodEnd).toBe(TODAY);
    expect(result.window.periodStart).toBe("2025-09-08");
  });

  it("resolves an AHEAD window forwards, inclusive of today", async () => {
    const result = await run(
      config({
        source: "obligations",
        measure: "due_count",
        window: { kind: "ahead", days: 90 },
        breakdown: { by: "group", group: "month" },
        sort: "label_asc",
      }),
      { cells: [] },
    );
    expect(result.window.periodStart).toBe(TODAY);
    expect(result.window.periodEnd).toBe("2026-12-05");
  });

  it("resolves owner-local midnights, not UTC ones", async () => {
    const result = await run(config(), { cells: [] });
    // Sydney is UTC+10 in September, so the owner's day starts at 14:00 UTC.
    expect(result.window.startInstantIso).toBe("2025-09-07T14:00:00.000Z");
  });
});
