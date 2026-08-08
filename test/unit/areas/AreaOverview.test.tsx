import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

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
  archivedAt: null,
  iconKey: null,
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
    onRename?: (
      title: string,
    ) => Promise<{ ok: true } | { ok: false; message: string }>;
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
              onRename={over.onRename ?? (async () => ({ ok: true }) as const)}
              onOpenGoal={over.onOpenGoal ?? (() => {})}
              onOpenProject={over.onOpenProject ?? (() => {})}
              linkedTab={<div>linked-content</div>}
              activityTab={<div>activity-content</div>}
            />
          </DrawerProvider>
        ),
      },
    ],
    { initialEntries: ["/areas/a1"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("AreaOverview", () => {
  it("renders Area identity, permanent state, roll-up summary and momentum reasons", () => {
    renderRecord();
    expect(screen.getByRole("heading", { name: "Career" })).toBeInTheDocument();
    expect(screen.getAllByText("Permanent").length).toBeGreaterThan(0);
    /*
     * RECORD-01 — the roll-up is the shared meter in the compact summary band.
     * The percentage reaches assistive tech through the progressbar; the counts
     * stay visible as text, so nothing depends on seeing the bar. The band
     * replaced a sentence that stated the percentage and the counts inline.
     */
    const meter = screen.getByRole("progressbar", { name: "Tasks" });
    expect(meter).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("1 of 4 tasks complete")).toBeInTheDocument();
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

  it("shows a Goal’s target date only when set, never overcrowding the card (AREA-02)", () => {
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
    /*
     * RECORD-01 — a record-level empty state is ONE calm line. The Goals tab's
     * "New Goal" action now renders unconditionally in the tab toolbar, so the
     * empty state no longer carries a duplicate copy of it and no longer needs
     * a headline, an icon and a sentence to teach an action already on screen.
     */
    expect(screen.getByText("No Goals in this Area yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Goal" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(
      screen.getByText("No Projects in this Area yet."),
    ).toBeInTheDocument();
  });

  it("renames from the heading itself and exposes the Activity tab", async () => {
    // DS-16 — the rename is no longer a Drawer form behind a "Rename" button:
    // the heading IS the control. The assertion is the user-visible contract
    // (activate the name, type, press Enter, the module's save runs with the
    // new text), not which component renders it.
    const onRename = vi.fn(async () => ({ ok: true }) as const);
    renderRecord({ onRename });
    fireEvent.click(screen.getByRole("button", { name: /^Area name:/ }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Renamed Area" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Renamed Area"));
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
