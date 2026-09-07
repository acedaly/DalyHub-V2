/**
 * V2.13 RPT-04 — the JSON-safe shapes a Reports surface renders, and the words
 * they carry.
 *
 * Every figure crossing this boundary is already FORMATTED, because formatting
 * money is the one place a report could quietly lose its currency. A row
 * carries its number too, so a chart can scale it — but nothing on the screen
 * prints `value` directly.
 *
 * Presentation only: no D1, no repository, no `Date`.
 */

import { formatMinorUnits } from "~/kernel/money";
import { GRAIN_LABELS } from "~/kernel/analytics";
import {
  REPORT_GROUP_LABELS,
  reportMeasure,
  reportQuestion,
  reportSource,
  reportWindowLabel,
  type ReportConfig,
  type ReportNote,
  type ReportResult,
} from "~/kernel/reports";

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

export interface SerializedReportRow {
  readonly key: string;
  readonly label: string;
  /** The raw magnitude, for the chart's scale. Never printed. */
  readonly value: number | null;
  /** The figure as the owner reads it. `null` means NO READING. */
  readonly formatted: string | null;
  /** A subordinate fact ("42 transactions"). */
  readonly detail: string | null;
  readonly periodLabel: string | null;
  /** Where the records behind this row live, so a figure can be checked. */
  readonly href: string | null;
}

export interface SerializedReportRemainder {
  readonly label: string;
  readonly formatted: string;
  readonly value: number;
}

export interface SerializedReportBlock {
  readonly key: string;
  /** The currency this block is entirely in, or null for a count. */
  readonly currencyCode: string | null;
  /** "Australian dollars", when there is more than one block. */
  readonly heading: string | null;
  readonly rows: readonly SerializedReportRow[];
  /** The block's total, formatted. `null` for a measure that does not add up. */
  readonly total: string | null;
  readonly remainder: SerializedReportRemainder | null;
}

export interface SerializedReportNote {
  readonly code: string;
  readonly text: string;
  readonly tone: "neutral" | "warning";
}

/** A whole executed report, ready to render. */
export interface SerializedReportResult {
  readonly shape: "scalar" | "series" | "grouped";
  readonly unit: "count" | "money" | "value";
  readonly sourceLabel: string;
  readonly measureLabel: string;
  readonly windowLabel: string;
  /** "5 September 2025 – 7 September 2026", the period in words. */
  readonly periodLabel: string;
  readonly breakdownLabel: string;
  /** What is drawn BESIDE the rows. It never decides whether they exist. */
  readonly visual: "number" | "table" | "bars" | "trend";
  readonly blocks: readonly SerializedReportBlock[];
  readonly notes: readonly SerializedReportNote[];
  readonly availability: "ok" | "unavailable";
  readonly bounded: boolean;
  readonly computedAtIso: string;
}

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

/** "5 September 2025 – 7 September 2026". */
export function periodWords(startIso: string, endIso: string): string {
  return `${calendarWords(startIso)} – ${calendarWords(endIso)}`;
}

/**
 * A SHORT period name for a chart axis and a table row: "Sep 2026" for a month
 * bucket, "7 Sep" for a day or a week. The full period stays on the row for a
 * screen reader, so nothing is lost by shortening what is drawn.
 */
export function axisWords(
  startIso: string,
  endIso: string,
  grain: string | null,
): string {
  const [year, month, day] = endIso.split("-").map(Number);
  const at = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(
    "en-AU",
    grain === "month"
      ? { month: "short", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" },
  ).format(at);
}

function calendarWords(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)));
}

/** How a definition's breakdown reads in a sentence. */
export function breakdownWords(config: ReportConfig): string {
  if (config.breakdown.by === "none") return "One figure";
  if (config.breakdown.by === "time") {
    return `By ${GRAIN_LABELS[config.breakdown.grain].toLocaleLowerCase("en-AU")} period`;
  }
  return `By ${REPORT_GROUP_LABELS[config.breakdown.group].toLocaleLowerCase("en-AU")}`;
}

/**
 * The one-line question a definition asks, for a card and a page subtitle.
 *
 * The sentence itself is the KERNEL's, because the Obsidian vault prints it too
 * and a platform export must not reach into a module's presentation layer. This
 * is the module's name for it.
 */
export const questionWords = reportQuestion;

/* -------------------------------------------------------------------------- */
/* Serialisation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Format one figure.
 *
 * `null` is NO READING and comes back as `null` so the surface can say so in
 * words. Money is formatted in the BLOCK's currency, which is the only currency
 * present — the type makes a cross-currency format impossible to write.
 */
function formatValue(
  value: number | null,
  unit: SerializedReportResult["unit"],
  currencyCode: string | null,
): string | null {
  if (value === null) return null;
  if (unit === "money") {
    return currencyCode === null
      ? String(value)
      : formatMinorUnits(value, currencyCode);
  }
  if (unit === "count") return new Intl.NumberFormat("en-AU").format(value);
  // A Goal measurement is in the Goal's own unit; the number is the fact and
  // the unit belongs to the Goal's record rather than to this report.
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function currencyHeading(currencyCode: string): string {
  try {
    return (
      new Intl.DisplayNames(["en-AU"], { type: "currency" }).of(currencyCode) ??
      currencyCode
    );
  } catch {
    /* v8 ignore next -- an unknown code still names itself. */
    return currencyCode;
  }
}

/** Turn an executed result into the shapes a surface renders. */
export function serialiseReportResult(
  result: ReportResult,
  options: { readonly rowHref?: (referenceId: string) => string } = {},
): SerializedReportResult {
  const measure = reportMeasure(result.measure);
  const source = reportSource(result.source);
  const showHeadings = result.blocks.length > 1;

  return {
    shape: result.shape,
    unit: result.unit,
    sourceLabel: source.label,
    measureLabel: measure?.label ?? result.measure,
    windowLabel: reportWindowLabel(result.definition.window),
    periodLabel:
      result.window.periodStart.length > 0
        ? periodWords(result.window.periodStart, result.window.periodEnd)
        : "",
    breakdownLabel: breakdownWords(result.definition),
    visual: result.definition.visual,
    blocks: result.blocks.map((block) => ({
      key: block.key,
      currencyCode: block.currencyCode,
      heading:
        showHeadings && block.currencyCode
          ? currencyHeading(block.currencyCode)
          : null,
      rows: block.rows.map((row) => ({
        key: row.key,
        // A series row's own label is whatever the adapter had to hand — often
        // the bucket's last day. The AXIS wants a short period name, so it is
        // derived here from the period the row actually carries rather than
        // asked of five adapters that would each phrase it differently.
        label: row.period
          ? axisWords(row.period.startIso, row.period.endIso, result.grain)
          : row.label,
        value: row.value,
        formatted: formatValue(row.value, result.unit, block.currencyCode),
        detail:
          row.detail === null
            ? null
            : `${new Intl.NumberFormat("en-AU").format(row.detail)} ${
                row.detail === 1 ? "record" : "records"
              }`,
        periodLabel: row.period
          ? periodWords(row.period.startIso, row.period.endIso)
          : null,
        href:
          row.referenceId && options.rowHref
            ? options.rowHref(row.referenceId)
            : null,
      })),
      total:
        block.total === null
          ? null
          : formatValue(block.total, result.unit, block.currencyCode),
      remainder: block.remainder
        ? {
            label: `${block.remainder.groups} other${block.remainder.groups === 1 ? "" : "s"}`,
            formatted:
              formatValue(
                block.remainder.value,
                result.unit,
                block.currencyCode,
              ) ?? "",
            value: block.remainder.value,
          }
        : null,
    })),
    notes: result.notes.map(serialiseNote),
    availability: result.availability,
    bounded: result.bounded,
    computedAtIso: result.computedAtIso,
  };
}

function serialiseNote(note: ReportNote): SerializedReportNote {
  return { code: note.code, text: note.text, tone: note.tone };
}

/* -------------------------------------------------------------------------- */
/* The collection and the page                                                 */
/* -------------------------------------------------------------------------- */

/** One entry in the Reports collection. */
export interface SerializedReportEntry {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly href: string;
  /** True for a definition that lives in code rather than in the owner's rows. */
  readonly builtIn: boolean;
  /** A filter the owner must choose before this can run. */
  readonly needs: string | null;
  /** Set only for a stored definition this build cannot read. */
  readonly incompatible: string | null;
}

/** What `/reports` renders. Definitions only — no report is executed here. */
export interface ReportsHomeData {
  readonly builtIns: readonly SerializedReportEntry[];
  readonly saved: readonly SerializedReportEntry[];
  readonly savedLimit: number;
  readonly failed: boolean;
}

/** One choice on a builder control. */
export interface ReportOption {
  readonly value: string;
  readonly label: string;
  readonly href: string;
}

/** One group of builder controls. */
export interface ReportControl {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly ReportOption[];
}

/** What a report PAGE renders. */
export interface ReportPageData {
  /** The saved row's id, a built-in's id, or null for an unsaved definition. */
  readonly reportId: string | null;
  readonly title: string;
  readonly question: string;
  readonly builtIn: boolean;
  /** True when the URL's definition differs from the saved row's. */
  readonly modified: boolean;
  /** The definition as query parameters, for the save action and the controls. */
  readonly query: string;
  readonly controls: readonly ReportControl[];
  readonly result: SerializedReportResult | null;
  /** Set when the definition could not be executed as it stands. */
  readonly refusal: string | null;
  /** Set when the STORED definition cannot be read by this build. */
  readonly incompatible: string | null;
  /** The filter this definition still needs before it can answer. */
  readonly needs: string | null;
  readonly todayIso: string;
}
