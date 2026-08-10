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
    goals: { onTrack: 5, total: 9, bounded: false },
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
  it("leads with four exact figures and the span they cover", () => {
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
    ).toHaveAttribute("href", "/tasks?system=completed");
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
      }),
    );
    expect(
      screen.getByText("Nothing completed in this period"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Completion trend")).toBeNull();
  });

  // The attribution approximation is stated on the surface, not hidden.
  it("says how completed work is attributed", () => {
    renderScreen(pageData());
    expect(
      screen.getByText(/attributed to the Area its Project belongs to today/),
    ).toBeInTheDocument();
  });
});
