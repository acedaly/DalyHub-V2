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

describe("the table is never optional", () => {
  it("prints every label and value as text when the visual is BARS", () => {
    render(<ReportResultView result={result()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Groceries")).toBeInTheDocument();
    expect(within(table).getByText("$1,200.00")).toBeInTheDocument();
    expect(within(table).getByText("Rent")).toBeInTheDocument();
    expect(within(table).getByText("$500.00")).toBeInTheDocument();
    // And the chart is there too, as the illustration beside them.
    expect(screen.getByTestId("report-bars")).toBeInTheDocument();
  });

  it("prints them all when the visual is TABLE, with no chart", () => {
    render(<ReportResultView result={result({ visual: "table" })} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("report-bars")).toBeNull();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
  });

  it("puts the rows BEFORE the chart in the document", () => {
    const { container } = render(<ReportResultView result={result()} />);
    const nodes = [
      ...container.querySelectorAll(".dh-report__table, .dh-catbars"),
    ];
    expect(nodes.map((node) => node.className.split(" ")[0])).toEqual([
      "dh-report__table",
      "dh-catbars",
    ]);
  });

  it("leads with the headline figure", () => {
    const { container } = render(<ReportResultView result={result()} />);
    const first = container.querySelector(
      ".dh-report__headline, .dh-report__table",
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
     * And no chart at all: `TrendBars` draws a magnitude per period, so an
     * absent reading could only be drawn as a zero — the exact lie the result
     * type exists to prevent. The table above already states every value.
     */
    expect(document.querySelector(".dh-trend")).toBeNull();
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
    expect(screen.getAllByRole("table")).toHaveLength(2);
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
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByTestId("report-bars")).toBeNull();
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
    const table = screen.getByRole("table");
    expect(within(table).getByText("18 others")).toBeInTheDocument();
    expect(within(table).getByText("$412.00")).toBeInTheDocument();
  });
});
