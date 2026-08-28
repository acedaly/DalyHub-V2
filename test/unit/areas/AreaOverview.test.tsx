import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
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
import { UNMEASURED_GOAL_PROGRESS } from "~/kernel/goals";
import type { LoadedGoalStory } from "~/shared/goal-progress";
import { DrawerProvider } from "~/shared/drawer";

import { stubHealth } from "../../support/project-health";

const overview: SerializedAreaOverview = {
  id: "a1",
  title: "Career",
  colourRank: 0,
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  archivedAt: null,
  iconKey: null,
  colourSlot: null,
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

/**
 * STEER-03 — the Area's Goal now arrives with the SHARED story, exactly as
 * `/goals` and the Goal record receive it. The fixture is a MEASURED Goal so
 * the row has a bar to draw; `unmeasuredGoal` below is the other half.
 */
const goalStory: LoadedGoalStory = {
  id: "g1",
  title: "Ship v2",
  progress: {
    ...UNMEASURED_GOAL_PROGRESS,
    measured: true,
    type: "target_value",
    unit: "features",
    direction: "increase",
    baseline: 0,
    current: 6,
    target: 10,
    progressFraction: 0.6,
    progressPercent: 60,
    remaining: 4,
    totalChange: 6,
    status: "on_track",
    measurementCount: 3,
  },
  alignment: {
    state: "aligned",
    label: "Recent action",
    tone: "success",
    reasons: [],
    contributingProjects: 1,
    activeContributingProjects: 1,
    recentTaskCount: 2,
    windowDays: 14,
  } as unknown as LoadedGoalStory["alignment"],
  movement: null,
  condition: null,
  targetDate: null,
  contribution: { total: 1, completed: 0, active: 1 },
  iconKey: null,
  colourSlot: null,
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
  story: goalStory,
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
    onOpenProject?: (id: string) => void;
    /** Which section to render — the record now opens on its Overview. */
    activeTabId?: string;
    /** The COMPLETE active-Project count the loader supplies. */
    activeProjectTotal?: number;
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
              activeProjectTotal={
                over.activeProjectTotal ??
                (over.projects ?? [project]).filter(
                  (p) => p.completedAt === null && p.archivedAt === null,
                ).length
              }
              onRename={over.onRename ?? (async () => ({ ok: true }) as const)}
              onOpenProject={over.onOpenProject ?? (() => {})}
              linkedTab={<div>linked-content</div>}
              activityTab={<div>activity-content</div>}
              /*
               * UIX-02 — an Area record opens on its OVERVIEW, so a test about
               * one of the SECTIONS says which section it means. The route
               * resolves this from `?tab=`; the harness passes it directly.
               */
              activeTabId={over.activeTabId}
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
  it("renders Area identity and momentum, and NEVER a completion meter", () => {
    renderRecord();
    expect(screen.getByRole("heading", { name: "Career" })).toBeInTheDocument();
    /*
     * UIX-02 — an Area's band carries NO progress meter.
     *
     * It used to open with "Tasks — 1 of 4 tasks complete" over a bar: a
     * completion PROPORTION, on the one entity in the spine that by definition
     * never completes (AGENTS.md §4). The Areas gallery had never drawn one, so
     * the product said both things about the same entity on two screens. It was
     * also a moving figure — an Area's roll-up spans every Project under it, so
     * it drifted whenever unrelated work finished, and a mature Area would sit
     * near 100% for ever, reading as "nearly done" about a part of a life.
     */
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("1 of 4 tasks complete")).not.toBeInTheDocument();
    /*
     * UIX-02 — and no "Permanent" chip. Every Area is permanent, so it is a
     * fact about Areas rather than about this Area; the gallery dropped it in
     * AREA-01 and the record kept it. Only the exceptional state (Archived)
     * paints now.
     */
    expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
    // What survives is the momentum the kernel actually evaluates.
    expect(screen.getByText("Momentum visible")).toBeInTheDocument();
    expect(
      screen.getByText("1 active project contributing momentum."),
    ).toBeInTheDocument();
  });

  it("opens on an Overview of what is actually in the Area", () => {
    renderRecord();
    const metrics = screen.getByTestId("area-overview-metrics");
    // Counts of LIVING things, never a proportion. The fixture has one open
    // Goal, one active Project and three open tasks across the Area.
    expect(within(metrics).getByText("open Goal")).toBeInTheDocument();
    expect(within(metrics).getByText("active Project")).toBeInTheDocument();
    expect(
      within(metrics).getByText("open tasks in this Area"),
    ).toBeInTheDocument();
    // Nothing here is a proportion, and nothing here is a bar.
    expect(within(metrics).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(metrics.textContent).not.toContain("%");
  });

  it("links a Goal row to the canonical Goal record (AREA-02)", () => {
    renderRecord({ activeTabId: "goals" });
    // `Open <title>` is the product's convention for a row's open link, and it
    // is anchored here rather than left as a substring so a name that loses the
    // verb again fails on this surface too — `areas.spec.ts` used to be the
    // only place in the suite that noticed.
    const link = screen.getByRole("link", { name: /^Open Ship v2/ });
    expect(link).toHaveAttribute("href", "/goals/g1");
  });

  /*
   * STEER-03 (DEBT-206) — the Area tab no longer has a Goal measure of its own.
   *
   * These three assertions are the falsifier for restoring the Task roll-up
   * bar: the caption is gone, the meter reads the GOAL's own measurement, and
   * the roll-up survives only as a count worded as what it is.
   */
  it("draws the Goal’s own measurement, never a Task roll-up (STEER-03)", () => {
    renderRecord({ activeTabId: "goals" });
    expect(screen.queryByText(/Task roll-up/)).not.toBeInTheDocument();
    const meter = screen.getByRole("progressbar", {
      name: "Ship v2 progress",
    });
    // 60% — the GOAL's measurement, not 1-of-2 tasks (which would be 50%).
    expect(meter).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("6 / 10 features")).toBeInTheDocument();
    // The roll-up is kept as a COUNT, on the context line.
    expect(screen.getByText(/1 of 2 Tasks complete/)).toBeInTheDocument();
  });

  it("gives an UNMEASURED Goal no bar and no fabricated percentage (STEER-03)", () => {
    renderRecord({
      activeTabId: "goals",
      goals: [
        {
          ...goal,
          story: {
            ...goalStory,
            progress: UNMEASURED_GOAL_PROGRESS,
          },
        },
      ],
    });
    expect(
      screen.queryByRole("progressbar", { name: "Ship v2 progress" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No measurement/)).toBeInTheDocument();
  });

  it("states the owner’s condition beside the derived facts (STEER-02/03)", () => {
    renderRecord({
      activeTabId: "goals",
      goals: [{ ...goal, story: { ...goalStory, condition: "set_aside" } }],
    });
    expect(screen.getByText("Set aside")).toBeInTheDocument();
    // The derived facts are untouched by the owner's judgement.
    expect(screen.getByText("6 / 10 features")).toBeInTheDocument();
  });

  it("shows a Goal’s target date only when set, never overcrowding the row (AREA-02)", () => {
    const { unmount } = renderRecord({ activeTabId: "goals" });
    expect(screen.queryByText(/Target /)).not.toBeInTheDocument();
    unmount();

    renderRecord({
      activeTabId: "goals",
      goals: [{ ...goal, targetDate: "2026-08-15" }],
    });
    expect(screen.getByText(/Target 15 Aug 2026/)).toBeInTheDocument();
  });

  it("exposes a New Goal action on the Goals tab (AREA-02)", () => {
    renderRecord({ activeTabId: "goals" });
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
    const { unmount } = renderRecord({
      activeTabId: "goals",
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
    unmount();

    // The tab is CONTROLLED by the harness (the route resolves it from
    // `?tab=`), so the Projects section is asserted from its own render rather
    // than by clicking a strip whose selection this test owns.
    renderRecord({
      activeTabId: "projects",
      goals: [],
      projects: [],
      goalsNextCursor: "g-next",
      projectsNextCursor: "p-next",
    });
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
