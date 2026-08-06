/**
 * TODAY-01 / TODAY-04 — the Today dashboard, exercised as behaviour.
 *
 * Today is now a deliberate PLANNING workspace: the real tasks are bucketed by their
 * scheduled date into Overdue / Today / Upcoming / Anytime / Completed-today, each
 * card offers calm plan quick actions, a multi-select bulk bar plans many at once,
 * and a lightweight summary gives operational awareness. These tests assert what the
 * owner experiences (not structure), plus the preserved fixture sections, quick
 * capture, the Drawer, and the exposed planning commands. Rendered inside a data
 * router + DrawerProvider + FeedbackProvider — the frame the route provides.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { DrawerProvider } from "~/shared/drawer";

import { TodayDashboard } from "~/modules/today/TodayDashboard";
import { createTodayDrawerRenderer } from "~/modules/today/TodayDrawer";
import type { PlanningData } from "~/modules/today/task/planning-view";
import type { WaitingSummary } from "~/modules/today/task/waiting-view";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
      ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PLANNING: PlanningData = {
  summary: { planned: 2, overdue: 1, waiting: 0, completedToday: 1 },
  targets: {
    today: "2026-07-19",
    tomorrow: "2026-07-20",
    nextWeek: "2026-07-26",
  },
  overdue: [
    {
      id: "t-over",
      title: "Overdue task",
      parent: { kind: "area", id: "a-home", title: "Home" },
      scheduledDate: "2026-07-17",
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  today: [
    {
      id: "t-px02",
      title: "Finish PX-02",
      parent: { kind: "area", id: "a-dh", title: "DalyHub V2" },
      scheduledDate: "2026-07-19",
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
    {
      id: "t-pr",
      title: "Review PR",
      parent: null,
      scheduledDate: "2026-07-19",
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  upcoming: [
    {
      id: "t-up",
      title: "Upcoming task",
      parent: null,
      scheduledDate: "2026-07-25",
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  anytime: [
    {
      id: "t-any",
      title: "Anytime task",
      parent: null,
      scheduledDate: null,
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  completedToday: [
    {
      id: "t-done",
      title: "Done task",
      parent: null,
      scheduledDate: "2026-07-19",
      priority: null,
      dueDate: null,
      completed: true,
      completedDate: "2026-07-19",
    },
  ],
};

function taskTitles(): Map<string, string> {
  const map = new Map<string, string>();
  for (const bucket of [
    PLANNING.overdue,
    PLANNING.today,
    PLANNING.upcoming,
    PLANNING.anytime,
    PLANNING.completedToday,
  ]) {
    for (const item of bucket) map.set(item.id, item.title);
  }
  return map;
}

function renderInDataRouter(
  element: ReactElement,
  initialEntries = ["/today"],
) {
  const router = createMemoryRouter([{ path: "*", element }], {
    initialEntries,
  });
  return render(<RouterProvider router={router} />);
}

interface RenderOptions {
  readonly planning?: PlanningData;
  readonly waiting?: WaitingSummary;
  readonly onPlan?: (ids: readonly string[], date: string | null) => void;
  readonly onCompleteTask?: (id: string, complete: boolean) => void;
  readonly entries?: readonly string[];
}

function renderToday(options: RenderOptions = {}) {
  const planning = options.planning ?? PLANNING;
  return renderInDataRouter(
    <FeedbackProvider>
      <DrawerProvider renderDrawer={createTodayDrawerRenderer(taskTitles())}>
        <TodayDashboard
          date="Sunday 19 July 2026"
          todayIso="2026-07-19"
          planning={planning}
          waiting={options.waiting}
          recentProjects={[
            {
              id: "p-real",
              title: "DalyHub V2",
              areaLabel: "Career",
              taskTotal: 8,
              taskCompleted: 3,
              health: null,
            },
          ]}
          onPlan={options.onPlan}
          onCompleteTask={options.onCompleteTask}
        />
      </DrawerProvider>
    </FeedbackProvider>,
    [...(options.entries ?? ["/today"])],
  );
}

describe("TODAY-04 planning dashboard", () => {
  it("renders the Today pane header with the current date", () => {
    renderToday();
    expect(
      screen.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday 19 July 2026")).toBeInTheDocument();
  });

  it("renders the planning sections keyed on the scheduled date", () => {
    renderToday();
    // The planning sub-sections nest one level below the "My day" widget heading
    // (TODAY-08), so they are h3 under the widget's h2.
    for (const label of [/Overdue/, /^Today/, /^Upcoming/, /Anytime/]) {
      expect(
        screen.getByRole("heading", { level: 3, name: label }),
      ).toBeInTheDocument();
    }
    // Completed today is a collapsed disclosure (a summary, not a heading).
    expect(screen.getByText(/Completed today/)).toBeInTheDocument();
    // The Today section holds the two tasks scheduled for today.
    const today = screen.getByRole("list", {
      name: /Tasks planned for today/,
    });
    expect(within(today).getByText("Finish PX-02")).toBeInTheDocument();
    expect(within(today).getByText("Review PR")).toBeInTheDocument();
  });

  it("shows a calm planning summary with the key counts", () => {
    renderToday();
    const summary = screen.getByRole("group", { name: /Today at a glance/ });
    expect(within(summary).getByText("planned")).toBeInTheDocument();
    expect(within(summary).getByText("overdue")).toBeInTheDocument();
    expect(within(summary).getByText("completed today")).toBeInTheDocument();
  });

  it("completes a task through the persisting callback", () => {
    const onCompleteTask = vi.fn();
    renderToday({ onCompleteTask });
    const today = screen.getByRole("list", { name: /Tasks planned for today/ });
    const complete = within(today).getAllByRole("button", {
      name: "Complete",
    })[0]!;
    fireEvent.click(complete);
    expect(onCompleteTask).toHaveBeenCalledWith("t-px02", true);
  });

  it("plans a single task to today from an Anytime card", () => {
    const onPlan = vi.fn();
    renderToday({ onPlan });
    const anytime = screen.getByRole("list", { name: /Anytime tasks/ });
    fireEvent.click(
      within(anytime).getByRole("button", { name: /Plan today: Anytime task/ }),
    );
    expect(onPlan).toHaveBeenCalledWith(["t-any"], "2026-07-19");
  });

  it("moves a today task to tomorrow from its card", () => {
    const onPlan = vi.fn();
    renderToday({ onPlan });
    const today = screen.getByRole("list", { name: /Tasks planned for today/ });
    fireEvent.click(
      within(today).getByRole("button", { name: /Tomorrow: Finish PX-02/ }),
    );
    expect(onPlan).toHaveBeenCalledWith(["t-px02"], "2026-07-20");
  });

  it("bulk-plans selected tasks to a chosen relative date", () => {
    const onPlan = vi.fn();
    renderToday({ onPlan });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Finish PX-02" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Anytime task" }),
    );

    const bar = screen.getByRole("group", { name: /Plan 2 selected tasks/ });
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Next week" }));

    expect(onPlan).toHaveBeenCalledTimes(1);
    const [ids, date] = onPlan.mock.calls[0]!;
    expect(new Set(ids)).toEqual(new Set(["t-px02", "t-any"]));
    expect(date).toBe("2026-07-26");
  });

  it("bulk-clears the plan on selected tasks", () => {
    const onPlan = vi.fn();
    renderToday({ onPlan });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Finish PX-02" }),
    );
    const bar = screen.getByRole("group", { name: /Plan 1 selected task/ });
    fireEvent.click(within(bar).getByRole("button", { name: "Clear plan" }));
    expect(onPlan).toHaveBeenCalledWith(["t-px02"], null);
  });

  it("does not show completed tasks as selectable", () => {
    renderToday();
    expect(
      screen.queryByRole("checkbox", { name: "Select Done task" }),
    ).not.toBeInTheDocument();
  });

  it("renders the real Continue working (projects) widget", () => {
    renderToday();
    // TODAY-08 retired the calendar/notes/timeline fixtures; the projects widget
    // remains the real, loader-backed section.
    expect(
      screen.getByRole("list", { name: /Recently active projects/ }),
    ).toBeInTheDocument();
  });

  it("offers the shared Quick Capture entries (TODAY-07, wired by MOBILE-01)", () => {
    renderToday();
    // The honest fixture textarea — which saved nothing and said so — is gone.
    expect(
      screen.queryByPlaceholderText("What needs your attention?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Quick Capture is not connected yet/),
    ).not.toBeInTheDocument();

    // Today now offers the four SHARED capture types, each opening the one
    // capture sheet, which posts to the module's canonical creation route.
    const capture = screen.getByRole("group", { name: "Quick capture" });
    for (const label of ["Task", "Diary entry", "Meeting", "Note"]) {
      expect(
        within(capture).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("renders the Waiting summary when tasks are waiting", () => {
    renderToday({
      waiting: {
        count: 1,
        preview: [
          {
            id: "t-w",
            title: "Await sign-off",
            subjectLabel: "Sarah",
            subjectType: "person",
            sinceLabel: "18 Jul 2026",
            elapsedLabel: "1 day",
          },
        ],
      },
    });
    expect(
      screen.getByRole("region", { name: /^Waiting/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Await sign-off")).toBeInTheDocument();
  });

  it("opens a task card in the Drawer over the pane", () => {
    renderToday();
    const today = screen.getByRole("list", { name: /Tasks planned for today/ });
    fireEvent.click(within(today).getByRole("link", { name: "Finish PX-02" }));
    expect(
      screen.getByRole("dialog", { name: "Finish PX-02" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* DS-09 — shared action / contextual command integration                     */
/* -------------------------------------------------------------------------- */

import {
  CommandContextProvider,
  useContextualActions,
  type AppAction,
} from "~/shared/commands";

let observedContextual: readonly AppAction[] = [];
function ContextualObserver() {
  observedContextual = useContextualActions();
  return null;
}

function renderTodayWithCommands(entries: readonly string[] = ["/today"]) {
  return renderInDataRouter(
    <FeedbackProvider>
      <CommandContextProvider>
        <ContextualObserver />
        <DrawerProvider renderDrawer={createTodayDrawerRenderer(taskTitles())}>
          <TodayDashboard
            date="Sunday 19 July 2026"
            todayIso="2026-07-19"
            planning={PLANNING}
          />
        </DrawerProvider>
      </CommandContextProvider>
    </FeedbackProvider>,
    [...entries],
  );
}

describe("TODAY-04 command integration", () => {
  // PX-03 regression guard: "Focus Quick Capture" must have exactly ONE
  // authoritative command — the module-registered NAVIGATE command
  // (`today.focus_quick_capture`, always in the catalogue). Today must NOT
  // additionally register it as a contextual `run` action: that action would
  // execute while the Command Palette is still open (the background `inert`),
  // so it could never actually focus the field, and it produced a second,
  // dead, identically-titled palette entry. See the note above
  // `contextualActions` in TodayDashboard.tsx.
  it("does not register a duplicate contextual Focus Quick Capture action", () => {
    renderTodayWithCommands();
    expect(
      observedContextual.some((a) => a.id === "today.action.focus_capture"),
    ).toBe(false);
    expect(
      observedContextual.some((a) => a.title === "Focus Quick Capture"),
    ).toBe(false);
  });

  it("carries no pane-header Quick capture button — the global capture control owns that", () => {
    renderTodayWithCommands();
    // Shell cleanup: the pane header's "Quick capture" button is gone. It created
    // nothing itself — it scrolled to and focused the widget below — so Today was
    // offering the same capture affordance three times over. The widget, the
    // `today.focus_quick_capture` command and the global capture control are all
    // untouched; only the duplicate header button went.
    expect(
      screen.queryByRole("button", { name: "Quick capture" }),
    ).not.toBeInTheDocument();
    // The widget it used to focus is still here, still offering all four types.
    expect(screen.getByTestId("today-capture-task")).toBeInTheDocument();
  });

  it("exposes planning commands with shortcuts for the focused task (TODAY-05)", () => {
    renderTodayWithCommands(["/today"]);
    // Focus a task in the list; the dashboard registers its per-task commands.
    fireEvent.focus(screen.getByRole("link", { name: "Finish PX-02" }));
    const planToday = observedContextual.find((a) =>
      a.id.endsWith(".plan_today"),
    );
    const planTomorrow = observedContextual.find((a) =>
      a.id.endsWith(".plan_tomorrow"),
    );
    expect(planToday?.shortcut).toEqual({ key: "p" });
    expect(planTomorrow?.shortcut).toEqual({ key: "p", modifiers: ["shift"] });
  });

  it("has no task-specific contextual action until a task is focused", () => {
    renderTodayWithCommands(["/today"]);
    expect(observedContextual.some((a) => a.id.startsWith("today.task."))).toBe(
      false,
    );
  });
});

describe("TODAY-06 mobile swipe quick actions", () => {
  /** Locate a planning task card's swipe wrapper + tray by its stable id. */
  function trayFor(id: string): HTMLElement {
    const article = document.querySelector(
      `.dh-card[data-card-id="${id}"]`,
    ) as HTMLElement | null;
    expect(article).not.toBeNull();
    const wrapper = article!.closest(".dh-card-swipe") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    const tray = wrapper!.querySelector(
      ".dh-card__swipe-tray",
    ) as HTMLElement | null;
    expect(tray).not.toBeNull();
    return tray!;
  }

  it("wraps every task card in a swipe container with an aria-hidden tray", () => {
    renderToday();
    const tray = trayFor("t-any");
    // The tray is a visual accelerator — hidden from assistive tech (the visible
    // quick actions carry the accessible controls).
    expect(tray).toHaveAttribute("aria-hidden", "true");
  });

  it("offers state-appropriate swipe actions for an open backlog task", () => {
    renderToday();
    const tray = trayFor("t-any");
    const labels = Array.from(
      tray.querySelectorAll(".dh-card__swipe-action"),
    ).map((node) => node.textContent);
    expect(labels).toEqual(["Complete", "Plan today", "Tomorrow"]);
  });

  it("offers only Reopen in the swipe tray of a completed task", () => {
    renderToday();
    const tray = trayFor("t-done");
    const labels = Array.from(
      tray.querySelectorAll(".dh-card__swipe-action"),
    ).map((node) => node.textContent);
    expect(labels).toEqual(["Reopen"]);
  });

  it("drives the SAME plan mutation path from a swipe-tray action", () => {
    const onPlan = vi.fn();
    renderToday({ onPlan });
    const tray = trayFor("t-any");
    const planToday = Array.from(
      tray.querySelectorAll(".dh-card__swipe-action"),
    ).find((node) => node.textContent === "Plan today") as HTMLElement;
    fireEvent.click(planToday);
    // Same execution path as the visible quick action / bulk bar (ADR-030).
    expect(onPlan).toHaveBeenCalledWith(["t-any"], "2026-07-19");
  });
});

describe("PROJ-05 Slice 4 — Continue working is Active-only", () => {
  it("labels the section’s count from the Active projects the loader supplied", () => {
    renderToday();
    const section = screen.getByRole("region", { name: "Continue working 1" });
    expect(
      within(section).getByRole("heading", {
        level: 2,
        name: "Continue working 1",
      }),
    ).toBeInTheDocument();
  });

  it("presents every card’s status as Active — never the old generic Open label", () => {
    renderToday();
    const section = screen.getByRole("region", { name: /Continue working/ });
    expect(within(section).getByText("Active")).toBeInTheDocument();
    expect(within(section).queryByText("Open")).not.toBeInTheDocument();
    expect(within(section).queryByText("Completed")).not.toBeInTheDocument();
    expect(within(section).queryByText("Planned")).not.toBeInTheDocument();
    expect(within(section).queryByText("On hold")).not.toBeInTheDocument();
    expect(within(section).queryByText("Archived")).not.toBeInTheDocument();
  });

  it("opens the canonical project record via a real link", () => {
    renderToday();
    const link = screen.getByRole("link", { name: "Open DalyHub V2" });
    expect(link).toHaveAttribute("href", "/projects/p-real");
  });
});

/** A render variant that can override `recentProjects` directly. */
function renderTodayWithProjects(
  recentProjects: readonly {
    readonly id: string;
    readonly title: string;
    readonly areaLabel: string | null;
    readonly taskTotal: number;
    readonly taskCompleted: number;
    readonly health: null;
  }[],
) {
  return renderInDataRouter(
    <FeedbackProvider>
      <DrawerProvider renderDrawer={createTodayDrawerRenderer(taskTitles())}>
        <TodayDashboard
          date="Sunday 19 July 2026"
          todayIso="2026-07-19"
          planning={PLANNING}
          recentProjects={recentProjects}
        />
      </DrawerProvider>
    </FeedbackProvider>,
  );
}

/* -------------------------------------------------------------------------- */
/* POLISH-02 — the hero, the regions and the de-duplicated surface             */
/* -------------------------------------------------------------------------- */

import type { TodayLandingData } from "~/modules/today/landing/types";

const LANDING: TodayLandingData = {
  morningBrief: {
    greeting: "Good morning",
    ownerName: "Aidan",
    dateLong: "Sunday 19 July 2026",
    focusLine: "2 tasks planned for today",
    plannedTodayCount: 2,
    overdueCount: 1,
    inboxCount: 1,
  },
  taskSummary: {
    toDo: 4,
    inProgress: 1,
    done: 3,
    total: 8,
    completedFraction: 0.375,
    dueTodayCount: 2,
    overdueCount: 1,
    countsComplete: true,
  },
  productivity: {
    score: 43,
    completedTodayCount: 3,
    overdueCount: 1,
    encouragement: "Steady progress, with some of the plan still open.",
  },
  notes: [{ id: "n-1", title: "Reading list", createdLabel: "Created Today" }],
  diary: { today: [], recent: [], capturedToday: false },
  areas: [],
  goals: {
    goals: [
      {
        id: "g-1",
        title: "Run a half-marathon",
        areaLabel: "Health",
        alignmentLabel: "Recent action",
        atRisk: false,
        projectTotal: 4,
        projectCompleted: 1,
      },
    ],
  },
  meetings: {
    meetings: [
      {
        id: "m-1",
        title: "Team standup",
        timeLabel: "09:30",
        context: "Online",
        started: false,
      },
    ],
    remainingCount: 1,
  },
  insights: {
    signals: [
      { id: "overdue", label: "Tasks overdue", count: 1, tone: "attention" },
      {
        id: "waiting",
        label: "Waiting on others",
        count: 3,
        tone: "neutral",
        href: "/today/waiting",
      },
      {
        id: "goals-risk",
        label: "Goals at risk",
        count: 2,
        tone: "attention",
        href: "/goals",
      },
    ],
  },
  assets: { items: [], trackedAsTasksCount: 0, overdueCount: 0 },
};

function renderTodayWithLanding() {
  return renderInDataRouter(
    <FeedbackProvider>
      <DrawerProvider renderDrawer={createTodayDrawerRenderer(taskTitles())}>
        <TodayDashboard
          date="Sunday 19 July 2026"
          todayIso="2026-07-19"
          planning={PLANNING}
          waiting={{ count: 3, preview: [] }}
          landing={LANDING}
          recentProjects={[
            {
              id: "p-real",
              title: "DalyHub V2",
              areaLabel: "Career",
              taskTotal: 8,
              taskCompleted: 3,
              health: null,
            },
          ]}
        />
      </DrawerProvider>
    </FeedbackProvider>,
  );
}

describe("POLISH-02 Today hero", () => {
  it("greets the owner by name and states the date exactly once", () => {
    renderTodayWithLanding();
    expect(screen.getByText("Good morning, Aidan.")).toBeInTheDocument();
    // The pane header no longer repeats the date as a subtitle — the surface used
    // to open with the same long date twice, forty pixels apart.
    expect(screen.getAllByText("Sunday 19 July 2026")).toHaveLength(1);
  });

  it("summarises the whole day in one at-a-glance rail, including cross-module counts", () => {
    renderTodayWithLanding();
    const glance = screen.getByRole("group", { name: /Today at a glance/ });
    for (const label of [
      "planned",
      "overdue",
      // Singular, because one meeting is still to come — the rail counts in the
      // owner's words, not in a template.
      "meeting left",
      "waiting",
      "need a look",
      "completed today",
    ]) {
      expect(within(glance).getByText(label)).toBeInTheDocument();
    }
    // A count with an in-app answer is a real link; the rest are plain text.
    expect(
      within(glance).getByRole("link", { name: /waiting/ }),
    ).toHaveAttribute("href", "/today/waiting");
  });

  it("counts the day once — My day no longer restates the summary", () => {
    renderTodayWithLanding();
    // Exactly ONE "Today at a glance" group on the surface, and it is in the hero
    // (My day opens directly on the owner's tasks).
    expect(
      screen.getAllByRole("group", { name: /Today at a glance/ }),
    ).toHaveLength(1);
    const myDay = screen.getByRole("region", { name: /^My day/ });
    expect(
      within(myDay).queryByRole("group", { name: /Today at a glance/ }),
    ).toBeNull();
  });

  it("does not repeat a hero number in Insights — the panel keeps only what is additional", () => {
    renderTodayWithLanding();
    const insights = screen.getByRole("region", { name: /^Insights/ });
    // Overdue and waiting are already counted in the hero rail a few hundred
    // pixels above; goals at risk is not, so it stays.
    expect(within(insights).getByText("Goals at risk")).toBeInTheDocument();
    expect(within(insights).queryByText("Tasks overdue")).toBeNull();
    expect(within(insights).queryByText("Waiting on others")).toBeNull();
    // The heading count matches what the panel actually renders.
    expect(
      screen.getByRole("heading", { level: 2, name: "Insights 1" }),
    ).toBeInTheDocument();
  });

  it("shows today’s progress against what is committed to the day", () => {
    renderTodayWithLanding();
    // 1 completed of (2 planned + 1 completed) = 3 committed.
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /Today’s progress/ }),
    ).toHaveAttribute("aria-valuenow", "33");
  });

  it("omits cross-module counts entirely when the landing read is unavailable", () => {
    renderToday();
    const glance = screen.getByRole("group", { name: /Today at a glance/ });
    // Never "0 meetings left" for a module that was never read.
    expect(within(glance).queryByText(/meeting/)).toBeNull();
    expect(within(glance).getByText("planned")).toBeInTheDocument();
  });
});

describe("POLISH-02 widget chrome", () => {
  it("gives a populated list widget ONE destination, in its header", () => {
    renderTodayWithLanding();
    const projects = screen.getByRole("region", { name: /Continue working/ });
    expect(
      within(projects).getByRole("link", { name: "All projects" }),
    ).toHaveAttribute("href", "/projects");
  });

  it("omits the header destination when the widget is empty — its empty state already offers one", () => {
    renderTodayWithLanding();
    const areas = screen.getByRole("region", { name: /^Areas/ });
    expect(within(areas).queryByRole("link", { name: "All areas" })).toBeNull();
    expect(
      within(areas).getByRole("link", { name: "Browse Areas" }),
    ).toBeInTheDocument();
  });

  it("states a goal’s completion beside whether recent action matches it", () => {
    renderTodayWithLanding();
    const goals = screen.getByRole("region", { name: /^Goals/ });
    expect(within(goals).getByText("Recent action")).toBeInTheDocument();
    expect(within(goals).getByText("25% complete")).toBeInTheDocument();
  });

  it("renders the day’s meetings as an ordered schedule with their times", () => {
    renderTodayWithLanding();
    const schedule = screen.getByRole("list", { name: "Today’s meetings" });
    expect(within(schedule).getByText("09:30")).toBeInTheDocument();
    expect(within(schedule).getByText("Team standup")).toBeInTheDocument();
  });

  it("previews a long backlog and states the true total with a way to the rest", () => {
    const anytime = Array.from({ length: 30 }, (_, index) => ({
      id: `t-any-${index}`,
      title: `Backlog task ${index}`,
      parent: null,
      scheduledDate: null,
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    }));
    renderToday({ planning: { ...PLANNING, anytime } });

    const list = screen.getByRole("list", { name: /Anytime tasks/ });
    // The landing page previews the backlog rather than becoming it…
    expect(within(list).getAllByRole("article")).toHaveLength(8);
    // …but the heading still states how much work there really is, and the rest
    // is one link away in the canonical Tasks view. Nothing is silently dropped.
    expect(
      screen.getByRole("heading", { level: 3, name: /Anytime 30/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all 30 anytime" }),
    ).toHaveAttribute("href", "/tasks?system=inbox");
  });

  it("never truncates the day’s own commitments", () => {
    const today = Array.from({ length: 20 }, (_, index) => ({
      id: `t-today-${index}`,
      title: `Committed task ${index}`,
      parent: null,
      scheduledDate: "2026-07-19",
      priority: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    }));
    renderToday({ planning: { ...PLANNING, today } });
    const list = screen.getByRole("list", { name: /Tasks planned for today/ });
    // A commitment you can only see by following a link is one the product hid.
    expect(within(list).getAllByRole("article")).toHaveLength(20);
  });

  it("teaches the next action from an empty planned section instead of dead-ending", () => {
    renderToday({
      planning: { ...PLANNING, today: [], summary: PLANNING.summary },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture a Task" }));
    expect(screen.getByTestId("today-capture-task")).toHaveFocus();
  });
});

describe("PROJ-05 Slice 4 — Continue working empty state", () => {
  it("reads 'No active projects to continue' with a quiet explanation, not the stale open-projects copy", () => {
    renderTodayWithProjects([]);
    const section = screen.getByRole("region", { name: "Continue working 0" });
    // PX-06: the section now renders the SHARED EmptyState (compact) rather than
    // a bare paragraph — an entity glyph, a heading, the explanation and a next
    // action, exactly like every other module's empty state.
    expect(
      within(section).getByRole("heading", { name: "Nothing to continue" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/workflow status is set to Active/),
    ).toBeInTheDocument();
    expect(
      within(section).queryByText(/No recent projects to continue/),
    ).not.toBeInTheDocument();
  });
});
