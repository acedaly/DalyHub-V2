import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  evaluateAnalytics,
  rangeBuckets,
  rangeSpan,
  type AnalyticsFacts,
} from "~/kernel/analytics";
import { AnalyticsScreen } from "~/modules/analytics/AnalyticsScreen";
import type { AnalyticsPageData } from "~/modules/analytics/analytics-context";

const SPAN = rangeSpan("week", "2026-08-10");
const BUCKETS = rangeBuckets("week", SPAN);

function pageData(
  over: Partial<AnalyticsFacts> = {},
  page: Partial<AnalyticsPageData> = {},
): AnalyticsPageData {
  const facts: AnalyticsFacts = {
    range: "week",
    span: SPAN,
    buckets: BUCKETS,
    current: { tasksCompleted: 24, projectsCompleted: 3, goalsCompleted: 0 },
    previous: { tasksCompleted: 18, projectsCompleted: 4, goalsCompleted: 0 },
    series: BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      tasksCompleted: index + 1,
      projectsCompleted: 0,
      goalsCompleted: 0,
    })),
    areas: [
      {
        areaId: "a1",
        title: "Health & Fitness",
        tasksCompleted: 14,
        colourRank: 2,
      },
      {
        areaId: "a2",
        title: "Work & Career",
        tasksCompleted: 6,
        colourRank: 0,
      },
    ],
    areasBounded: false,
    areasAvailable: true,
    goals: { moving: 5, total: 9, bounded: false },
    overdueSeries: BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      overdue: 10 + index,
    })),
    overduePrevious: 12,
    overdueAvailable: true,
    ...over,
  };
  return {
    model: evaluateAnalytics(facts),
    range: facts.range,
    rangeLabel: "4 August 2026 – 10 August 2026",
    bucketLabels: BUCKETS.map((bucket) => bucket.endIso),
    bucketShortLabels: BUCKETS.map((bucket) => bucket.endIso.slice(5)),
    bucketDates: BUCKETS.map((bucket) => bucket.endIso),
    failed: false,
    ...page,
  };
}

function renderScreen(data: AnalyticsPageData, entry = "/analytics") {
  const router = createMemoryRouter(
    [{ path: "/analytics", element: <AnalyticsScreen data={data} /> }],
    { initialEntries: [entry] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Analytics screen (UIX-05)", () => {
  it("leads with the exact figures and the span they cover", () => {
    renderScreen(pageData());
    expect(
      screen.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("4 August 2026 – 10 August 2026"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("analytics-metric-tasks")).toHaveTextContent(
      "24",
    );
    expect(screen.getByTestId("analytics-metric-goals")).toHaveTextContent("5");
  });

  // A number the owner cannot check is a number they have to trust.
  it("links every figure to the records behind it", () => {
    renderScreen(pageData());
    expect(
      within(screen.getByTestId("analytics-metric-tasks")).getByRole("link"),
    ).toHaveAttribute(
      // V2.7 RECALL-02 — the figure's link lands on the SAME days it counts, in
      // completion order, rather than on the whole of the workspace's finished
      // work in edit order.
      "href",
      "/tasks?system=completed&sort=completed&completedFrom=2026-08-04&completedTo=2026-08-10",
    );
  });

  it("states the comparison as a checkable sentence, never a percentage", () => {
    renderScreen(pageData());
    expect(
      screen.getByText("6 more than the previous period (18)"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/%\s*vs/)).toBeNull();
  });

  it("offers the three spans as the surface's one view rail", () => {
    renderScreen(pageData());
    const rail = screen.getByRole("group", { name: "Analytics range" });
    expect(within(rail).getByRole("link", { name: /7 days/ })).toHaveAttribute(
      "href",
      "/analytics",
    );
    expect(
      within(rail).getByRole("link", { name: /12 weeks/ }),
    ).toHaveAttribute("href", "/analytics?range=quarter");
  });

  // Horizontal proportion bars, not a donut — and never colour alone.
  it("draws the distribution with each share stated in words", () => {
    renderScreen(pageData());
    const split = screen.getByRole("list", { name: "Completed work by Area" });
    expect(
      within(split).getByRole("img", {
        name: "Health & Fitness: 14 of 20 attributed Tasks, 70%",
      }),
    ).toBeInTheDocument();
    expect(within(split).getByText("70%")).toBeInTheDocument();
  });

  it("says a read failed rather than drawing a page of zeroes", () => {
    renderScreen(
      pageData(
        { current: null, previous: null, goals: null },
        { failed: true },
      ),
    );
    expect(
      screen.getByText("We couldn’t read your history"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-metric-tasks")).toBeNull();
  });

  it("shows ONE empty state when nothing was completed, not five empty panels", () => {
    renderScreen(
      pageData({
        current: { tasksCompleted: 0, projectsCompleted: 0, goalsCompleted: 0 },
        previous: {
          tasksCompleted: 0,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
        areas: [],
        // CONVERGE-01 §8 — a quiet period is only quiet if the BACKLOG is clear
        // too. See the test below, which is the other half of this rule.
        overdueSeries: BUCKETS.map((bucket) => ({
          key: bucket.key,
          overdue: 0,
        })),
        overduePrevious: 0,
      }),
    );
    expect(
      screen.getByText("Nothing completed in this period"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Completion trend")).toBeNull();
  });

  /*
   * CONVERGE-01 §8 — the empty state replaces the WHOLE surface, so a period
   * with no completions and an overdue backlog must not reach it: "nothing
   * completed" would be true and would hide the one thing the owner most needs
   * to see.
   */
  it("keeps the surface when nothing was completed but work is overdue", () => {
    renderScreen(
      pageData({
        current: { tasksCompleted: 0, projectsCompleted: 0, goalsCompleted: 0 },
        previous: {
          tasksCompleted: 0,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
        areas: [],
        overduePrevious: 0,
      }),
    );
    expect(screen.queryByText("Nothing completed in this period")).toBeNull();
    expect(screen.getByTestId("analytics-metric-overdue")).toBeInTheDocument();
  });

  /*
   * The metric card's figure and the right-hand end of the chart are the same
   * reading by construction, and the readout states the latest reading when
   * nothing is selected — so the two must agree on screen, not only in the model.
   */
  it("draws the overdue trend and names its latest reading in the readout", () => {
    renderScreen(pageData());
    const card = screen.getByTestId("analytics-metric-overdue");
    expect(card).toHaveTextContent("16");

    const chart = screen.getByTestId("analytics-overdue-trend");
    expect(within(chart).getByRole("status")).toHaveTextContent(
      /16 overdue at the close of/,
    );
    // The chart takes the STATUS ramp, which is the one meter vocabulary — never
    // a chart-local colour and never identity.
    expect(chart).toHaveAttribute("data-meter-status", "warning");
  });

  /*
   * CONVERGE-01 §I — the enumeration of every reading belongs to assistive tech,
   * not to the page's body text. The visible caption is one headline line.
   */
  it("hides the overdue enumeration behind the visible caption", () => {
    renderScreen(pageData());
    const chart = screen.getByTestId("analytics-overdue-trend");
    const caption = chart.querySelector("figcaption");
    expect(caption?.firstChild?.textContent).toBe(
      "16 overdue now, read at the close of each of 7 periods.",
    );
    expect(
      caption?.querySelector(".dh-visually-hidden")?.textContent,
    ).toContain("10");
  });

  it("says a failed overdue read rather than drawing a clear backlog", () => {
    renderScreen(
      pageData({
        overdueSeries: [],
        overduePrevious: null,
        overdueAvailable: false,
      }),
    );
    expect(screen.queryByTestId("analytics-overdue-trend")).toBeNull();
    expect(screen.getByTestId("analytics-metric-overdue")).toHaveTextContent(
      "Not available",
    );
  });

  // The attribution approximation is stated on the surface, not hidden.
  it("says how completed work is attributed", () => {
    renderScreen(pageData());
    expect(
      screen.getByText(/attributed to the Area its Project belongs to today/),
    ).toBeInTheDocument();
  });
});
