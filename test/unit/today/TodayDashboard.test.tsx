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

import { TODAY_FIXTURE } from "~/modules/today/fixtures";
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
      dueDate: null,
      completed: false,
      completedDate: null,
    },
    {
      id: "t-pr",
      title: "Review PR",
      parent: null,
      scheduledDate: "2026-07-19",
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
      <DrawerProvider
        renderDrawer={createTodayDrawerRenderer(TODAY_FIXTURE, taskTitles())}
      >
        <TodayDashboard
          data={TODAY_FIXTURE}
          date="Sunday 19 July 2026"
          todayIso="2026-07-19"
          planning={planning}
          waiting={options.waiting}
          recentProjects={[
            {
              id: "p-real",
              title: "DalyHub V2",
              areaLabel: "Career",
              completed: false,
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
    for (const label of [/Overdue/, /^Today/, /^Upcoming/, /Anytime/]) {
      expect(
        screen.getByRole("heading", { level: 2, name: label }),
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

  it("still renders the preserved fixture sections", () => {
    renderToday();
    expect(
      screen.getByRole("list", { name: /Meetings, reminders and deadlines/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /Recently active projects/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /Recent notes/ }),
    ).toBeInTheDocument();
  });

  it("keeps Quick Capture inert and honest (nothing saved)", () => {
    renderToday();
    const textarea = screen.getByPlaceholderText("What needs your attention?");
    fireEvent.change(textarea, { target: { value: "New idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(
      screen.getByText(/Quick Capture is not connected yet/),
    ).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("New idea");
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
        <DrawerProvider
          renderDrawer={createTodayDrawerRenderer(TODAY_FIXTURE, taskTitles())}
        >
          <TodayDashboard
            data={TODAY_FIXTURE}
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
  it("registers a Focus Quick Capture contextual action on Today", () => {
    renderTodayWithCommands();
    expect(
      observedContextual.some((a) => a.id === "today.action.focus_capture"),
    ).toBe(true);
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
