import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  evaluateAnalytics,
  insightWindowDays,
  type AnalyticsBucket,
  type AnalyticsFacts,
} from "~/kernel/analytics";
import { AnalyticsScreen } from "~/modules/analytics/AnalyticsScreen";
import type { AnalyticsPageData } from "~/modules/analytics/analytics-context";

const TODAY = "2026-08-10";
const SPAN = insightWindowDays("this-week", TODAY);

/**
 * The seven daily buckets of the "7 days" window, spelled out rather than cut
 * by the bucketer — these tests are about the SCREEN, and a fixture that
 * recomputed the bucketer would test it a second time in the wrong file.
 */
const BUCKETS: readonly AnalyticsBucket[] = Array.from(
  { length: 7 },
  (_value, index) => {
    const day = new Date(`${SPAN.startIso}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const iso = day.toISOString().slice(0, 10);
    return { key: `b${index}`, startIso: iso, endIso: iso };
  },
);

function pageData(
  over: Partial<AnalyticsFacts> = {},
  page: Partial<AnalyticsPageData> = {},
): AnalyticsPageData {
  const facts: AnalyticsFacts = {
    window: "this-week",
    grain: "day",
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
    measuredGoals: [],
    measuredGoalsBounded: false,
    measuredGoalsAvailable: true,
    goalContributions: [],
    seriesBounded: false,
    seriesBound: null,
    overdueMoments: 0,
    ...over,
  };
  return {
    model: evaluateAnalytics(facts),
    window: facts.window,
    grain: facts.grain,
    grains: ["day"],
    rangeLabel: "4 August 2026 – 10 August 2026",
    bucketLabels: BUCKETS.map((bucket) => bucket.endIso),
    bucketShortLabels: BUCKETS.map((bucket) => bucket.endIso.slice(5)),
    bucketDates: BUCKETS.map((bucket) => bucket.endIso),
    failed: false,
    ...page,
  };
}

/*
 * V2.9 INS-04 — the "What changed" panel fetches its first page on mount, so
 * every render in this file would otherwise attempt a real request. An empty
 * page is the right default: these tests are about the rest of the surface,
 * and the feed's own behaviour is proved against real D1 in
 * `test/kernel/ins-04-what-changed.test.ts`.
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    // Twice, deliberately (V2.9 INS-04): once as the page's subtitle and once
    // on the "What changed" panel, which sits below a full page of scroll and
    // would otherwise be a list of events with no stated period.
    expect(screen.getAllByText("4 August 2026 – 10 August 2026")).toHaveLength(
      2,
    );
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

  it("offers every Insight window as the surface's one view rail", () => {
    renderScreen(pageData());
    const rail = screen.getByRole("group", { name: "Insight window" });
    expect(within(rail).getByRole("link", { name: /7 days/ })).toHaveAttribute(
      "href",
      "/analytics?window=this-week",
    );
    // The DEFAULT window carries no parameter, so two equivalent states always
    // produce the same link.
    expect(
      within(rail).getByRole("link", { name: /12 weeks/ }),
    ).toHaveAttribute("href", "/analytics");
    expect(
      within(rail).getByRole("link", { name: /24 months/ }),
    ).toHaveAttribute("href", "/analytics?window=24-months");
  });

  /*
   * V2.9 INS-03 — changing the WINDOW drops the grain.
   *
   * A grain the new window cannot hold would otherwise be silently substituted
   * by the loader while the URL kept claiming it, which is the page describing
   * a series it is not showing.
   */
  it("drops the grain when the window changes", () => {
    renderScreen(
      pageData({}, { window: "12-months", grain: "week", grains: ["week"] }),
      "/analytics?window=12-months&grain=week",
    );
    const rail = screen.getByRole("group", { name: "Insight window" });
    expect(within(rail).getByRole("link", { name: /7 days/ })).toHaveAttribute(
      "href",
      "/analytics?window=this-week",
    );
  });

  /*
   * The grain control offers only the grains the window can actually hold, and
   * is absent entirely where there is nothing to choose — a control with one
   * option is a label pretending to be a choice.
   */
  it("offers the grain only where the window has more than one", () => {
    const { unmount } = renderScreen(pageData());
    expect(screen.queryByRole("group", { name: "Insight grain" })).toBeNull();
    unmount();

    renderScreen(
      pageData(
        {},
        { window: "12-weeks", grain: "week", grains: ["day", "week"] },
      ),
    );
    const control = screen.getByRole("group", { name: "Insight grain" });
    expect(within(control).getByRole("link", { name: "Daily" })).toBeTruthy();
    expect(within(control).getByRole("link", { name: "Weekly" })).toBeTruthy();
    expect(within(control).queryByRole("link", { name: "Monthly" })).toBeNull();
  });

  /*
   * EVERY grain writes itself into the URL, including the first.
   *
   * An absent `?grain=` does not mean "daily" — it means "this window's own
   * default", which is weekly for 12 weeks and daily for 4. A "Daily" link
   * that merely dropped the parameter would hand back weekly on exactly the
   * windows where the owner pressed it to get away from weekly, which is a
   * control that silently does nothing.
   */
  it("makes every grain state itself in the URL, not just the non-default ones", () => {
    renderScreen(
      pageData(
        {},
        { window: "12-weeks", grain: "week", grains: ["day", "week"] },
      ),
    );
    const control = screen.getByRole("group", { name: "Insight grain" });
    expect(
      within(control).getByRole("link", { name: "Daily" }),
    ).toHaveAttribute("href", "/analytics?grain=day");
    expect(
      within(control).getByRole("link", { name: "Weekly" }),
    ).toHaveAttribute("href", "/analytics?grain=week");
  });

  /*
   * V2.9 INS-03 — Projects and Goals completed get their own compact lines
   * rather than a third and fourth line on the Tasks plot: a shared axis would
   * flatten them into the baseline, and the figure is always in words beside
   * the shape.
   */
  it("gives Projects and Goals their own line, with the figure in words", () => {
    renderScreen(
      pageData({
        series: BUCKETS.map((bucket, index) => ({
          key: bucket.key,
          tasksCompleted: index + 1,
          projectsCompleted: index % 2,
          goalsCompleted: 0,
        })),
      }),
    );
    const list = screen.getByRole("list", { name: "Also completed" });
    expect(within(list).getByText("Projects completed")).toBeInTheDocument();
    expect(within(list).getByText("3")).toBeInTheDocument();
    // Absence renders less: a series with no completions is not drawn at all,
    // because a flat line at zero asserts a shape a missing row says better.
    expect(within(list).queryByText("Goals completed")).toBeNull();
  });

  it("draws no secondary lines at all when neither had a completion", () => {
    renderScreen(pageData());
    expect(screen.queryByRole("list", { name: "Also completed" })).toBeNull();
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

/* -------------------------------------------------------------------------- */
/* V2.9 INS-04 — "What changed"                                                */
/* -------------------------------------------------------------------------- */

describe("the What changed panel", () => {
  it("names the window it is showing, and asks the endpoint for that window", async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(
        JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    {
      renderScreen(
        pageData({}, { window: "12-weeks", grain: "week", grains: ["week"] }),
      );
      // The panel names its period, so the list and the charts above it can
      // never be read as different windows.
      expect(
        screen.getByRole("heading", { name: "What changed" }),
      ).toBeInTheDocument();
      await waitFor(() => expect(requested.length).toBeGreaterThan(0));
      // …and it asks for exactly that window, in the SAME vocabulary the
      // address bar uses.
      expect(requested[0]).toContain("/analytics/activity?window=12-weeks");
      expect(requested[0]).not.toContain("cursor");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* V2.9 INS-03 — the measured-Goal series                                      */
/* -------------------------------------------------------------------------- */

describe("the Goals panel", () => {
  const GOAL = {
    goalId: "g1",
    title: "Reach 70 kg",
    to: "/goals/g1",
    unit: "kg",
    bounded: false,
    points: [
      { key: "2026-06-01", value: 85 },
      { key: "2026-07-01", value: 82 },
      { key: "2026-08-01", value: 79 },
    ],
  };

  it("states each Goal's reading in words beside its shape", () => {
    renderScreen(pageData({ measuredGoals: [GOAL] }));
    const list = screen.getByRole("list", { name: "Goals" });
    expect(
      within(list).getByRole("link", { name: "Reach 70 kg" }),
    ).toHaveAttribute("href", "/goals/g1");
    expect(within(list).getByText(/85 → 79/)).toBeInTheDocument();
    expect(within(list).getByText("3 readings")).toBeInTheDocument();
    // The sparkline is the one chart in DalyHub that is decoration: it always
    // sits beside the same figures in text, so it is hidden from assistive tech.
    expect(list.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  // ADR-079 d11 — a bounded series says so where it is drawn, never elsewhere.
  it("says a compact series is the RECENT readings, not all of them", () => {
    renderScreen(pageData({ measuredGoals: [{ ...GOAL, bounded: true }] }));
    expect(screen.getByText("3 most recent readings")).toBeInTheDocument();
  });

  it("says a failed read rather than drawing an unmeasured workspace", () => {
    renderScreen(pageData({ measuredGoalsAvailable: false }));
    expect(screen.queryByRole("list", { name: "Goals" })).toBeNull();
    expect(
      screen.getByText(/This panel could not be read just now/),
    ).toBeInTheDocument();
  });

  it("distinguishes no measured Goal from a failed read", () => {
    renderScreen(pageData({ measuredGoals: [], current: null }));
    expect(
      screen.getByText(/No Goal has two readings yet/),
    ).toBeInTheDocument();
  });

  /*
   * A Goal with no measurement has no shape to draw, so it gets the Reviews'
   * own sentence instead — and that sentence names its own window, because a
   * Review period is not the span the owner selected.
   */
  it("gives an unmeasured Goal the across-Reviews sentence, with its window", () => {
    renderScreen(
      pageData({
        measuredGoals: [],
        goalContributions: [
          {
            goalId: "g2",
            title: "Run a half marathon",
            state: "moving",
            count: 3,
            of: 4,
            everyReview: false,
            states: [],
          },
        ],
      }),
    );
    const list = screen.getByRole("list", { name: "Goals" });
    expect(
      within(list).getByText("Moving at 3 of your last 4 Reviews"),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: "Run a half marathon" }),
    ).toHaveAttribute("href", "/goals/g2");
  });

  // One Goal, one row: a sparkline says more than a Review count would add.
  it("never gives a measured Goal a second row", () => {
    renderScreen(
      pageData({
        measuredGoals: [GOAL],
        goalContributions: [
          {
            goalId: GOAL.goalId,
            title: GOAL.title,
            state: "moving",
            count: 3,
            of: 4,
            everyReview: false,
            states: [],
          },
        ],
      }),
    );
    const list = screen.getByRole("list", { name: "Goals" });
    expect(
      within(list).getAllByRole("link", { name: GOAL.title }),
    ).toHaveLength(1);
    expect(within(list).queryByText(/of your last 4 Reviews/)).toBeNull();
  });
});
