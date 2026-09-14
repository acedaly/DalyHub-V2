import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportResultView } from "~/modules/reports/ReportResultView";
import type { SerializedReportResult } from "~/modules/reports/reports-view";

/**
 * V2.13 — how a result is DRAWN, and the two things that must be true of every
 * drawing of one:
 *
 *   1. **The table is never optional.** `visual` chooses what is drawn BESIDE
 *      the rows, never whether they exist. A chart without a textual equivalent
 *      is a figure only a sighted reader on a wide screen can check.
 *   2. **Number, then rows, then chart**, in DOM order at every width — which is
 *      reading order and tab order, so the question is answerable with the chart
 *      removed.
 *
 * ── UNTITLED-17 — what these assertions had to become, and why ──────────────
 *
 * Both contracts are unchanged. Two MECHANISMS under them are:
 *
 *   - The rows are the genuine Untitled `application/table` now, which is React
 *     Aria's `Table` — and React Aria renders an interactive table as
 *     `role="grid"`. Every other migrated collection in the suite already
 *     queries `getByRole("grid")` for the same reason (`AreasCollection`,
 *     `GoalProjectsTab`). The assertion follows the product rather than pinning
 *     a role the product no longer has.
 *   - A GROUPED result no longer draws a second list beside the table. Its
 *     share is a `ProgressTrack` in a COLUMN of the same rows — Untitled's own
 *     collection-table grammar — because the old pairing printed the same
 *     labels, in the same order, with the same figures, twice (§14, §44). So
 *     "the rows come before the chart" is asserted where a chart still exists
 *     beside the rows: a SERIES, whose plot genuinely adds the shape across
 *     periods that the rows cannot.
 */

function result(
  over: Partial<SerializedReportResult> = {},
): SerializedReportResult {
  return {
    shape: "grouped",
    unit: "money",
    sourceLabel: "Finance",
    measureLabel: "Money out",
    windowLabel: "12 months",
    periodLabel: "8 September 2025 – 7 September 2026",
    breakdownLabel: "By category",
    visual: "bars",
    availability: "ok",
    bounded: false,
    computedAtIso: "2026-09-07T02:00:00.000Z",
    notes: [],
    blocks: [
      {
        key: "AUD",
        currencyCode: "AUD",
        heading: null,
        total: "$1,700.00",
        remainder: null,
        rows: [
          {
            key: "g",
            label: "Groceries",
            value: 120_000,
            formatted: "$1,200.00",
            detail: "12 records",
            periodLabel: null,
            href: null,
          },
          {
            key: "r",
            label: "Rent",
            value: 50_000,
            formatted: "$500.00",
            detail: null,
            periodLabel: null,
            href: null,
          },
        ],
      },
    ],
    ...over,
  };
}

/** A series over three whole months — the shape whose plot still sits beside
 * the rows, because it adds what the rows cannot: how the periods compare. */
const SERIES_OVER_THREE_MONTHS: Partial<SerializedReportResult> = {
  shape: "series",
  visual: "trend",
  breakdownLabel: "By month",
  blocks: [
    {
      key: "AUD",
      currencyCode: "AUD",
      heading: null,
      total: "$1,700.00",
      remainder: null,
      rows: [
        {
          key: "b0",
          label: "Jul 2026",
          value: 40_000,
          formatted: "$400.00",
          detail: null,
          periodLabel: "8 June 2026 – 7 July 2026",
          href: null,
        },
        {
          key: "b1",
          label: "Aug 2026",
          value: 60_000,
          formatted: "$600.00",
          detail: null,
          periodLabel: "8 July 2026 – 7 August 2026",
          href: null,
        },
        {
          key: "b2",
          label: "Sep 2026",
          value: 70_000,
          formatted: "$700.00",
          detail: null,
          periodLabel: "8 August 2026 – 7 September 2026",
          href: null,
        },
      ],
    },
  ],
};

describe("the table is never optional", () => {
  it("prints every label and value as text when the visual is BARS", () => {
    render(<ReportResultView result={result()} />);
    const table = screen.getByRole("grid");
    expect(within(table).getByText("Groceries")).toBeInTheDocument();
    expect(within(table).getByText("$1,200.00")).toBeInTheDocument();
    expect(within(table).getByText("Rent")).toBeInTheDocument();
    expect(within(table).getByText("$500.00")).toBeInTheDocument();
    /*
     * And the comparison is drawn against them, in the same rows — each bar
     * announcing the figure in the cell beside it, never a percentage the page
     * does not print.
     */
    const bars = within(table).getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    /*
     * The shared bar always announces "NN% — …", where the percentage is the
     * bar's own value and the figure is the fact. The share is taken against
     * the LARGEST ROW, so the leader is full and every other bar is honestly
     * relative to it — a bounded report's rows do not add up to its total.
     */
    expect(bars[0]).toHaveAttribute("aria-valuetext", "100% — $1,200.00");
    expect(bars[1]).toHaveAttribute("aria-valuetext", "42% — $500.00");
  });

  it("prints them all when the visual is TABLE, with no chart", () => {
    render(<ReportResultView result={result({ visual: "table" })} />);
    const table = screen.getByRole("grid");
    expect(table).toBeInTheDocument();
    expect(within(table).queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
  });

  it("refuses a share column it cannot draw honestly", () => {
    /*
     * A share of a mixed-sign set is not a quantity: a −$400 refund and a $400
     * expense are not "the same size" in opposite directions on a track that
     * starts at zero. The rows still print both figures.
     */
    render(
      <ReportResultView
        result={result({
          blocks: [
            {
              key: "AUD",
              currencyCode: "AUD",
              heading: null,
              total: "$0.00",
              remainder: null,
              rows: [
                {
                  key: "g",
                  label: "Groceries",
                  value: 40_000,
                  formatted: "$400.00",
                  detail: null,
                  periodLabel: null,
                  href: null,
                },
                {
                  key: "r",
                  label: "Refunds",
                  value: -40_000,
                  formatted: "-$400.00",
                  detail: null,
                  periodLabel: null,
                  href: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("-$400.00")).toBeInTheDocument();
  });

  it("puts the rows BEFORE the series plot in the document", () => {
    const { container } = render(
      <ReportResultView result={result(SERIES_OVER_THREE_MONTHS)} />,
    );
    const nodes = [
      ...container.querySelectorAll(".dh-report__table-wrap, .dh-chart"),
    ];
    expect(nodes.map((node) => node.className.split(" ")[0])).toEqual([
      "dh-report__table-wrap",
      "dh-chart",
    ]);
  });

  it("leads with the headline figure", () => {
    const { container } = render(<ReportResultView result={result()} />);
    const first = container.querySelector(
      ".dh-report__headline, .dh-report__table-wrap",
    );
    expect(first?.className).toContain("dh-report__headline");
    expect(screen.getByText("$1,700.00")).toBeInTheDocument();
  });
});

describe("what a figure never becomes", () => {
  it("says NO READING rather than drawing a zero", () => {
    render(
      <ReportResultView
        result={result({
          shape: "series",
          unit: "value",
          visual: "trend",
          blocks: [
            {
              key: "default",
              currencyCode: null,
              heading: null,
              // A `latest` measure has no meaningful total, so none is printed.
              total: null,
              remainder: null,
              rows: [
                {
                  key: "b0",
                  label: "Jul 2026",
                  value: 78,
                  formatted: "78",
                  detail: null,
                  periodLabel: "8 June 2026 – 7 July 2026",
                  href: null,
                },
                {
                  key: "b1",
                  label: "Aug 2026",
                  value: null,
                  formatted: null,
                  detail: null,
                  periodLabel: "8 July 2026 – 7 August 2026",
                  href: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("No reading")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    /*
     * And no chart at all: a bar draws a magnitude per period, so an absent
     * reading could only be drawn as a zero — the exact lie the result type
     * exists to prevent. The table above already states every value.
     */
    expect(screen.queryByTestId("report-trend")).toBeNull();
    // The full period is VISIBLE, because a month bucket is not always a
    // calendar month.
    expect(screen.getByText("8 July 2026 – 7 August 2026")).toBeInTheDocument();
  });

  it("draws one section per currency, and never a sum across them", () => {
    render(
      <ReportResultView
        result={result({
          blocks: [
            {
              key: "AUD",
              currencyCode: "AUD",
              heading: "Australian Dollar",
              total: "$1,700.00",
              remainder: null,
              rows: [
                {
                  key: "g",
                  label: "Groceries",
                  value: 170_000,
                  formatted: "$1,700.00",
                  detail: null,
                  periodLabel: null,
                  href: null,
                },
              ],
            },
            {
              key: "GBP",
              currencyCode: "GBP",
              heading: "British Pound",
              total: "£99.00",
              remainder: null,
              rows: [
                {
                  key: "g",
                  label: "Groceries",
                  value: 9_900,
                  formatted: "£99.00",
                  detail: null,
                  periodLabel: null,
                  href: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getAllByRole("grid")).toHaveLength(2);
    expect(screen.getByText("Australian Dollar")).toBeInTheDocument();
    expect(screen.getByText("British Pound")).toBeInTheDocument();
    // There is no shape in which the two meet, so there is no combined figure.
    expect(screen.queryByText("$1,799.00")).toBeNull();
  });

  it("says NOT AVAILABLE for a failed read, rather than an empty chart", () => {
    render(
      <ReportResultView
        result={result({ availability: "unavailable", blocks: [] })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /could not be read just now/i,
    );
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByTestId("report-trend")).toBeNull();
  });

  it("states a bound as an arithmetically truthful remainder row", () => {
    render(
      <ReportResultView
        result={result({
          bounded: true,
          blocks: [
            {
              key: "AUD",
              currencyCode: "AUD",
              heading: null,
              total: "$1,700.00",
              remainder: {
                label: "18 others",
                formatted: "$412.00",
                value: 41_200,
              },
              rows: [
                {
                  key: "g",
                  label: "Groceries",
                  value: 128_800,
                  formatted: "$1,288.00",
                  detail: null,
                  periodLabel: null,
                  href: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    const table = screen.getByRole("grid");
    expect(within(table).getByText("18 others")).toBeInTheDocument();
    expect(within(table).getByText("$412.00")).toBeInTheDocument();
    /*
     * A bound on the list is not a member of it, so it draws no bar: there is
     * nothing for the eye to compare "18 others" against, and a track for it
     * would invite exactly that comparison. One row, one bar.
     */
    expect(within(table).getAllByRole("progressbar")).toHaveLength(1);
  });
});
