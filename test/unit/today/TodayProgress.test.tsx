/**
 * GOAL-02 — Today's Goal Progress and workload-trend sections.
 *
 * Today's own contract is that a figure with nothing to say is not painted, so
 * these hold the two new sections to it: an empty week renders no chart at all,
 * an owner with no measurable Goals gets a compact line rather than a large empty
 * analytics container, and every number on either section exists as text.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
} from "~/kernel/goals";
import { DrawerProvider } from "~/shared/drawer";
import { TodayScreen } from "~/modules/today/day/TodayScreen";
import type { TodayGoal } from "~/modules/today/day/goal-progress";
import type { TodayDayData } from "~/modules/today/day/load";

const TODAY = "2026-08-09";

function day(overrides: Partial<TodayDayData> = {}): TodayDayData {
  return {
    todayIso: TODAY,
    dateLong: "Sunday 9 August 2026",
    hour: 9,
    ownerName: "Aidan",
    overdue: [],
    today: [],
    completedToday: [],
    meetings: [],
    attention: [],
    continueProjects: [],
    goals: [],
    activityTrend: null,
    ...overrides,
  };
}

function weightGoal(over: Partial<TodayGoal> = {}): TodayGoal {
  return {
    id: "g1",
    title: "Reach 70 kg",
    areaTitle: "Health & Fitness",
    progress: evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({
          type: "target_value",
          unit: "kg",
          baselineValue: 85,
          targetValue: 70,
        }),
        targetDate: "2026-12-31",
        measurements: [
          { value: 79.3, measuredOn: "2026-07-31" },
          { value: 79.0, measuredOn: TODAY },
        ],
        startedOn: "2026-06-10",
      },
      { todayIso: TODAY },
    ),
    changeInWindow: -0.3,
    windowDays: 30,
    ...over,
  };
}

function renderScreen(
  data: TodayDayData,
  onUpdateGoal?: (goal: TodayGoal, trigger: HTMLElement | null) => void,
) {
  const element: ReactElement = (
    <DrawerProvider renderDrawer={() => null}>
      <TodayScreen data={data} onUpdateGoal={onUpdateGoal} />
    </DrawerProvider>
  );
  const router = createMemoryRouter(
    [
      { path: "/today", element },
      { path: "*", element: <div /> },
    ],
    { initialEntries: ["/today"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Goal progress on Today", () => {
  it("shows a compact reading of each Goal — value, bar, remaining, status", () => {
    renderScreen(day({ goals: [weightGoal()] }));
    const section = screen.getByTestId("today-goal-progress");
    expect(within(section).getByText("Reach 70 kg")).toBeInTheDocument();
    expect(within(section).getByText("Health & Fitness")).toBeInTheDocument();
    expect(within(section).getByText("79 kg")).toBeInTheDocument();
    expect(within(section).getByText("Target 70 kg")).toBeInTheDocument();
    expect(within(section).getByText(/9 kg remaining/)).toBeInTheDocument();
    // The month's movement, as a signed figure with an arrow AND a magnitude.
    expect(
      within(section).getByText(/↓ 0.3 kg this month/),
    ).toBeInTheDocument();
  });

  it("announces the bar with the same sentence it prints", () => {
    renderScreen(day({ goals: [weightGoal()] }));
    const bar = screen.getByRole("progressbar", {
      name: "Reach 70 kg progress",
    });
    expect(bar.getAttribute("aria-valuetext")).toContain(
      "79 kg · 40% complete · 9 kg remaining",
    );
  });

  it("opens the Goal record from its title", () => {
    renderScreen(day({ goals: [weightGoal()] }));
    expect(
      within(screen.getByTestId("today-goal-progress")).getByRole("link", {
        name: "Reach 70 kg",
      }),
    ).toHaveAttribute("href", "/goals/g1");
  });

  it("offers ONE action — the check-in — and hands it back with the Goal", () => {
    const onUpdateGoal = vi.fn();
    renderScreen(day({ goals: [weightGoal()] }), onUpdateGoal);
    const update = screen.getByTestId("today-goal-update");
    expect(update).toHaveTextContent("Log weight");
    fireEvent.click(update);
    expect(onUpdateGoal).toHaveBeenCalledTimes(1);
    expect(onUpdateGoal.mock.calls[0]![0].id).toBe("g1");
  });

  it("offers no check-in for a milestone Goal, which has no reading to log", () => {
    const milestone = weightGoal({
      progress: evaluateGoalProgress(
        {
          config: normalizeGoalMeasurementConfig({ type: "milestone" }),
          targetDate: null,
          measurements: [],
          milestones: {
            total: 4,
            completed: 1,
            totalWeight: 4,
            completedWeight: 1,
          },
        },
        { todayIso: TODAY },
      ),
    });
    renderScreen(day({ goals: [milestone] }), vi.fn());
    expect(screen.queryByTestId("today-goal-update")).not.toBeInTheDocument();
  });

  it("gives a compact line, not an empty analytics container, with no Goals", () => {
    renderScreen(day());
    const section = screen.getByTestId("today-goal-progress");
    expect(
      within(section).getByText(/No measurable Goals yet/),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("the 7-day workload trend", () => {
  const trend = {
    days: [
      { dateIso: "2026-08-03", created: 3, completed: 5 },
      { dateIso: "2026-08-04", created: 6, completed: 4 },
      { dateIso: "2026-08-05", created: 2, completed: 7 },
      { dateIso: "2026-08-06", created: 4, completed: 4 },
      { dateIso: "2026-08-07", created: 5, completed: 6 },
      { dateIso: "2026-08-08", created: 1, completed: 2 },
      { dateIso: "2026-08-09", created: 2, completed: 3 },
    ],
    totalCreated: 23,
    totalCompleted: 31,
  };

  it("draws the comparison and states the week in words beneath it", () => {
    renderScreen(day({ activityTrend: trend }));
    const section = screen.getByTestId("today-activity-trend");
    expect(
      within(section).getByText(
        "31 completed · 23 created · 8 tasks fewer in your active workload",
      ),
    ).toBeInTheDocument();
  });

  it("names both series and gives the chart a text equivalent", () => {
    renderScreen(day({ activityTrend: trend }));
    const section = screen.getByTestId("today-activity-trend");
    // The legend names them — the two series are never distinguished by colour
    // alone.
    expect(
      within(section).getByText("Completed", { exact: true }),
    ).toBeInTheDocument();
    expect(
      within(section).getByText("Created", { exact: true }),
    ).toBeInTheDocument();
    const chart = within(section).getByRole("img");
    expect(chart.getAttribute("aria-label")).toContain(
      "Mon 5 completed, 3 created",
    );
  });

  it("renders no section at all when the week is empty", () => {
    renderScreen(day({ activityTrend: null }));
    expect(
      screen.queryByTestId("today-activity-trend"),
    ).not.toBeInTheDocument();
  });
});
