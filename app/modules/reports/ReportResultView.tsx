/**
 * V2.13 RPT-04 — how a result is DRAWN.
 *
 * ── Number, then table, then chart. In that order, at every width ───────────
 * The owner must be able to answer the question with the chart removed, and on
 * a phone the chart is the least useful of the three. So the DOM order is the
 * reading order is the tab order: the headline figure, the rows as ordinary
 * text, and the illustration last. That is not a mobile concession — it is what
 * makes the surface correct for a screen reader, for a printed page, and for a
 * chart that failed to lay out.
 *
 * ── The table is never optional ────────────────────────────────────────────
 * `visual` chooses what is drawn BESIDE the rows, never whether they exist.
 * Every value, every label, every period and every unit is on the page as text
 * whatever the visual says (AGENTS.md §15).
 *
 * ── One block per currency ─────────────────────────────────────────────────
 * A money result renders one section per currency, each with its own heading,
 * its own total and its own chart. There is no arrangement in which two
 * currencies share an axis, because there is no shape in which they share a
 * block.
 *
 * Presentation only.
 */

import {
  CategoryBars,
  TrendBars,
  type CategoryBarsRow,
  type TrendBarPoint,
} from "~/shared/charts";

import type {
  SerializedReportBlock,
  SerializedReportResult,
} from "./reports-view";

export function ReportResultView({
  result,
}: {
  readonly result: SerializedReportResult;
}) {
  if (result.availability === "unavailable") {
    /*
     * A failed read is NOT a zero and NOT an empty chart: an empty chart reads
     * as "nothing happened", which is a claim about the workspace this surface
     * has no evidence for.
     */
    return (
      <p className="dh-report__absent" role="status">
        These figures could not be read just now. Nothing in your workspace has
        changed — try again in a moment.
      </p>
    );
  }

  return (
    <div className="dh-report__result">
      {result.blocks.map((block) => (
        <ReportBlockView key={block.key} block={block} result={result} />
      ))}
      {result.notes.length > 0 ? (
        <aside className="dh-report__notes" aria-label="About these figures">
          {result.notes.map((note, index) => (
            <p
              key={`${note.code}-${index}`}
              className="dh-report__note"
              data-tone={note.tone}
            >
              {note.text}
            </p>
          ))}
        </aside>
      ) : null}
    </div>
  );
}

function ReportBlockView({
  block,
  result,
}: {
  readonly block: SerializedReportBlock;
  readonly result: SerializedReportResult;
}) {
  const empty = block.rows.length === 0;
  return (
    <section
      className="dh-report__block"
      aria-label={block.heading ?? result.measureLabel}
    >
      {block.heading ? (
        <h3 className="dh-report__block-heading">{block.heading}</h3>
      ) : null}

      {/* 1. The headline figure. */}
      {block.total !== null ? (
        <p className="dh-report__headline">
          <span className="dh-report__figure">{block.total}</span>
          <span className="dh-report__figure-label">
            {result.measureLabel} · {result.periodLabel}
          </span>
        </p>
      ) : null}

      {empty ? (
        <p className="dh-report__absent">
          Nothing in this period matched. That is different from a figure of
          zero.
        </p>
      ) : (
        <>
          {/* 2. The rows, as ordinary text. Always. */}
          <ReportTable block={block} result={result} />
          {/* 3. The illustration, last. */}
          <ReportChart block={block} result={result} />
        </>
      )}
    </section>
  );
}

/**
 * The rows, as a real table.
 *
 * It scrolls inside its own container rather than making the page scroll
 * sideways, and the value column is right-aligned with tabular figures so a
 * column of amounts is comparable by eye.
 */
function ReportTable({
  block,
  result,
}: {
  readonly block: SerializedReportBlock;
  readonly result: SerializedReportResult;
}) {
  const periodColumn = result.shape === "series";
  return (
    <div className="dh-report__table-wrap">
      <table className="dh-report__table">
        <caption className="dh-visually-hidden">
          {result.measureLabel},{" "}
          {result.breakdownLabel.toLocaleLowerCase("en-AU")},{" "}
          {result.periodLabel}
          {block.currencyCode ? `, in ${block.currencyCode}` : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">{periodColumn ? "Period" : "Name"}</th>
            <th scope="col" className="dh-report__cell--figure">
              {result.measureLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {row.href ? <a href={row.href}>{row.label}</a> : row.label}
                {row.periodLabel ? (
                  <span className="dh-visually-hidden">
                    {" "}
                    ({row.periodLabel})
                  </span>
                ) : null}
              </th>
              <td className="dh-report__cell--figure">
                {/*
                 * A LEVEL measure's silent period says so in words. It is
                 * neither zero nor a blank cell, because a blank cell reads as
                 * a rendering failure and a zero is a lie.
                 */}
                {row.formatted ?? (
                  <span className="dh-report__no-reading">No reading</span>
                )}
                {row.detail ? (
                  <span className="dh-report__cell-detail">{row.detail}</span>
                ) : null}
              </td>
            </tr>
          ))}
          {block.remainder ? (
            <tr className="dh-report__row--remainder">
              <th scope="row">{block.remainder.label}</th>
              <td className="dh-report__cell--figure">
                {block.remainder.formatted}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** The chart, chosen by the definition's `visual`. Never the only reading. */
function ReportChart({
  block,
  result,
}: {
  readonly block: SerializedReportBlock;
  readonly result: SerializedReportResult;
}) {
  // `table` is a real choice: the rows ARE the report, and a chart beside them
  // adds nothing for a definition whose owner said so.
  if (result.visual === "table" || result.visual === "number") return null;

  if (result.shape === "grouped") {
    const rows: CategoryBarsRow[] = block.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value,
      formatted: row.formatted ?? "No reading",
      detail: row.detail ?? undefined,
      href: row.href ?? undefined,
    }));
    if (block.remainder) {
      // The remainder states a BOUND rather than a category, so it is drawn
      // without a bar — there is no share to compare it against.
      rows.push({
        key: "__remainder",
        label: block.remainder.label,
        value: block.remainder.value,
        formatted: block.remainder.formatted,
        remainder: true,
      });
    }
    return (
      <CategoryBars
        rows={rows}
        label={`${result.measureLabel}, ${result.breakdownLabel.toLocaleLowerCase("en-AU")}`}
        data-testid="report-bars"
      />
    );
  }

  if (result.shape === "series") {
    /*
     * `TrendBars` draws a magnitude per period, so an ABSENT reading cannot be
     * represented in it: a null drawn as a zero would be the exact lie the
     * result type exists to prevent. A series with any absent period therefore
     * draws NO chart, and the table above already states every value — which is
     * the honest trade, and the reason the table comes first.
     */
    if (block.rows.some((row) => row.value === null)) return null;
    const points: TrendBarPoint[] = block.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value ?? 0,
    }));
    if (points.length < 2) return null;
    return (
      <TrendBars
        points={points}
        caption={`${result.measureLabel} by period`}
        summary={`${result.measureLabel} across ${points.length} periods. ${block.rows
          .map((row) => `${row.label}: ${row.formatted ?? "no reading"}`)
          .join("; ")}.`}
      />
    );
  }

  return null;
}
