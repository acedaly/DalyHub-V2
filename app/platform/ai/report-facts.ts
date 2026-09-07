/**
 * V2.14 GROUND-03 — `ReportResult` → `FactBlock`.
 *
 * ## The dependency direction, and why it matters
 *
 * Reports imports nothing from AI, and `test/unit/reports/report-boundaries.ts`
 * asserts it. AI imports Reports. That asymmetry is the whole seam: the
 * deterministic Reports module stays usable with every AI file deleted, and
 * V2.13 shaped `ReportResult` for exactly this without acquiring a dependency
 * on a release that did not exist yet.
 *
 * ## Why the result, and not a second read
 *
 * The facts ARE the executed result — its blocks, its rows, its totals, its
 * arithmetic remainder and its notes. Nothing here re-queries anything, so
 * there is no window in which the explanation and the figures on screen can
 * disagree about a boundary.
 *
 * The freshness half of that guarantee lives at the route: the browser sends
 * the FactBlock hash of the result it is looking at, the server rebuilds the
 * block from a fresh execution, and a mismatch is refused as `result_stale`
 * rather than paired with prose written about different numbers. The browser
 * therefore supplies an identity and never a figure — a figure from a browser
 * is not a fact.
 *
 * ## What travels with the claim
 *
 * Every `ReportNote` becomes a `FactBound`. A measure's standing approximation
 * ([DEBT-251](../../../docs/product/PRODUCT_DEBT.md): completions are attributed
 * to where a Task sits TODAY), a bounded-group remainder, a mixed-currency
 * split, a fixed window, "nothing matched" — the explanation is given all of
 * them and told not to contradict them. An answer that says "across all
 * history" over a twelve-month window is contradicting its own evidence.
 */

import {
  buildFactBlock,
  type FactBlock,
  type FactBound,
  type FactDraft,
  type FactPeriod,
  type FactReference,
} from "~/kernel/ai";
import { formatMinorUnits } from "~/kernel/money";
import {
  reportMeasure,
  reportSource,
  type ReportBlock,
  type ReportBreakdown,
  type ReportNote,
  type ReportResult,
  type ReportRow,
  type ReportSourceKey,
  type ReportUnit,
} from "~/kernel/reports";

/** What the builder needs beyond the result itself. */
export interface ReportFactBlockInput {
  readonly result: ReportResult;
  /** The report's own title, as the owner sees it. */
  readonly title: string;
  /** The question the report asks, in the owner's words. */
  readonly question: string;
  /** The report's canonical URL, so the answer can point back at it. */
  readonly href: string;
  /** The feature's fact ceiling. Facts beyond it are dropped, and said so. */
  readonly maxFacts: number;
}

/* -------------------------------------------------------------------------- */
/* Formatting — DalyHub's, and the only formatting the answer may restate       */
/* -------------------------------------------------------------------------- */

/**
 * Format one figure the way the Report itself formats it.
 *
 * Deliberately the same rules as `reports-view.ts`, because the owner is
 * looking at that surface: an explanation that reformats a figure is an
 * explanation whose numbers do not match the page it is explaining, and the
 * numeric validator would have to accept both spellings to let it through.
 */
function displayValue(
  value: number | null,
  unit: ReportUnit,
  currencyCode: string | null,
): string {
  if (value === null) return "no reading";
  if (unit === "money") {
    return currencyCode === null
      ? String(value)
      : formatMinorUnits(value, currencyCode);
  }
  if (unit === "count") return new Intl.NumberFormat("en-AU").format(value);
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(
    value,
  );
}

/** The canonical `FactValue` for one row of a result. */
function factValue(
  value: number | null,
  unit: ReportUnit,
  currencyCode: string | null,
): FactDraft["value"] {
  if (value === null) return { kind: "absent" };
  if (unit === "money" && currencyCode !== null) {
    return { kind: "money", minorUnits: value, currencyCode };
  }
  if (unit === "count") return { kind: "count", count: value };
  return { kind: "value", amount: value, unit: null };
}

/* -------------------------------------------------------------------------- */
/* References — built by DalyHub from ids it already holds                      */
/* -------------------------------------------------------------------------- */

/**
 * Where a row can be checked.
 *
 * `null` wherever the product has no single surface for the row — a health
 * state, a month bucket with no one record behind it — because an approximate
 * link is worse than none: the owner follows it, sees something else, and stops
 * trusting the citations that were right.
 */
function rowReference(
  source: ReportSourceKey,
  breakdown: ReportBreakdown,
  row: ReportRow,
  label: string,
): FactReference | null {
  if (row.referenceId === null) return null;
  const id = row.referenceId;
  if (breakdown.by === "group") {
    switch (breakdown.group) {
      case "area":
        return { kind: "area", id, href: `/areas/${id}`, label };
      case "project":
        return { kind: "project", id, href: `/projects/${id}`, label };
      case "goal":
        return { kind: "goal", id, href: `/goals/${id}`, label };
      case "category":
        return {
          kind: "category",
          id,
          href: `/finance/transactions?category=${id}`,
          label,
        };
      case "account":
        return {
          kind: "account",
          id,
          href: `/finance/accounts/${id}`,
          label,
        };
      case "subject":
      case "month":
      case "health_state":
        return null;
    }
  }
  if (source === "obligations") {
    return { kind: "obligation", id, href: `/obligations/${id}`, label };
  }
  if (source === "goals") {
    return { kind: "goal", id, href: `/goals/${id}`, label };
  }
  return null;
}

/** A row's own period, where the shape gives it one. */
function rowPeriod(row: ReportRow): FactPeriod | null {
  if (row.period === null) return null;
  return {
    startIso: row.period.startIso,
    endIso: row.period.endIso,
    label: row.label,
  };
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/** A `ReportNote` is a `FactBound`. The vocabularies are deliberately close. */
function boundFor(note: ReportNote): FactBound {
  switch (note.code) {
    case "standing":
      return { code: "standing", text: note.text };
    case "bounded_groups":
    case "bounded_series":
      return { code: "bounded", text: note.text };
    case "excluded":
      return { code: "excluded", text: note.text };
    case "mixed_currency":
      return { code: "mixed_currency", text: note.text };
    case "fixed_window":
      return { code: "fixed_window", text: note.text };
    case "no_records":
      return { code: "no_records", text: note.text };
  }
}

/* -------------------------------------------------------------------------- */
/* The builder                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turn one executed Report into the facts an explanation may state.
 *
 * The selection order is the contract, and it exists because a block has a
 * ceiling: **totals first, then rows**. A grouped report over two currencies
 * with 24 groups each produces more facts than any feature's budget allows, and
 * dropping a block's total to keep its 24th category would be the wrong half to
 * keep. So each block contributes its total, its record count and its remainder
 * before any block contributes a row, and the rows then fill what is left in
 * result order — which is the report's own sort, so "the rows that mattered
 * most" is the report's judgement rather than a second one made here.
 */
export function reportFactBlock(input: ReportFactBlockInput): FactBlock {
  const { result } = input;
  const measure = reportMeasure(result.measure);
  const source = reportSource(result.source);

  const period: FactPeriod | null =
    result.window.periodStart.length > 0
      ? {
          startIso: result.window.periodStart,
          endIso: result.window.periodEnd,
          label: `${result.window.periodStart} to ${result.window.periodEnd}`,
        }
      : null;

  const totals: FactDraft[] = [];
  const rows: FactDraft[] = [];

  for (const block of result.blocks) {
    const suffix =
      block.currencyCode === null ? "" : ` (${block.currencyCode})`;
    totals.push(
      ...blockTotals(block, result, suffix, input.href, measure?.label),
    );
    rows.push(...blockRows(block, result, suffix, source.key));
  }

  const facts = [...totals, ...rows];

  const bounds = result.notes.map(boundFor);
  if (result.availability === "unavailable") {
    bounds.push({
      code: "no_records",
      text: "This report could not be read, so there are no figures to explain.",
    });
  }

  return buildFactBlock({
    intent: "report_explanation",
    question: input.question,
    subject: input.title,
    period,
    facts,
    maxFacts: input.maxFacts,
    bounds,
    currencies: result.blocks
      .map((block) => block.currencyCode)
      .filter((code): code is string => code !== null),
  });
}

/** A block's own figures: its total, its record count and its remainder. */
function blockTotals(
  block: ReportBlock,
  result: ReportResult,
  suffix: string,
  href: string,
  measureLabel: string | undefined,
): readonly FactDraft[] {
  const drafts: FactDraft[] = [];
  const label = measureLabel ?? result.measure;
  const reference: FactReference = {
    kind: "report",
    id: result.measure,
    href,
    label,
  };

  if (block.total !== null) {
    drafts.push({
      label: `Total — ${label}${suffix}`,
      value: factValue(block.total, result.unit, block.currencyCode),
      display: displayValue(block.total, result.unit, block.currencyCode),
      reference,
      note:
        block.remainder === null
          ? null
          : "This total includes the groups folded into the remainder below.",
    });
  }
  if (block.recordCount !== null) {
    drafts.push({
      label: `Records counted${suffix}`,
      value: { kind: "count", count: block.recordCount },
      display: new Intl.NumberFormat("en-AU").format(block.recordCount),
      reference,
    });
  }
  if (block.remainder !== null) {
    drafts.push({
      label: `Everything else, combined${suffix}`,
      value: factValue(block.remainder.value, result.unit, block.currencyCode),
      display: displayValue(
        block.remainder.value,
        result.unit,
        block.currencyCode,
      ),
      reference,
      note: `${block.remainder.groups} further groups are combined into this one figure and are not listed separately.`,
    });
  }
  return drafts;
}

/** One fact per row, in the report's own order. */
function blockRows(
  block: ReportBlock,
  result: ReportResult,
  suffix: string,
  source: ReportSourceKey,
): readonly FactDraft[] {
  return block.rows.map((row) => ({
    label: `${row.label}${suffix}`,
    value: factValue(row.value, result.unit, block.currencyCode),
    display: displayValue(row.value, result.unit, block.currencyCode),
    period: rowPeriod(row),
    reference: rowReference(
      source,
      result.definition.breakdown,
      row,
      row.label,
    ),
    note:
      row.detail === null
        ? null
        : `${new Intl.NumberFormat("en-AU").format(row.detail)} records.`,
  }));
}
