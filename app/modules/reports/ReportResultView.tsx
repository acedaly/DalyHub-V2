/**
 * V2.13 RPT-04 / UNTITLED-17 — how a result is DRAWN.
 *
 * ── Number, then rows, then chart. In that order, at every width ───────────
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
 * ── UNTITLED-17: the rows ARE the Untitled table, and the grouped chart is a
 *    COLUMN of it rather than a second drawing of the same list ─────────────
 *
 * This drew a hand-written `<table class="dh-report__table">` and then, beneath
 * it, `CategoryBars` — a hand-written `<svg>` rectangle per row. For a grouped
 * result the two said exactly the same thing: the same labels, in the same
 * order, with the same figures, twice. The audit's rule (§14) is that a table is
 * preferable to a chart when precise comparison is the task, and (§44) that a
 * surface must not be a dashboard for its own sake.
 *
 * So the rows are now the genuine Untitled `application/table`, and a grouped
 * result's SHARE is a proportion bar in a column of it — Untitled's own
 * collection-table grammar (`informational-02/06`: a filterable collection table
 * with status badges and progress bars, already inspected and recorded for the
 * Tasks and Projects phases). One reading of the list, with the comparison drawn
 * against it. The bar is `ProgressTrack`, which is Untitled's `ProgressBarBase`;
 * nothing here paints a track.
 *
 * A SERIES keeps its plot beneath the table, because there the chart genuinely
 * adds what the rows cannot: the shape across periods. It is `PeriodTotals`
 * now — `application/charts-base` over Recharts, with a real value axis — rather
 * than the stretched `TrendBars` SVG whose scale existed only in the figures
 * printed under it.
 *
 * ── One block per currency ─────────────────────────────────────────────────
 * A money result renders one section per currency, each with its own heading,
 * its own total and its own chart. There is no arrangement in which two
 * currencies share an axis, because there is no shape in which they share a
 * block.
 *
 * Presentation only.
 */

import { formatMinorUnits } from "~/kernel/money";
import { PeriodTotals, type PeriodTotalsPoint } from "~/shared/charts";
import { ProgressTrack } from "~/shared/progress";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

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

/**
 * Whether this block's rows may carry a proportion bar.
 *
 * Three refusals, each of which would otherwise draw a bar that lies:
 *
 *   - the definition asked for no illustration (`table`, `number`);
 *   - a row has NO READING, so there is no magnitude to scale;
 *   - any value is negative, because a share of a mixed-sign set is not a
 *     quantity — a −$400 refund and a $400 expense are not "the same size" in
 *     opposite directions on a track that starts at zero.
 */
function shareColumnIsHonest(
  block: SerializedReportBlock,
  result: SerializedReportResult,
): boolean {
  if (result.visual === "table" || result.visual === "number") return false;
  if (result.shape !== "grouped") return false;
  if (block.rows.length === 0) return false;
  return block.rows.every((row) => row.value !== null && row.value >= 0);
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
          {/* 3. The series plot, last — and only where it adds a shape. */}
          <ReportTrend block={block} result={result} />
        </>
      )}
    </section>
  );
}

/**
 * The rows, as the genuine Untitled `application/table`.
 *
 * COMPOSED from the vendored Untitled components — no Untitled source is copied
 * here; the vendored file carries the provenance. The columns are DalyHub's.
 *
 * The card scrolls inside its own container rather than making the page scroll
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
  const withShare = shareColumnIsHonest(block, result);
  /*
   * The denominator is the LARGEST ROW, not the block total, and the difference
   * matters. A bounded report's rows do not add up to its total — the remainder
   * holds the rest — so scaling against the total would draw every bar short by
   * an amount the reader cannot see. Against the largest row the leader is full
   * and every other bar is honestly relative to it, which is what a ranking
   * asks and all this column claims.
   *
   * Which is exactly why the column is NOT called "Share". It was, and that was
   * a defect: a $500 row in a $1,700 result drew at 42% of the $1,200 leader,
   * and a column headed "Share" states that 42% is its share of the whole. It
   * is not; its share is 29%. The name now says what the bar measures, and the
   * bar announces the FIGURE rather than the fraction it was drawn at — a
   * percentage nobody can act on is not worth the sentence it costs a screen
   * reader, and the honest one is not computable here anyway: `block.total` is
   * a formatted string, and a measure that does not add up has none at all.
   */
  const peak = withShare
    ? Math.max(...block.rows.map((row) => row.value ?? 0))
    : 0;

  return (
    <div className="dh-report__table-wrap">
      <TableCard.Root
        size="sm"
        className="overflow-hidden"
        data-untitled-source="application/table:table-card"
      >
        <Table
          aria-label={`${result.measureLabel}, ${result.breakdownLabel.toLocaleLowerCase("en-AU")}, ${result.periodLabel}${
            block.currencyCode ? `, in ${block.currencyCode}` : ""
          }`}
          size="sm"
          className="dh-report__table table-fixed bg-primary"
        >
          <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3">
            <LabelledTableHead
              id="name"
              label={periodColumn ? "Period" : "Name"}
              isRowHeader
              className={withShare ? "w-[38%]" : "w-[58%]"}
            />
            {withShare ? (
              <LabelledTableHead
                id="share"
                label="Relative size"
                /*
                 * The column IS named, and the name is drawn: the bars are a
                 * comparison rather than decoration, so a reader moving across
                 * the row hears which column they are in (§54).
                 */
                className="w-[30%]"
              />
            ) : null}
            <LabelledTableHead
              id="value"
              label={result.measureLabel}
              className="w-[42%] text-right [&>span]:justify-end"
            />
          </Table.Header>
          <Table.Body>
            {block.rows.map((row) => (
              <Table.Row key={row.key} id={row.key} size="sm">
                <Table.Cell className="px-5 py-3 text-sm break-words text-primary max-sm:px-3">
                  {row.href ? (
                    <a
                      className="rounded-sm underline decoration-transparent underline-offset-2 outline-focus-ring transition duration-100 ease-linear hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                      href={row.href}
                    >
                      {row.label}
                    </a>
                  ) : (
                    row.label
                  )}
                  {/*
                   * The full period, VISIBLY, beneath the short one.
                   *
                   * A month bucket is not always a calendar month: the history
                   * kernel generates buckets backward from the window's END so
                   * the most recent one is always whole, so a window ending on
                   * 7 September tiles into 8 August – 7 September. Labelling
                   * that "Aug 2026" and hiding the span from sight would be the
                   * table describing a period it is not showing.
                   */}
                  {row.periodLabel ? (
                    <span className="mt-0.5 block text-xs text-tertiary">
                      {row.periodLabel}
                    </span>
                  ) : null}
                </Table.Cell>
                {withShare ? (
                  <Table.Cell
                    className="px-5 py-3 max-sm:px-3"
                    data-testid="report-share"
                  >
                    <ProgressTrack
                      label={row.label}
                      percent={peak > 0 ? ((row.value ?? 0) / peak) * 100 : 0}
                      /*
                       * The bar announces the FIGURE in the next cell, never the
                       * percentage it happens to be drawn at: the figure is the
                       * fact, and the scaling is only how it was fitted to the
                       * column. `range` is what makes that possible — without it
                       * the bar prepends its own drawn percentage, which is the
                       * fraction OF THE LEADER and reads as a share of the whole.
                       *
                       * A degenerate all-zero block leaves `peak` at 0, and a
                       * bar with `valuemax` 0 is not a bar; the announced text
                       * is the row's own "$0.00" either way.
                       */
                      range={{
                        min: 0,
                        max: Math.max(peak, 1),
                        now: row.value ?? 0,
                      }}
                      valueText={row.formatted ?? "No reading"}
                      complete={false}
                    />
                  </Table.Cell>
                ) : null}
                <Table.Cell className="dh-report__cell--figure px-5 py-3 text-right text-sm font-medium whitespace-nowrap text-primary tabular-nums max-sm:px-3">
                  {/*
                   * A LEVEL measure's silent period says so in words. It is
                   * neither zero nor a blank cell, because a blank cell reads as
                   * a rendering failure and a zero is a lie.
                   */}
                  {row.formatted ?? (
                    <span className="dh-report__no-reading font-normal text-tertiary">
                      No reading
                    </span>
                  )}
                  {row.detail ? (
                    <span className="mt-0.5 block text-xs font-normal text-tertiary">
                      {row.detail}
                    </span>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
            {block.remainder ? (
              /*
               * A bound on the list, not a member of it — so no bar. There is
               * nothing for the eye to compare "18 others" against, and drawing
               * a track for it would invite exactly that comparison.
               */
              <Table.Row
                key="__remainder"
                id="__remainder"
                size="sm"
                className="dh-report__row--remainder"
              >
                <Table.Cell className="px-5 py-3 text-sm break-words text-tertiary max-sm:px-3">
                  {block.remainder.label}
                </Table.Cell>
                {withShare ? (
                  <Table.Cell className="px-5 py-3 max-sm:px-3" />
                ) : null}
                <Table.Cell className="dh-report__cell--figure px-5 py-3 text-right text-sm whitespace-nowrap text-tertiary tabular-nums max-sm:px-3">
                  {block.remainder.formatted}
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table>
      </TableCard.Root>
    </div>
  );
}

/** The series plot, beneath the rows. Never the only reading. */
function ReportTrend({
  block,
  result,
}: {
  readonly block: SerializedReportBlock;
  readonly result: SerializedReportResult;
}) {
  // `table` and `number` are real choices: the rows ARE the report, and a plot
  // beside them adds nothing for a definition whose owner said so.
  if (result.visual === "table" || result.visual === "number") return null;
  if (result.shape !== "series") return null;

  /*
   * A bar draws a magnitude per period, so an ABSENT reading cannot be
   * represented in it: a null drawn as a zero would be the exact lie the result
   * type exists to prevent. A series with any absent period therefore draws NO
   * chart, and the table above already states every value — which is the honest
   * trade, and the reason the table comes first.
   */
  if (block.rows.some((row) => row.value === null)) return null;
  const points: PeriodTotalsPoint[] = block.rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value ?? 0,
  }));
  if (points.length < 2) return null;

  /*
   * The axis formats a value the way the ROWS do — and it must be able to
   * format ANY value, not only the ones a row happens to carry.
   *
   * A first draft looked each tick up in the rows it came from and fell back to
   * a plain number. `niceDomain` chooses round ticks, which in a money report
   * are round MINOR units — 0, 20000, 40000 — and almost never coincide with a
   * reading. That axis read "20,000" beside rows reading "$400.00": the scale
   * of the plot silently in a different unit from the table above it, which is
   * the exact class of contradiction this module refuses everywhere else.
   *
   * So the unit decides the formatter, from the block's own currency.
   */
  const formatValue = (value: number): string =>
    result.unit === "money" && block.currencyCode !== null
      ? formatMinorUnits(value, block.currencyCode)
      : new Intl.NumberFormat("en-AU", {
          maximumFractionDigits: result.unit === "count" ? 0 : 2,
        }).format(value);

  return (
    <PeriodTotals
      points={points}
      seriesLabel={result.measureLabel}
      caption={`${result.measureLabel} by period`}
      summary={`${result.measureLabel} across ${points.length} periods. ${block.rows
        .map((row) => `${row.label}: ${row.formatted ?? "no reading"}`)
        .join("; ")}.`}
      /*
       * Money is whole-numbered too, because money crosses this boundary in
       * MINOR units. A domain of 1–2 (yen, or cents) lets `niceDomain` choose a
       * step of 0.5, and half a minor unit is not a quantity that exists:
       * `formatMinorUnits` rounds those ticks into an axis reading ¥0, ¥1, ¥1,
       * ¥2 — duplicate labels at unequal spacing. `value` is the only unit that
       * may be fractional, because it is the only one that is not a currency or
       * a count of things.
       */
      wholeNumbers={result.unit === "count" || result.unit === "money"}
      formatValue={formatValue}
      data-testid="report-trend"
    />
  );
}
