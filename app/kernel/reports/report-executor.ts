/**
 * V2.13 RPT-03 — the ONE deterministic report EXECUTOR.
 *
 * Every report in DalyHub is executed here. There is no per-screen executor, no
 * D1 in a component and no second place a figure can be assembled — which is
 * the whole reason a report and the surface it summarises cannot disagree.
 *
 * ── What this layer does, and what it deliberately does not ─────────────────
 * It validates the definition against the registry and the calendar, resolves
 * the window and the buckets through V2.9's history vocabulary, asks EXACTLY
 * ONE source adapter for the cells that are not empty, and then assembles:
 * filling empty buckets by the measure's own rule, splitting by currency,
 * sorting, bounding with a truthful remainder, and collecting the notes.
 *
 * It never reads a store. The adapters do, through the repositories that
 * already own those facts — so a report is a READ of canonical data, never a
 * second computation of it (ADR-121 decision 1). This module is pure: no D1, no
 * clock, no JSX. The owner's day and the owner-midnight resolver arrive as
 * arguments, exactly as `buildActivityWindow` takes one.
 *
 * ── Empty buckets are the measure's decision, not the adapter's ────────────
 * An adapter returns only the cells it actually found. The executor then fills
 * every bucket the window holds: with `0` for a FLOW, with `null` for a LEVEL.
 * Putting that rule here rather than in five adapters is what stops one of them
 * from quietly drawing a Goal's silent month as zero.
 */

import { buildActivityWindow, type Window } from "~/kernel/history";
import {
  bucketWindow,
  type HistoryBuckets,
  type OwnerDayStart,
} from "~/kernel/history";

import {
  MAX_REPORT_GROUPS,
  type ReportAvailability,
  type ReportBlock,
  type ReportNote,
  type ReportRemainder,
  type ReportResult,
  type ReportRow,
  unavailableReport,
} from "./report-result";
import { reportMeasure, type ReportMeasureDefinition } from "./report-source";
import {
  breakdownShape,
  type ReportConfig,
  type ReportSourceKey,
} from "./report-vocabulary";
import {
  checkReportConfig,
  resolveReportWindowDays,
  type ReportRefusal,
} from "./report-window";

/* -------------------------------------------------------------------------- */
/* The adapter contract                                                        */
/* -------------------------------------------------------------------------- */

/** One non-empty cell an adapter found. */
export interface ReportCell {
  /**
   * The bucket key for a time breakdown (`b0`, `b1`, …, exactly as the history
   * kernel numbers them), or a stable group key otherwise.
   */
  readonly key: string;
  readonly label: string;
  /** `null` for a `count` or `value` measure. */
  readonly currencyCode: string | null;
  readonly value: number | null;
  readonly detail?: number | null;
  readonly referenceId?: string | null;
  /** What a label sort orders by, when the label itself does not sort ("September
   * 2026" must order by `2026-09`). Defaults to the label. */
  readonly sortKey?: string;
}

/** What an adapter returns. */
export interface ReportRead {
  readonly cells: readonly ReportCell[];
  /** Groups the adapter itself capped, with their real combined values. */
  readonly remainders?: readonly {
    readonly currencyCode: string | null;
    readonly groups: number;
    readonly value: number;
    readonly detail?: number | null;
  }[];
  /** Records the whole read covered, per currency, where it counted them. */
  readonly recordCounts?: readonly {
    readonly currencyCode: string | null;
    readonly count: number;
  }[];
  readonly notes?: readonly ReportNote[];
  readonly bounded?: boolean;
  readonly bound?: number | null;
  readonly boundReason?: string | null;
}

/** What an adapter is asked. */
export interface ReportReadRequest {
  readonly config: ReportConfig;
  readonly measure: ReportMeasureDefinition;
  /** The resolved window, with owner-day instants already computed. */
  readonly window: Window;
  /** The buckets, for a time breakdown. `null` otherwise. */
  readonly buckets: HistoryBuckets | null;
  readonly todayIso: string;
}

export type ReportSourceAdapter = (
  request: ReportReadRequest,
) => Promise<ReportRead>;

/** One adapter per source. A source with no adapter cannot be executed. */
export type ReportSourceAdapters = Readonly<
  Partial<Record<ReportSourceKey, ReportSourceAdapter>>
>;

export interface ReportExecutionContext {
  readonly todayIso: string;
  readonly startOfOwnerDay: OwnerDayStart;
  readonly availableSources: readonly string[];
  readonly adapters: ReportSourceAdapters;
  /** The instant the result is stamped with. Injected, so tests are stable. */
  readonly now: Date;
}

/** What executing a definition produced. */
export type ReportExecution =
  | { readonly ok: true; readonly result: ReportResult }
  | { readonly ok: false; readonly refusal: ReportRefusal };

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

export async function executeReport(
  config: ReportConfig,
  context: ReportExecutionContext,
): Promise<ReportExecution> {
  const refusal = checkReportConfig(config, {
    todayIso: context.todayIso,
    availableSources: context.availableSources,
  });
  if (refusal) return { ok: false, refusal };

  const measure = reportMeasure(config.measure);
  /* v8 ignore next 8 -- a parsed config always names a measure this build has. */
  if (!measure) {
    return {
      ok: false,
      refusal: {
        code: "source_unavailable",
        message: "That figure is not one DalyHub can produce.",
      },
    };
  }

  const days = resolveReportWindowDays(config.window, context.todayIso);
  const window = buildActivityWindow({
    periodStart: days.startIso,
    periodEnd: days.endIso,
    startOfOwnerDay: context.startOfOwnerDay,
  });
  const buckets =
    config.breakdown.by === "time"
      ? bucketWindow({
          window,
          grain: config.breakdown.grain,
          startOfOwnerDay: context.startOfOwnerDay,
        })
      : null;

  const shape = breakdownShape(config.breakdown);
  const adapter = context.adapters[config.source];
  const grain = buckets ? buckets.grain : null;
  const covered = buckets ? buckets.window : window;

  if (!adapter) {
    return {
      ok: false,
      refusal: {
        code: "source_unavailable",
        message: "DalyHub cannot read that source in this deployment.",
      },
    };
  }

  let read: ReportRead;
  try {
    read = await adapter({
      config,
      measure,
      window,
      buckets,
      todayIso: context.todayIso,
    });
  } catch {
    /*
     * A failed read is NOT a zero, and it is not a partial result either: a
     * report reads one source, so failure is atomic at the source. The surface
     * says "not available" beside the question it could not answer.
     */
    return {
      ok: true,
      result: unavailableReport({
        definition: config,
        shape,
        unit: measure.unit,
        window: covered,
        grain,
        computedAtIso: context.now.toISOString(),
      }),
    };
  }

  return {
    ok: true,
    result: assemble({
      config,
      measure,
      shape,
      window: covered,
      grain,
      buckets,
      read,
      computedAtIso: context.now.toISOString(),
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

function assemble(input: {
  readonly config: ReportConfig;
  readonly measure: ReportMeasureDefinition;
  readonly shape: "scalar" | "series" | "grouped";
  readonly window: Window;
  readonly grain: string | null;
  readonly buckets: HistoryBuckets | null;
  readonly read: ReportRead;
  readonly computedAtIso: string;
}): ReportResult {
  const { config, measure, shape, read, buckets } = input;

  // Every currency present, in a stable order. A count or value measure has one
  // block whose currency is null.
  const currencies = orderedCurrencies(read);
  const blocks: ReportBlock[] = currencies.map((currencyCode) =>
    buildBlock({
      currencyCode,
      cells: read.cells.filter((cell) => cell.currencyCode === currencyCode),
      measure,
      shape,
      buckets,
      sort: config.sort,
      remainder: findRemainder(read, currencyCode),
      recordCount: findRecordCount(read, currencyCode),
    }),
  );

  const notes = collectNotes({
    config,
    measure,
    blocks,
    read,
    buckets,
  });

  const bounded =
    read.bounded === true ||
    (buckets?.bounded ?? false) ||
    blocks.some((block) => block.remainder !== null);
  const availability: ReportAvailability = "ok";

  return {
    definition: config,
    source: config.source,
    measure: config.measure,
    shape,
    unit: measure.unit,
    window: input.window,
    grain: input.grain,
    blocks,
    bounded,
    bound: read.bound ?? buckets?.bound ?? null,
    boundReason: read.boundReason ?? buckets?.boundReason ?? null,
    notes,
    availability,
    computedAtIso: input.computedAtIso,
  };
}

/**
 * The currencies a result splits into.
 *
 * A `money` measure with no rows at all still produces ONE block, so the
 * surface has somewhere to say "nothing in this period" rather than rendering
 * no structure at all.
 */
function orderedCurrencies(read: ReportRead): readonly (string | null)[] {
  const codes = new Set<string | null>();
  for (const cell of read.cells) codes.add(cell.currencyCode);
  for (const remainder of read.remainders ?? [])
    codes.add(remainder.currencyCode);
  if (codes.size === 0) return [null];
  return [...codes].sort((a, b) =>
    a === null ? -1 : b === null ? 1 : a < b ? -1 : a > b ? 1 : 0,
  );
}

function findRemainder(
  read: ReportRead,
  currencyCode: string | null,
): ReportRemainder | null {
  const entry = (read.remainders ?? []).find(
    (candidate) => candidate.currencyCode === currencyCode,
  );
  return entry
    ? {
        groups: entry.groups,
        value: entry.value,
        detail: entry.detail ?? null,
      }
    : null;
}

function findRecordCount(
  read: ReportRead,
  currencyCode: string | null,
): number | null {
  const entry = (read.recordCounts ?? []).find(
    (candidate) => candidate.currencyCode === currencyCode,
  );
  return entry ? entry.count : null;
}

function buildBlock(input: {
  readonly currencyCode: string | null;
  readonly cells: readonly ReportCell[];
  readonly measure: ReportMeasureDefinition;
  readonly shape: "scalar" | "series" | "grouped";
  readonly buckets: HistoryBuckets | null;
  readonly sort: ReportConfig["sort"];
  readonly remainder: ReportRemainder | null;
  readonly recordCount: number | null;
}): ReportBlock {
  const { measure, cells } = input;
  const rows =
    input.shape === "series" && input.buckets
      ? seriesRows(cells, input.buckets, measure)
      : input.shape === "scalar"
        ? scalarRows(cells, measure)
        : sortCells(cells, input.sort).map(toRow);

  const capped =
    input.shape === "grouped" && rows.length > MAX_REPORT_GROUPS
      ? rows.slice(0, MAX_REPORT_GROUPS)
      : rows;
  // Folding here is arithmetically truthful because the values being folded are
  // real rows this read produced — never a bounded page subtracted from a guess.
  const overflow = rows.slice(capped.length);
  const remainder =
    overflow.length > 0
      ? mergeRemainder(input.remainder, {
          groups: overflow.length,
          value: overflow.reduce((sum, row) => sum + (row.value ?? 0), 0),
          detail: overflow.reduce(
            (sum, row) => (row.detail === null ? sum : sum + row.detail),
            0,
          ),
        })
      : input.remainder;

  return {
    key: input.currencyCode ?? "default",
    currencyCode: input.currencyCode,
    rows: capped,
    // A `latest` measure has no meaningful total: twelve monthly weigh-ins do
    // not add up to anything. An absent field cannot be printed by mistake.
    total:
      measure.aggregation === "sum"
        ? capped.reduce((sum, row) => sum + (row.value ?? 0), 0) +
          (remainder?.value ?? 0)
        : null,
    recordCount: input.recordCount,
    remainder,
  };
}

function mergeRemainder(
  existing: ReportRemainder | null,
  extra: { groups: number; value: number; detail: number },
): ReportRemainder {
  if (!existing) {
    return { groups: extra.groups, value: extra.value, detail: extra.detail };
  }
  return {
    groups: existing.groups + extra.groups,
    value: existing.value + extra.value,
    detail: (existing.detail ?? 0) + extra.detail,
  };
}

function toRow(cell: ReportCell): ReportRow {
  return {
    key: cell.key,
    label: cell.label,
    value: cell.value,
    detail: cell.detail ?? null,
    period: null,
    referenceId: cell.referenceId ?? null,
  };
}

/**
 * One row per BUCKET, oldest first — never one row per cell.
 *
 * A bucket the adapter returned nothing for is filled by the measure's own
 * rule: `0` for a flow, `null` for a level. An ABSENT bucket would be
 * indistinguishable from a quiet one, which is the defect `Series` exists to
 * prevent.
 */
function seriesRows(
  cells: readonly ReportCell[],
  buckets: HistoryBuckets,
  measure: ReportMeasureDefinition,
): readonly ReportRow[] {
  const byKey = new Map(cells.map((cell) => [cell.key, cell]));
  return buckets.buckets.map((bucket) => {
    const cell = byKey.get(bucket.key);
    return {
      key: bucket.key,
      label: cell?.label ?? bucket.periodEnd,
      value:
        cell?.value !== undefined && cell.value !== null
          ? cell.value
          : measure.emptyBucket === "zero"
            ? 0
            : null,
      detail: cell?.detail ?? null,
      period: { startIso: bucket.periodStart, endIso: bucket.periodEnd },
      referenceId: cell?.referenceId ?? null,
    };
  });
}

/** Exactly one row. An adapter that found nothing still produces the figure. */
function scalarRows(
  cells: readonly ReportCell[],
  measure: ReportMeasureDefinition,
): readonly ReportRow[] {
  if (cells.length === 0) {
    return [
      {
        key: "total",
        label: measure.label,
        value: measure.emptyBucket === "zero" ? 0 : null,
        detail: null,
        period: null,
        referenceId: null,
      },
    ];
  }
  const value = cells.reduce((sum, cell) => sum + (cell.value ?? 0), 0);
  const detail = cells.reduce(
    (sum, cell) =>
      cell.detail === null || cell.detail === undefined
        ? sum
        : sum + cell.detail,
    0,
  );
  return [
    {
      key: "total",
      label: measure.label,
      value,
      detail: detail > 0 ? detail : null,
      period: null,
      referenceId: cells.length === 1 ? (cells[0].referenceId ?? null) : null,
    },
  ];
}

/**
 * Order the CELLS, then map them to rows.
 *
 * Sorting cells rather than rows is what lets a label sort use the adapter's
 * own `sortKey`: "September 2026" must order by `2026-09` rather than
 * alphabetically after April, and a row deliberately does not carry a sort
 * key it would then have to serialise to the client.
 */
function sortCells(
  cells: readonly ReportCell[],
  sort: ReportConfig["sort"],
): readonly ReportCell[] {
  const key = (cell: ReportCell): string =>
    cell.sortKey ?? cell.label.toLocaleLowerCase("en-AU");
  const byLabel = (left: ReportCell, right: ReportCell): number => {
    const a = key(left);
    const b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  };
  // An ABSENT value sorts last whichever way the numbers go: "no reading" is
  // not the smallest reading.
  const byValue = (
    left: ReportCell,
    right: ReportCell,
    sign: number,
  ): number => {
    if (left.value === null && right.value === null)
      return byLabel(left, right);
    if (left.value === null) return 1;
    if (right.value === null) return -1;
    return left.value === right.value
      ? byLabel(left, right)
      : sign * (left.value - right.value);
  };

  const copy = [...cells];
  switch (sort) {
    case "value_desc":
      copy.sort((left, right) => byValue(left, right, -1));
      break;
    case "value_asc":
      copy.sort((left, right) => byValue(left, right, 1));
      break;
    case "label_desc":
      copy.sort((left, right) => -byLabel(left, right));
      break;
    // `label_asc`, and `chronological` for a grouped result whose labels ARE
    // periods (a month group), are the same order.
    default:
      copy.sort(byLabel);
      break;
  }
  return copy;
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

function collectNotes(input: {
  readonly config: ReportConfig;
  readonly measure: ReportMeasureDefinition;
  readonly blocks: readonly ReportBlock[];
  readonly read: ReportRead;
  readonly buckets: HistoryBuckets | null;
}): readonly ReportNote[] {
  const notes: ReportNote[] = [];
  const { measure, config, blocks, read, buckets } = input;

  if (measure.standingNote) {
    notes.push({
      code: "standing",
      text: measure.standingNote,
      tone: "neutral",
    });
  }

  if (config.window.kind === "custom") {
    notes.push({
      code: "fixed_window",
      text: `This report is fixed to ${config.window.startIso} – ${config.window.endIso}. It will keep answering for those exact days.`,
      tone: "neutral",
    });
  }

  if (buckets?.bounded && buckets.bound !== null) {
    notes.push({
      code: "bounded_series",
      text: `Showing the most recent ${buckets.bound} periods of the ${buckets.requested} this window covers.`,
      tone: "warning",
    });
  }

  for (const block of blocks) {
    if (!block.remainder) continue;
    const where = block.currencyCode ? ` (${block.currencyCode})` : "";
    notes.push({
      code: "bounded_groups",
      text: `The largest ${block.rows.length} are listed${where}; the remaining ${block.remainder.groups} are combined into one row so the total still adds up.`,
      tone: "warning",
    });
  }

  const currencies = blocks.filter((block) => block.currencyCode !== null);
  if (currencies.length > 1) {
    notes.push({
      code: "mixed_currency",
      text: `Two or more currencies are involved (${currencies
        .map((block) => block.currencyCode)
        .join(", ")}). They are reported separately and never added together.`,
      tone: "neutral",
    });
  }

  for (const note of read.notes ?? []) notes.push(note);

  if (read.cells.length === 0) {
    notes.push({
      code: "no_records",
      text: "Nothing in this period matched. That is different from a figure of zero, and DalyHub says so rather than drawing an empty chart.",
      tone: "neutral",
    });
  }

  return notes;
}
