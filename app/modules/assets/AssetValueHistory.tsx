/**
 * ASSET-02 / UNTITLED-16 — the Asset value history.
 *
 * A deliberately modest presentation of recorded valuations: the current
 * recorded value, a plain-language summary, the series, and the dated list. No
 * depreciation curve, no market estimate, no inferred worth (§16, §29) —
 * DalyHub shows what the owner recorded and nothing it cannot know.
 *
 * ── UNTITLED-16: the bars were a chart, and are now the chart ───────────────
 *
 * This drew a `<span>` per row whose `width` was `value / max` as a percentage,
 * with no axis, no scale and no zero — so a $42,000 valuation beside a $40,000
 * one drew bars of 100% and 95%, which reads as "almost the same" and is exactly
 * the misreading a value axis exists to prevent. It is the CSS-based chart
 * UNTITLED_UI_MIGRATION §40 asks to be classified and, being a dated numeric
 * series with a trend gate already in it, it classifies as a genuine chart
 * rather than as a progress indicator.
 *
 * It is `MeasurementTrend` now — the shared Untitled/Recharts foundation, the
 * same plot the Goal and Habit trends draw — so it has a real value axis, a real
 * time axis, a keyboard-steppable readout and the frame's required text form.
 * What did NOT change: it still appears only above two points (two points are
 * two points, not a trend), it still draws no target and no projection, and the
 * dated list beneath it still carries every value as text.
 *
 * The list is the genuine Untitled `application/table`: Date, Value, Source.
 * Money is right-aligned and tabular, which is what makes a column of
 * valuations comparable at a glance and is the one thing the old `<ol>` of
 * spans could not do.
 */

import { MeasurementTrend } from "~/shared/charts";
import { money } from "~/shared/finance";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

import { formatAssetDate } from "./asset-dates";
import type { SerializedValueHistory } from "./asset-history-view";

interface AssetValueHistoryProps {
  readonly history: SerializedValueHistory;
}

export function AssetValueHistory({ history }: AssetValueHistoryProps) {
  if (history.points.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        No valuations recorded yet. Record one from the History tab to start
        tracking what this asset is worth.
      </p>
    );
  }

  /*
   * The plot is drawn only where the SERIES supports one: more than two points
   * (the existing `hasTrend` rule, unchanged) and one currency across all of
   * them. A value axis cannot hold two currencies, because DalyHub never
   * converts between them — so a mixed history keeps its numbers and loses its
   * picture, which is the honest outcome rather than a plot of added-up money
   * that does not exist.
   */
  const plot =
    history.hasTrend && history.singleCurrency && history.currencyCode !== null;
  const currency = history.currencyCode;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {history.currentAmount ? (
        <p className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-tertiary">
            Current recorded value
          </span>
          <span className="text-display-xs font-semibold text-primary tabular-nums">
            {history.currentAmount}
          </span>
        </p>
      ) : null}

      {/* The text summary IS the accessible version of the plot below. */}
      {history.summary ? (
        <p className="m-0 text-sm text-tertiary">{history.summary}</p>
      ) : null}

      {plot ? (
        <MeasurementTrend
          points={history.points.map((point) => ({
            key: point.eventId,
            date: point.date,
            value: point.minor,
          }))}
          /*
           * The summary the serialiser already wrote, plus every reading. The
           * frame requires the series in words; enumerating it is what makes the
           * plot optional rather than load-bearing.
           */
          summary={`${history.summary ?? "Recorded valuations."} ${history.points
            .map((point) => `${point.dateLabel}: ${point.amount}`)
            .join("; ")}.`}
          /*
           * No visible caption: the summary paragraph above the plot already
           * states the series in words, and printing it again beneath would say
           * the same sentence twice on one surface. The full enumeration stays
           * in the document for assistive tech, which is what `ChartFrame` does
           * with a summary it is not asked to draw.
           */
          caption=""
          formatValue={(value) => money(value, currency!)}
          formatDate={(iso) => formatAssetDate(iso) ?? iso}
          seriesLabel="Recorded valuations"
          restingReading={
            history.currentAmount === null
              ? undefined
              : `Latest recorded value ${history.currentAmount}.`
          }
          data-testid="asset-value-trend"
        />
      ) : null}

      {/*
       * Adapted from the Untitled UI React `application/table` source. Changes:
       * DalyHub's valuation columns.
       */}
      {/*
        No ring and no shadow: this table lives inside a disclosure inside a
        record panel, and both already draw a boundary. See `AssetDatesTab` for
        the full argument.
      */}
      <TableCard.Root
        size="sm"
        className="overflow-hidden rounded-lg bg-primary"
        data-untitled-source="application/table:table-card"
      >
        <Table
          aria-label="Recorded valuations, oldest first, with where each figure came from."
          size="sm"
          className="table-fixed bg-primary"
          data-testid="asset-value-list"
        >
          <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3">
            <LabelledTableHead
              id="date"
              label="Date"
              isRowHeader
              className="w-[32%] whitespace-nowrap"
            />
            <LabelledTableHead
              id="value"
              label="Value"
              className="w-[30%] text-right [&>span]:justify-end"
            />
            <LabelledTableHead id="source" label="Source" className="w-[38%]" />
          </Table.Header>
          <Table.Body>
            {history.points.map((point) => (
              <Table.Row
                key={point.eventId}
                id={point.eventId}
                size="sm"
                className="h-auto min-h-12 bg-primary hover:bg-secondary"
              >
                <Table.Cell className="px-5 py-3 max-sm:px-3 text-sm whitespace-nowrap text-secondary">
                  {point.dateLabel}
                </Table.Cell>
                <Table.Cell className="px-5 py-3 max-sm:px-3 text-right text-sm font-medium whitespace-nowrap text-primary tabular-nums">
                  {point.amount}
                </Table.Cell>
                <Table.Cell className="px-5 py-3 max-sm:px-3 text-sm break-words text-tertiary">
                  {point.source ?? (
                    <span>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Source not recorded</span>
                    </span>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </TableCard.Root>
    </div>
  );
}
