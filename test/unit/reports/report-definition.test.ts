/**
 * V2.13 RPT-00/RPT-01 — the report DEFINITION: what it accepts, what it refuses,
 * and what it refuses to guess at.
 *
 * The rules under test are the ones that make a saved question safe to restore
 * from an untrusted blob or a hand-edited URL, and safe to keep answering for
 * years: parsing is TOTAL, the QUESTION half is never defaulted, the
 * PRESENTATION half is, serialisation is CANONICAL, and every unsupported
 * combination is refused rather than quietly converted into a different report.
 */

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_REPORTS,
  MAX_AHEAD_DAYS,
  MAX_CUSTOM_DAYS,
  REPORT_CODEC,
  REPORT_CONFIG_VERSION,
  REPORT_FILTER_KEYS,
  REPORT_MEASURE_DEFINITIONS,
  REPORT_SOURCE_DEFINITIONS,
  availableReportSources,
  findBuiltInReport,
  isBuiltInReportId,
  measureBreakdowns,
  parseReportDefinition,
  reportDefinitionsEqual,
  reportFilterCount,
  reportMeasure,
  serialiseReportDefinition,
  supportsBreakdown,
  validateReportDefinitionForWrite,
  type ReportConfig,
} from "~/kernel/reports";
import { SAVED_VIEW_KINDS } from "~/kernel/views";

/** A definition that is valid in every respect, as a starting point. */
const SPEND: ReportConfig = {
  version: REPORT_CONFIG_VERSION,
  source: "finance",
  measure: "money_out",
  window: { kind: "preset", preset: "12-months" },
  breakdown: { by: "group", group: "category" },
  filters: {},
  sort: "value_desc",
  visual: "bars",
};

function parseOk(raw: unknown): ReportConfig {
  const parsed = parseReportDefinition(raw);
  if (!parsed.ok) {
    throw new Error(`expected a readable definition, got ${parsed.reason}`);
  }
  return parsed.config;
}

describe("the report definition", () => {
  it("round-trips a valid definition unchanged", () => {
    const config = parseOk(SPEND);
    expect(config).toEqual(SPEND);
  });

  it("is a saved-view KIND, not a table", () => {
    expect(SAVED_VIEW_KINDS).toContain("report");
    expect(REPORT_CODEC.kind).toBe("report");
    expect(REPORT_CODEC.version).toBe(REPORT_CONFIG_VERSION);
  });

  it("serialises canonically, so equality is text equality", () => {
    const a = parseReportDefinition({ ...SPEND, filters: {} });
    const b = parseReportDefinition({
      // The same question, written with the keys in a different order.
      visual: "bars",
      sort: "value_desc",
      filters: {},
      breakdown: { group: "category", by: "group" },
      window: { preset: "12-months", kind: "preset" },
      measure: "money_out",
      source: "finance",
      version: REPORT_CONFIG_VERSION,
    });
    expect(serialiseReportDefinition(a)).toBe(serialiseReportDefinition(b));
    expect(reportDefinitionsEqual(a, b)).toBe(true);
  });

  it("never throws, whatever it is handed", () => {
    for (const raw of [
      null,
      undefined,
      42,
      "a string",
      [],
      {},
      { version: "one" },
      { version: 1 },
      { version: 1, source: "finance" },
    ]) {
      expect(() => parseReportDefinition(raw)).not.toThrow();
      expect(parseReportDefinition(raw).ok).toBe(false);
    }
  });
});

describe("the QUESTION half is never guessed at", () => {
  it("refuses an unknown source rather than defaulting one", () => {
    const parsed = parseReportDefinition({ ...SPEND, source: "payroll" });
    expect(parsed).toMatchObject({ ok: false, reason: "unknown_source" });
  });

  it("refuses an unknown measure", () => {
    const parsed = parseReportDefinition({ ...SPEND, measure: "vibes" });
    expect(parsed).toMatchObject({ ok: false, reason: "unknown_measure" });
  });

  it("refuses a measure that belongs to another source", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      measure: "completed_count",
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unknown_measure" });
  });

  it("refuses a version this build does not know", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      version: REPORT_CONFIG_VERSION + 1,
    });
    expect(parsed).toMatchObject({
      ok: false,
      reason: "unknown_version",
      version: REPORT_CONFIG_VERSION + 1,
    });
  });

  it("refuses a group the measure does not support", () => {
    // Finance money cannot be grouped by Project: no read answers it.
    const parsed = parseReportDefinition({
      ...SPEND,
      breakdown: { by: "group", group: "project" },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses a grain the measure does not support", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      breakdown: { by: "time", grain: "day" },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses review_period, which no measure offers", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      breakdown: { by: "time", grain: "review_period" },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses a window kind the measure does not offer", () => {
    // Finance reads the past; `ahead` belongs to obligations.
    const parsed = parseReportDefinition({
      ...SPEND,
      window: { kind: "ahead", days: 90 },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses an UNKNOWN filter key instead of ignoring it", () => {
    /*
     * The load-bearing difference from a cross-module view. Dropping a filter
     * widens a LIST, which the owner can see. Dropping one here widens a TOTAL,
     * which is indistinguishable from the figure they saved.
     */
    const parsed = parseReportDefinition({
      ...SPEND,
      filters: { payeeContains: "WOOLWORTHS" },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses a filter the measure does not understand", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      filters: { areaId: "area-1" },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses a definition missing a REQUIRED filter", () => {
    const parsed = parseReportDefinition({
      version: REPORT_CONFIG_VERSION,
      source: "goals",
      measure: "measurement_value",
      window: { kind: "preset", preset: "12-months" },
      breakdown: { by: "time", grain: "month" },
      filters: {},
      sort: "chronological",
      visual: "trend",
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses two answers to one question", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      filters: { categoryId: "cat-1", uncategorised: true },
    });
    expect(parsed).toMatchObject({ ok: false, reason: "unreadable_question" });
  });

  it("refuses an inverted or over-long custom window rather than clamping it", () => {
    expect(
      parseReportDefinition({
        ...SPEND,
        window: {
          kind: "custom",
          startIso: "2026-09-01",
          endIso: "2026-01-01",
        },
      }).ok,
    ).toBe(false);
    expect(
      parseReportDefinition({
        ...SPEND,
        window: {
          kind: "custom",
          startIso: "2020-01-01",
          endIso: "2026-01-01",
        },
      }).ok,
    ).toBe(false);
    // A day the calendar does not have is a refusal, not a rolled-forward date.
    expect(
      parseReportDefinition({
        ...SPEND,
        window: {
          kind: "custom",
          startIso: "2026-02-31",
          endIso: "2026-03-01",
        },
      }).ok,
    ).toBe(false);
  });

  it("accepts a custom window exactly at the bound", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      window: { kind: "custom", startIso: "2024-01-01", endIso: "2026-12-31" },
    });
    // 2024 (366) + 2025 (365) + 2026 (365) = 1096 days, the documented maximum.
    expect(MAX_CUSTOM_DAYS).toBe(1096);
    expect(parsed.ok).toBe(true);
  });

  it("refuses an ahead window beyond its bound", () => {
    const config = {
      version: REPORT_CONFIG_VERSION,
      source: "obligations",
      measure: "due_count",
      breakdown: { by: "group", group: "month" },
      filters: {},
      sort: "label_asc",
      visual: "bars",
    };
    expect(
      parseReportDefinition({
        ...config,
        window: { kind: "ahead", days: MAX_AHEAD_DAYS },
      }).ok,
    ).toBe(true);
    expect(
      parseReportDefinition({
        ...config,
        window: { kind: "ahead", days: MAX_AHEAD_DAYS + 1 },
      }).ok,
    ).toBe(false);
    expect(
      parseReportDefinition({ ...config, window: { kind: "ahead", days: 0 } })
        .ok,
    ).toBe(false);
  });

  it("rejects an id-shaped filter carrying control characters", () => {
    const parsed = parseReportDefinition({
      ...SPEND,
      filters: { categoryId: "cat 1" },
    });
    expect(parsed.ok).toBe(false);
  });

  it("preserves the stored value verbatim when it cannot be read", () => {
    // A rename must never rewrite a definition this build did not understand.
    const raw = { version: 99, source: "future", measure: "unknowable" };
    const parsed = parseReportDefinition(raw);
    expect(parsed.ok).toBe(false);
    expect(JSON.parse(serialiseReportDefinition(parsed))).toEqual(raw);
  });
});

describe("the PRESENTATION half falls back, because it cannot change the question", () => {
  it("falls back to the measure's default sort", () => {
    const config = parseOk({ ...SPEND, sort: "by_vibes" });
    expect(config.sort).toBe("value_desc");
    expect(config.source).toBe("finance");
    expect(config.breakdown).toEqual({ by: "group", group: "category" });
  });

  it("falls back when the sort cannot order the shape", () => {
    // `chronological` is the only legal sort for a series, and only for one.
    const grouped = parseOk({ ...SPEND, sort: "chronological" });
    expect(grouped.sort).toBe("value_desc");

    const series = parseOk({
      ...SPEND,
      breakdown: { by: "time", grain: "month" },
      sort: "value_desc",
    });
    expect(series.sort).toBe("chronological");
  });

  it("falls back when the visual cannot draw the shape", () => {
    const grouped = parseOk({ ...SPEND, visual: "trend" });
    expect(grouped.visual).toBe("bars");

    const series = parseOk({
      ...SPEND,
      breakdown: { by: "time", grain: "month" },
      visual: "bars",
    });
    expect(series.visual).toBe("trend");

    const scalar = parseOk({
      ...SPEND,
      breakdown: { by: "none" },
      visual: "bars",
    });
    expect(scalar.visual).toBe("number");
  });
});

describe("writing a definition", () => {
  it("throws rather than storing something it cannot read", () => {
    expect(() =>
      validateReportDefinitionForWrite({ ...SPEND, source: "payroll" }),
    ).toThrow(/report on/i);
    expect(() => validateReportDefinitionForWrite("not an object")).toThrow(
      /definition object/i,
    );
    expect(() =>
      validateReportDefinitionForWrite({
        ...SPEND,
        filters: { payeeContains: "x" },
      }),
    ).toThrow(/could not be understood/i);
  });

  it("stamps this build's version on a definition that omits one", () => {
    const { version, ...withoutVersion } = SPEND;
    expect(version).toBe(REPORT_CONFIG_VERSION);
    const written = validateReportDefinitionForWrite(withoutVersion);
    expect(written.ok).toBe(true);
    if (written.ok) expect(written.config.version).toBe(REPORT_CONFIG_VERSION);
  });

  it("stores only known keys with known values", () => {
    const written = validateReportDefinitionForWrite({
      ...SPEND,
      filters: { categoryId: "  cat-1  " },
    });
    expect(JSON.parse(serialiseReportDefinition(written))).toEqual({
      version: REPORT_CONFIG_VERSION,
      source: "finance",
      measure: "money_out",
      window: { kind: "preset", preset: "12-months" },
      breakdown: { by: "group", group: "category" },
      filters: { categoryId: "cat-1" },
      sort: "value_desc",
      visual: "bars",
    });
  });
});

describe("the source registry is the one authority", () => {
  it("declares a source for every measure, and only known measures", () => {
    for (const measure of REPORT_MEASURE_DEFINITIONS) {
      expect(reportMeasure(measure.key)).toBe(measure);
      const source = REPORT_SOURCE_DEFINITIONS.find(
        (candidate) => candidate.key === measure.source,
      );
      expect(source?.measures).toContain(measure);
    }
  });

  it("gives every measure at least one breakdown it supports", () => {
    for (const measure of REPORT_MEASURE_DEFINITIONS) {
      const options = measureBreakdowns(measure);
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(supportsBreakdown(measure, option)).toBe(true);
      }
    }
  });

  it("gives every measure a default that is one of its own options", () => {
    for (const measure of REPORT_MEASURE_DEFINITIONS) {
      expect(supportsBreakdown(measure, measure.defaultBreakdown)).toBe(true);
      expect(measure.windowKinds).toContain(measure.defaultWindow.kind);
      for (const required of measure.requiredFilters) {
        expect(measure.filters).toContain(required);
      }
    }
  });

  it("hides a source whose module the owner has turned off", () => {
    expect(availableReportSources([])).toEqual([
      "tasks",
      "goals",
      "projects",
      "obligations",
      "finance",
    ]);
    expect(availableReportSources(["finance"])).not.toContain("finance");
  });

  it("declares no score, index, grade or rating anywhere", () => {
    for (const measure of REPORT_MEASURE_DEFINITIONS) {
      expect(measure.key).not.toMatch(/score|index|grade|rating|wellness/i);
      expect(measure.label).not.toMatch(/score|index|grade|rating|wellness/i);
    }
  });

  it("gives a LEVEL measure an absent empty bucket and no total", () => {
    const measurement = reportMeasure("measurement_value");
    expect(measurement?.aggregation).toBe("latest");
    expect(measurement?.emptyBucket).toBe("absent");

    // Everything else is a flow, and a flow's empty bucket is a true zero.
    for (const measure of REPORT_MEASURE_DEFINITIONS) {
      if (measure.key === "measurement_value") continue;
      expect(measure.aggregation).toBe("sum");
      expect(measure.emptyBucket).toBe("zero");
    }
  });
});

describe("the built-in reports", () => {
  it("are six, and every complete one of them parses", () => {
    expect(BUILT_IN_REPORTS).toHaveLength(6);
    for (const builtIn of BUILT_IN_REPORTS) {
      if (builtIn.requiredFilter !== null) continue;
      const parsed = parseReportDefinition(builtIn.config);
      expect(parsed.ok, `${builtIn.id} should parse`).toBe(true);
      if (parsed.ok) expect(parsed.config).toEqual(builtIn.config);
    }
  });

  it("has exactly one built-in the workspace must complete", () => {
    const incomplete = BUILT_IN_REPORTS.filter(
      (builtIn) => builtIn.requiredFilter !== null,
    );
    expect(incomplete.map((builtIn) => builtIn.id)).toEqual([
      "goal-measurements",
    ]);
  });

  it("have stable, unique ids a link can rely on", () => {
    const ids = BUILT_IN_REPORTS.map((builtIn) => builtIn.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "spend-by-category",
      "goal-measurements",
      "completed-tasks-by-area",
      "obligations-next-90-days",
      "project-health-across-reviews",
      "recurring-commitments-by-month",
    ]);
    expect(isBuiltInReportId("spend-by-category")).toBe(true);
    expect(isBuiltInReportId("not-a-built-in")).toBe(false);
    expect(findBuiltInReport(42)).toBeNull();
  });

  it("cover every source, both axes and all four visuals", () => {
    const sources = new Set(BUILT_IN_REPORTS.map((b) => b.config.source));
    expect([...sources].sort()).toEqual([
      "finance",
      "goals",
      "obligations",
      "projects",
      "tasks",
    ]);
    const axes = new Set(BUILT_IN_REPORTS.map((b) => b.config.breakdown.by));
    expect(axes).toEqual(new Set(["group", "time"]));
  });

  it("names the filter a built-in cannot supply for itself", () => {
    const goal = findBuiltInReport("goal-measurements");
    expect(goal?.requiredFilter).toBe("goalId");
    // Its definition therefore does NOT parse until the owner picks a Goal —
    // which is why the surface asks rather than guessing.
    expect(parseReportDefinition(goal?.config).ok).toBe(false);
    expect(
      parseReportDefinition({
        ...goal?.config,
        filters: { goalId: "goal-1" },
      }).ok,
    ).toBe(true);
  });
});

describe("counting what a definition narrows by", () => {
  it("counts only the dimensions that are set", () => {
    expect(reportFilterCount(SPEND)).toBe(0);
    expect(
      reportFilterCount(parseOk({ ...SPEND, filters: { categoryId: "c1" } })),
    ).toBe(1);
    expect(REPORT_FILTER_KEYS).toContain("uncategorised");
  });
});
