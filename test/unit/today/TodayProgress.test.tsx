/**
 * GOAL-02 — Today's Goal Progress section.
 *
 * Today's own contract is that a figure with nothing to say is not painted, so
 * these hold the section to it: an owner with no measurable Goals gets a compact
 * line rather than a large empty analytics container, and every number on the
 * section exists as text.
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
    // CAL-01 — a quiet day has no external calendar schedule either.
    schedule: { dateIso: TODAY, allDay: [], timed: [], count: 0 },
    scheduleHasSources: false,
    scheduleStale: false,
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
    areaColourRank: 0,
    areaIconKey: null,
    areaColourSlot: null,
    iconKey: null,
    colourSlot: null,
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
  /*
   * VIS-01 narrowed what a GLANCE says, and the assertion narrowed with it.
   *
   * Today's Goal cards used to carry the Area, the value, the target, the
   * percentage, the remainder, the month's movement and a filled status pill —
   * seven facts on a surface whose job is a glance. Three of them went, each
   * because it is stated somewhere the owner is already looking: the Area is on
   * the Goal record and in the Goals gallery, and the remainder is the value
   * against the target on the line above it.
   *
   * What is asserted here is what a glance must still answer: which Goal, where
   * it stands, where it is going, and which way it is moving.
   */
  it("shows a glance of each Goal — value, target, bar, trend, state", () => {
    renderScreen(day({ goals: [weightGoal()] }));
    const section = screen.getByTestId("today-goal-progress");
    expect(within(section).getByText("Reach 70 kg")).toBeInTheDocument();
    expect(within(section).getByText("79 kg")).toBeInTheDocument();
    expect(within(section).getByText("Target 70 kg")).toBeInTheDocument();
    // The month's movement, as a signed figure with an arrow AND a magnitude.
    expect(
      within(section).getByText(/↓ 0.3 kg this month/),
    ).toBeInTheDocument();
    // The state is a WORD, in its own tone — never a filled chip on a glance.
    expect(
      within(section).getByText(/On track|Ahead|In progress/),
    ).toBeVisible();
    // …and the facts a glance deliberately does NOT repeat.
    expect(within(section).queryByText("Health & Fitness")).toBeNull();
    expect(within(section).queryByText(/9 kg remaining/)).toBeNull();
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

/*
 * REDESIGN-03 — the 7-day workload trend's tests used to be here.
 *
 * The chart plotted `created` against `completed` for seven days and printed
 * "31 completed · 23 created · 8 tasks fewer in your active workload" beneath
 * it — which is the first two cards of Today's own measure row, in the same
 * units, over the same rolling window, one screen apart. `TodayScreen.test.tsx`
 * now asserts the chart's ABSENCE, and Analytics keeps the trend.
 */
