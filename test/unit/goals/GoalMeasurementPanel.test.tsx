/**
 * GOAL-02 — the Goal record's progress section, as the owner meets it.
 *
 * Behaviour, not structure: what the page SAYS about a measurable Goal, what it
 * refuses to say when the data cannot support it, and that nothing is conveyed
 * by a chart or a colour alone (AGENTS.md §15).
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  UNMEASURED_GOAL,
  type GoalMeasurementConfig,
  type GoalProgressEvaluation,
} from "~/kernel/goals";
import { GoalMeasurementPanel } from "~/modules/goals/GoalMeasurementPanel";
import { FeedbackProvider } from "~/shared/feedback";
import type {
  SerializedGoalMeasurement,
  SerializedGoalMilestone,
} from "~/shared/goal-progress";

const TODAY = "2026-08-09";

function measurement(
  id: string,
  measuredOn: string,
  value: number,
  note: string | null = null,
): SerializedGoalMeasurement {
  return { id, measuredOn, value, note, createdAt: `${measuredOn}T09:00:00Z` };
}

function progressFor(
  measurements: readonly SerializedGoalMeasurement[],
  config: Partial<GoalMeasurementConfig> = {},
  targetDate: string | null = "2026-12-31",
  milestones?: {
    total: number;
    completed: number;
    totalWeight: number;
    completedWeight: number;
  },
): GoalProgressEvaluation {
  return evaluateGoalProgress(
    {
      config: normalizeGoalMeasurementConfig({
        type: "target_value",
        unit: "kg",
        baselineValue: 85,
        targetValue: 70,
        ...config,
      }),
      targetDate,
      measurements: measurements.map((item) => ({
        value: item.value,
        measuredOn: item.measuredOn,
      })),
      milestones,
      startedOn: "2026-06-10",
    },
    { todayIso: TODAY },
  );
}

function renderPanel(
  over: Partial<Parameters<typeof GoalMeasurementPanel>[0]> = {},
) {
  const measurements = over.measurements ?? [];
  return render(
    <FeedbackProvider>
      <GoalMeasurementPanel
        goalTitle="Reach 70 kg"
        progress={over.progress ?? progressFor(measurements)}
        measurements={measurements}
        milestones={over.milestones ?? []}
        todayIso={TODAY}
        onRecord={over.onRecord ?? vi.fn()}
        onConfigure={over.onConfigure ?? vi.fn()}
        onDeleteMeasurement={over.onDeleteMeasurement ?? vi.fn()}
        onToggleMilestone={over.onToggleMilestone ?? vi.fn()}
        onAddMilestone={over.onAddMilestone ?? vi.fn()}
        onDeleteMilestone={over.onDeleteMilestone ?? vi.fn()}
        onReorderMilestones={over.onReorderMilestones ?? vi.fn()}
      />
    </FeedbackProvider>,
  );
}

describe("a measurable Goal", () => {
  const series = [
    measurement("m1", "2026-07-05", 81.6),
    measurement("m2", "2026-07-31", 79.3),
    measurement("m3", "2026-08-09", 79.0),
  ];

  it("states CURRENT, TARGET and TARGET DATE as three equal labelled figures", () => {
    renderPanel({ measurements: series });
    const trio = screen.getByTestId("goal-metrics");
    /*
     * REDESIGN-04 — `mockup3.png` draws three equal figures where UIX-03 drew a
     * quartet with an enlarged lead value. Each figure is still asserted with
     * its own TERM, because the pairing is the point: a "79 kg" with no
     * "Current" above it is the layout both designs exist to avoid.
     */
    const figureFor = (term: string) =>
      within(trio)
        .getByText(term)
        .closest(".dh-goal-trio__stat")
        ?.querySelector("dd")?.textContent;

    expect(figureFor("Current")).toBe("79 kg");
    expect(figureFor("Target")).toBe("70 kg");

    /*
     * Nothing was deleted with the fourth column. START is the chart's baseline
     * reference, labelled where it is drawn; REMAINING moved to the state line
     * beside the status word, where it reads as progress rather than as a
     * fourth measurement.
     */
    expect(trio.textContent).not.toContain("Start");
    const panel = screen.getByTestId("goal-progress");
    expect(within(panel).getByText("9 kg to go")).toBeInTheDocument();
    expect(within(panel).getByText("40%")).toBeInTheDocument();
    // The journey, in the SAME words the collection row uses for this Goal.
    expect(within(panel).getByText("from 85 kg → 70 kg")).toBeInTheDocument();
  });

  it("announces the same sentence on the bar as it prints beside it", () => {
    renderPanel({ measurements: series });
    const bar = screen.getByRole("progressbar", {
      name: "Reach 70 kg progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar.getAttribute("aria-valuetext")).toContain(
      "79 kg · 40% complete · 9 kg remaining",
    );
  });

  it("states its status in WORDS, never by colour alone", () => {
    renderPanel({ measurements: series });
    expect(screen.getByTestId("goal-progress").textContent).toMatch(
      /On track|Ahead|In progress|Needs attention/,
    );
  });

  it("gives the chart a text equivalent stating the series", () => {
    renderPanel({ measurements: series });
    const chart = within(screen.getByTestId("goal-trend-chart")).getByRole(
      "img",
    );
    const label = chart.getAttribute("aria-label") ?? "";
    expect(label).toContain("3 measurements");
    expect(label).toContain("81.6 kg");
    expect(label).toContain("79 kg");
  });

  it("lists every reading with its change from the one before", () => {
    renderPanel({ measurements: series });
    const history = screen.getByTestId("goal-history");
    const rows = within(history).getAllByRole("listitem");
    // Newest first.
    expect(rows[0]!.textContent).toContain("79 kg");
    expect(rows[0]!.textContent).toContain("↓ 0.3 kg");
    expect(rows[2]!.textContent).toContain("First measurement");
  });

  it("offers a check-in named after the Goal's own unit", () => {
    renderPanel({ measurements: series });
    expect(screen.getByTestId("goal-record-measurement")).toHaveTextContent(
      "Log weight",
    );
  });
});

describe("what it refuses to show", () => {
  it("says more measurements are needed rather than drawing a flat line", () => {
    renderPanel({ measurements: [measurement("m1", TODAY, 79)] });
    expect(screen.queryByTestId("goal-trend-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("goal-trend-thin")).toHaveTextContent(
      "More measurements needed for a trend. Current value 79 kg.",
    );
  });

  it("invites a first measurement instead of an empty chart", () => {
    renderPanel({ measurements: [] });
    expect(screen.getByText("No progress logged yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add your first measurement to start tracking this Goal.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("goal-history")).not.toBeInTheDocument();
  });

  it("invites a measurement configuration instead of a 0% bar", () => {
    renderPanel({
      progress: evaluateGoalProgress(
        { config: UNMEASURED_GOAL, targetDate: null, measurements: [] },
        { todayIso: TODAY },
      ),
    });
    expect(screen.getByText("Not measured yet")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("goal-pace")).not.toBeInTheDocument();
  });

  it("shows no pace facts when two readings are a day apart", () => {
    const close = [
      measurement("m1", "2026-08-08", 79.3),
      measurement("m2", "2026-08-09", 79.0),
    ];
    renderPanel({
      measurements: close,
      progress: progressFor(close, {}, null),
    });
    expect(screen.queryByTestId("goal-pace")).not.toBeInTheDocument();
  });
});

describe("the other measurement strategies", () => {
  it("reads a manual Goal as a plain percentage, with no invented target", () => {
    const readings = [measurement("m1", TODAY, 65)];
    renderPanel({
      measurements: readings,
      progress: progressFor(readings, { type: "manual" }, null),
    });
    const strip = screen.getByTestId("goal-metrics");
    expect(
      within(strip)
        .getByText("Current")
        .closest(".dh-goal-trio__stat")
        ?.querySelector("dd")?.textContent,
    ).toBe("65%");
    /*
     * A manual Goal stores a target of 100 because that is the SCALE, not
     * because anyone chose it. Printing "Target 100%" beside the reading told
     * the owner a fact about the arithmetic and nothing about their Goal, so
     * neither the trio nor the journey line states one.
     *
     * REDESIGN-04 keeps that exactly: a column whose CONCEPT does not apply to
     * this kind of Goal is omitted, not drawn with a dash — a dash reports an
     * unmade decision, and nobody was ever asked to make this one.
     */
    expect(
      within(strip).queryByText("Target", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("goal-progress").textContent).not.toContain(
      "100%",
    );
  });

  it("shows stages rather than a chart for a milestone Goal", () => {
    const milestones: SerializedGoalMilestone[] = [
      {
        id: "s1",
        title: "Book the course",
        weight: 1,
        position: 0,
        completed: true,
      },
      {
        id: "s2",
        title: "Sit the exam",
        weight: 1,
        position: 1,
        completed: false,
      },
    ];
    renderPanel({
      measurements: [],
      milestones,
      progress: progressFor([], { type: "milestone" }, null, {
        total: 2,
        completed: 1,
        totalWeight: 2,
        completedWeight: 1,
      }),
    });
    const stages = screen.getByTestId("goal-milestones");
    /*
     * DHDS-11 converged the stage row's actions onto the same overflow the Task
     * checklist row carries — Move up, Move down, Remove stage — so the bare
     * "Remove" button this used to assert is now inside that menu.
     */
    expect(
      within(stages).getByRole("button", {
        name: "More actions for Book the course",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.queryByTestId("goal-trend-chart")).not.toBeInTheDocument();
  });

  it("states a stage's weight only when it is not the default", () => {
    const milestones: SerializedGoalMilestone[] = [
      { id: "s1", title: "Equal", weight: 1, position: 0, completed: false },
      { id: "s2", title: "Heavy", weight: 6, position: 1, completed: false },
    ];
    renderPanel({
      measurements: [],
      milestones,
      progress: progressFor([], { type: "milestone" }, null, {
        total: 2,
        completed: 0,
        totalWeight: 7,
        completedWeight: 0,
      }),
    });
    expect(screen.getByText("Weight 6")).toBeInTheDocument();
    expect(screen.queryByText("Weight 1")).not.toBeInTheDocument();
  });
});

describe("an achieved Goal", () => {
  it("says the target was reached instead of a remaining amount", () => {
    const readings = [measurement("m1", TODAY, 69.4)];
    renderPanel({ measurements: readings, progress: progressFor(readings) });
    const panel = screen.getByTestId("goal-progress");
    expect(within(panel).getByText("Target achieved")).toBeInTheDocument();
    /*
     * UIX-03 — the fourth figure switches from REMAINING to what was achieved.
     * "0 kg to go" is a true sentence and a useless one; once the target is
     * passed the news is by how much.
     */
    const strip = screen.getByTestId("goal-metrics");
    expect(within(strip).queryByText("Remaining")).not.toBeInTheDocument();
    expect(panel.textContent).not.toContain("to go");
  });

  it("does not break the indicator when the target is exceeded", () => {
    const readings = [measurement("m1", TODAY, 60)];
    renderPanel({ measurements: readings, progress: progressFor(readings) });
    expect(
      screen.getByRole("progressbar", { name: "Reach 70 kg progress" }),
    ).toHaveAttribute("aria-valuenow", "100");
  });
});
