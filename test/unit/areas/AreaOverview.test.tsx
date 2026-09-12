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
  contributionAcrossReviews: null,
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
  // UNTITLED-05 — the Project's OWN identity, so an Area record draws it with
  // the mark `/projects` draws it with.
  iconKey: null,
  colourSlot: null,
  colourRank: 0,
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
    /** Which section to render — the record now opens on its Overview. */
    activeTabId?: string;
    /** The COMPLETE active-Project count the loader supplies. */
    activeProjectTotal?: number;
    /** The COMPLETE momentum, from the kernel's own unbounded boundary. */
    momentum?: AreaMomentum;
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
              momentum={over.momentum ?? momentum}
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
    /*
     * UNTITLED-05 — the assertion is now about the AREA's own meter rather than
     * about every meter on the page, because the Overview draws the PROJECTS
     * inside the Area and a Project genuinely does complete. What must never
     * exist is a measure OF THE AREA: no bar named for it, and not the roll-up
     * sentence the band used to open with.
     */
    for (const meter of screen.queryAllByRole("progressbar")) {
      expect(meter.getAttribute("aria-label")).not.toContain("Career");
    }
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

  /*
   * UNTITLED-05 — the Overview shows the RECORDS, not a restatement of the tab
   * badges above it.
   *
   * It used to draw three large figures — open Goals, active Projects, open
   * tasks — every one of which the tab strip immediately above already carried
   * as a badge, and then an activity feed. So the summary band could say "1
   * active project is at risk" and the tab beneath it would not say WHICH.
   */
  it("opens on the Area’s active work and Goals, not on a restatement of the tab badges", () => {
    renderRecord();
    const work = screen.getByTestId("area-active-work");
    // The Project itself, by name, on the landing tab.
    expect(
      within(work).getByRole("link", { name: "Open Website relaunch" }),
    ).toBeInTheDocument();
    // And the Goal, through the SAME shared row `/goals` draws.
    const goals = screen.getByTestId("area-overview-goals");
    expect(
      within(goals).getByRole("link", { name: /^Ship v2/ }),
    ).toHaveAttribute("href", "/goals/g1");
    // The tiles that restated the tab badges are gone.
    expect(
      screen.queryByTestId("area-overview-metrics"),
    ).not.toBeInTheDocument();
  });

  /*
   * The summary band names a count of Projects needing the owner; this is what
   * makes the tab beneath it say WHICH. It is a presentation order over facts
   * the health evaluator already decided, never a second judgement.
   */
  it("puts the Project asking for attention first", () => {
    renderRecord({
      projects: [
        { ...project, id: "p-calm", title: "Calm project" },
        {
          ...project,
          id: "p-risk",
          title: "At-risk project",
          health: {
            ...project.health,
            state: "at_risk",
            label: "At risk",
            tone: "danger",
          },
        },
      ],
    });
    const rows = within(screen.getByTestId("area-active-work")).getAllByRole(
      "row",
    );
    // Row 0 is the header; row 1 is the first record.
    expect(rows[1]?.textContent).toContain("At-risk project");
  });

  /*
   * An Area never completes (AGENTS.md §4), but the PROJECTS inside it do — so
   * the Overview's Project measures are legitimate and the Area's own is not.
   * This is the assertion that keeps the distinction: a bar named for a
   * Project, and none named for the Area.
   */
  it("measures Projects, never the Area itself", () => {
    renderRecord();
    expect(
      screen.getByRole("progressbar", { name: "Website relaunch progress" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: /Career/ }),
    ).not.toBeInTheDocument();
  });

  /*
   * UNTITLED-05 (review follow-up) — the Overview's "nothing here" is the
   * KERNEL's verdict, never the bounded page's.
   *
   * `evaluateAreaMomentum` reads every aligned Project, every direct Task and
   * every Goal; the Overview draws one bounded page of Projects. Deriving the
   * empty state from the page let the band say "Momentum visible" while the tab
   * beneath it said "Nothing running" — one screen, two answers.
   */
  it("never says nothing is running while the band says work is", () => {
    renderRecord({
      projects: [],
      goals: [],
      momentum: {
        state: "steady",
        label: "Momentum visible",
        tone: "success",
        summary: "Active work is present without a derived warning.",
        reasons: [
          {
            code: "unfinished_direct_tasks",
            count: 2,
            summary: "2 direct Area Tasks unfinished.",
          },
        ],
        evaluatedAtIso: "2026-07-22T02:00:00.000Z",
      },
    });
    expect(
      screen.queryByText("Nothing running in this Area yet."),
    ).not.toBeInTheDocument();
    const work = screen.getByTestId("area-active-work");
    // The direct Tasks are STATED. An Area record has no Tasks tab to send
    // anyone to, so the count is given where the reader is already asking
    // "what is going on?" rather than dropped for want of a destination.
    expect(
      within(work).getByText(/2 Tasks filed straight into this Area/),
    ).toBeInTheDocument();
    expect(
      within(work).getByText(
        "No Project in this Area is being actively worked.",
      ),
    ).toBeInTheDocument();
  });

  it("still gives a genuinely empty Area one sentence and one door", () => {
    renderRecord({
      projects: [],
      goals: [],
      momentum: {
        state: "empty",
        label: "No active work",
        tone: "neutral",
        summary: "This Area has no active goals, projects or tasks yet.",
        reasons: [
          {
            code: "no_active_work",
            summary: "No active descendants are contributing momentum.",
          },
        ],
        evaluatedAtIso: "2026-07-22T02:00:00.000Z",
      },
    });
    expect(
      screen.getByText("Nothing running in this Area yet."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("area-active-work")).not.toBeInTheDocument();
  });

  /*
   * UNTITLED-05 (review follow-up) — the attention ordering is over the LOADED
   * page, and the section says so rather than promising the workspace.
   *
   * `projects` is the loader's first bounded page in created order, so for an
   * Area running more Projects than one page an at-risk Project past the cursor
   * is counted by the momentum band and by `activeProjectTotal` and is not in
   * the array this section sorts. Ordering what IS loaded still puts the
   * Project the band names first whenever it is on the page; claiming it is
   * "the ones asking for you first" across the Area would not be true.
   */
  it("does not claim a workspace-wide ordering it only has a page of", () => {
    const { unmount } = renderRecord({
      projects: [project],
      projectsNextCursor: "p-next",
      activeProjectTotal: 60,
    });
    const work = screen.getByTestId("area-active-work");
    expect(
      within(work).queryByText(/the ones asking for you first/),
    ).not.toBeInTheDocument();
    expect(within(work).getByText(/first loaded Projects/)).toBeInTheDocument();
    expect(within(work).getByText(/60 active in all/)).toBeInTheDocument();
    unmount();

    // Unbounded, the claim is true and is made.
    renderRecord({ projects: [project], activeProjectTotal: 4 });
    expect(
      within(screen.getByTestId("area-active-work")).getByText(
        /the ones asking for you first/,
      ),
    ).toBeInTheDocument();
  });

  /*
   * And the section SURVIVES a page holding none of the active Projects. It
   * used to render only when the page had one, so an Area whose first page is
   * all planned Projects lost the section entirely while its band said work
   * existed.
   */
  it("keeps the section, and its door, when the loaded page holds no active Project", () => {
    renderRecord({
      projects: [{ ...project, status: "planned", healthVisible: false }],
      activeProjectTotal: 0,
    });
    const work = screen.getByTestId("area-active-work");
    expect(
      within(work).getByText(
        "No Project in this Area is being actively worked.",
      ),
    ).toBeInTheDocument();
    expect(
      within(work).getByText(/planned, on hold or finished/),
    ).toBeInTheDocument();
    // `rollup` fixes projects.total = 2, so the door names the complete total.
    expect(
      within(work).getByRole("link", { name: "View all 2" }),
    ).toBeInTheDocument();
  });

  it("links a Goal row to the canonical Goal record (AREA-02)", () => {
    renderRecord({ activeTabId: "goals" });
    const link = screen.getByRole("link", { name: /^Ship v2/ });
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
    renderRecord({
      activeTabId: "projects",
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
    });
    const table = screen.getByTestId("area-projects-table");
    // The Goal-backed Project's context is a real link to the canonical Goal —
    // a separate link from the row's own open target, so no nested
    // interactivity is created.
    expect(
      within(table).getByRole("link", { name: "Goal: Ship v2" }),
    ).toHaveAttribute("href", "/goals/g1");
    /*
     * `getAllByText`: the table draws the context in its own column AND in the
     * phone row's quiet fact line, from one DOM, so a handset loses no fact and
     * a desktop gains no duplicate. Both are the same string by construction.
     */
    expect(
      within(table).getAllByText("Directly in this Area").length,
    ).toBeGreaterThan(0);
    /*
     * UNTITLED-05 — `onOpenProject` is gone. The shared `ProjectSummaryList`
     * opens through a real `<Link>`, which is the same client-side navigation
     * with an href behind it — deep-linkable and middle-clickable, which the
     * callback was not.
     */
    expect(
      within(table).getByRole("link", { name: "Open Website relaunch" }),
    ).toHaveAttribute("href", "/projects/p1");
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
