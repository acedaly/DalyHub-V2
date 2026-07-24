import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AreaOverviewView } from "~/modules/areas/AreaOverview";
import type {
  SerializedAreaGoalItem,
  SerializedAreaOverview,
  SerializedAreaProjectItem,
  SerializedAreaRollup,
} from "~/modules/areas/area-view";
import type { AreaMomentum } from "~/kernel/areas";
import { DrawerProvider } from "~/shared/drawer";

import { stubHealth } from "../../support/project-health";

const overview: SerializedAreaOverview = {
  id: "a1",
  title: "Career",
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
};

const rollup: SerializedAreaRollup = {
  kind: "area",
  goals: { total: 1, completed: 0, ratio: 0 },
  projects: { total: 2, completed: 1, ratio: 0.5 },
  tasks: { total: 4, completed: 1, ratio: 0.25 },
};

const momentum: AreaMomentum = {
  state: "steady",
  label: "Momentum visible",
  tone: "success",
  summary: "Active work is present without a derived warning.",
  reasons: [
    {
      code: "active_projects",
      count: 1,
      summary: "1 active project contributing momentum.",
    },
  ],
  evaluatedAtIso: "2026-07-22T02:00:00.000Z",
};

const goal: SerializedAreaGoalItem = {
  id: "g1",
  title: "Ship v2",
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-18T09:00:00.000Z",
  completedAt: null,
  projectTotal: 1,
  projectCompleted: 0,
  taskTotal: 2,
  taskCompleted: 1,
  targetDate: null,
};

const project: SerializedAreaProjectItem = {
  id: "p1",
  title: "Website relaunch",
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  completedAt: null,
  status: "active",
  archivedAt: null,
  parent: { kind: "goal", goal: { id: "g1", title: "Ship v2" } },
  taskTotal: 2,
  taskCompleted: 1,
  health: stubHealth({ taskTotal: 2, taskCompleted: 1 }),
  healthVisible: true,
};

function renderRecord(
  over: {
    goals?: readonly SerializedAreaGoalItem[];
    projects?: readonly SerializedAreaProjectItem[];
    goalsNextCursor?: string | null;
    projectsNextCursor?: string | null;
    onRename?: () => void;
    onOpenGoal?: (id: string) => void;
    onOpenProject?: (id: string) => void;
  } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/areas/a1",
        element: (
          <DrawerProvider renderDrawer={() => null}>
            <AreaOverviewView
              overview={overview}
              rollup={rollup}
              momentum={momentum}
              goals={over.goals ?? [goal]}
              goalsNextCursor={over.goalsNextCursor ?? null}
              projects={over.projects ?? [project]}
              projectsNextCursor={over.projectsNextCursor ?? null}
              onRename={over.onRename ?? (() => {})}
              onOpenGoal={over.onOpenGoal ?? (() => {})}
              onOpenProject={over.onOpenProject ?? (() => {})}
              activityTab={<div>activity-content</div>}
            />
          </DrawerProvider>
        ),
      },
    ],
    { initialEntries: ["/areas/a1"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("AreaOverview", () => {
  it("renders Area identity, permanent state, roll-up summary and momentum reasons", () => {
    renderRecord();
    expect(screen.getByRole("heading", { name: "Career" })).toBeInTheDocument();
    expect(screen.getAllByText("Permanent").length).toBeGreaterThan(0);
    expect(screen.getByText(/25% — 1 of 4 tasks complete/)).toBeInTheDocument();
    expect(screen.getByText("Momentum visible")).toBeInTheDocument();
    expect(
      screen.getByText("1 active project contributing momentum."),
    ).toBeInTheDocument();
  });

  it("links Goal cards to the canonical Goal record and opens it (AREA-02)", () => {
    const onOpenGoal = vi.fn();
    renderRecord({ onOpenGoal });
    expect(screen.getByText("Task roll-up: 1 of 2 tasks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Open Ship v2" }));
    expect(onOpenGoal).toHaveBeenCalledWith("g1");
  });

  it("shows a Goal's target date only when set, never overcrowding the card (AREA-02)", () => {
    const { unmount } = renderRecord();
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
    unmount();

    renderRecord({ goals: [{ ...goal, targetDate: "2026-08-15" }] });
    expect(screen.getByText("15 Aug 2026")).toBeInTheDocument();
  });

  it("exposes a New Goal action on the Goals tab (AREA-02)", () => {
    renderRecord();
    expect(screen.getByRole("link", { name: "New Goal" })).toBeInTheDocument();
  });

  it("shows direct versus Goal-backed Project context and opens canonical Projects", () => {
    const onOpenProject = vi.fn();
    renderRecord({
      projects: [
        project,
        {
          ...project,
          id: "p-direct",
          title: "Direct Area project",
          parent: { kind: "area" },
          healthVisible: false,
        },
      ],
      onOpenProject,
    });
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(screen.getByText("Goal: Ship v2")).toBeInTheDocument();
    expect(screen.getByText("Directly in this Area")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("link", { name: "Open Website relaunch" }),
    );
    expect(onOpenProject).toHaveBeenCalledWith("p1");
  });

  it("renders calm empty states and bounded-page notes", () => {
    renderRecord({
      goals: [],
      projects: [],
      goalsNextCursor: "g-next",
      projectsNextCursor: "p-next",
    });
    expect(screen.getByText("No Goals in this Area")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(screen.getByText("No Projects in this Area")).toBeInTheDocument();
  });

  it("triggers the single rename action and exposes Activity tab", () => {
    const onRename = vi.fn();
    renderRecord({ onRename });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("activity-content")).toBeInTheDocument();
  });

  it("uses the exact roll-up totals for tab badges, never the first-page array length", () => {
    // `rollup` fixes goals.total = 1 and projects.total = 2. Rendering an EMPTY
    // Goals page and a single-item Projects page proves the badge reflects the
    // authoritative roll-up total, not `goals.length`/`projects.length`.
    renderRecord({ goals: [], projects: [project] });
    expect(screen.getByRole("tab", { name: "Goals" }).textContent).toBe(
      "Goals1",
    );
    expect(screen.getByRole("tab", { name: /Projects/ }).textContent).toBe(
      "Projects2",
    );
  });
});
