/**
 * TODAY-05 — the Today keyboard workflow, exercised as behaviour.
 *
 * Roving focus across the open task collection (one tab stop, arrow-navigable),
 * Enter opening a task, Space toggling selection, and the contextual command set the
 * surface registers for the focused task and the global keyboard commands. Rendered
 * in the same frame the route provides (data router + Feedback + CommandContext +
 * Drawer), so the shared command wiring is real.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommandContextProvider,
  useContextualActions,
  type AppAction,
} from "~/shared/commands";
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";

import { TODAY_FIXTURE } from "~/modules/today/fixtures";
import { TodayDashboard } from "~/modules/today/TodayDashboard";
import { createTodayDrawerRenderer } from "~/modules/today/TodayDrawer";
import type { PlanningData } from "~/modules/today/task/planning-view";

/** A minimal loaded task so the Drawer content can register its commands. */
const TASK_A_DETAIL = {
  task: {
    id: "t-a",
    title: "Task A",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    deletedAt: null,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: "2026-07-21",
    description: null,
    project: null,
    goal: null,
    area: null,
    waiting: null,
  },
  links: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      // The Task A detail endpoint returns a real task so the Drawer loads and can
      // register its contextual commands; everything else is a calm not-found.
      if (
        url.includes("/today/task/t-a") &&
        !url.includes("/activity") &&
        !url.includes("/link-targets")
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(TASK_A_DETAIL), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const PLANNING: PlanningData = {
  summary: { planned: 2, overdue: 1, waiting: 0, completedToday: 0 },
  targets: {
    today: "2026-07-21",
    tomorrow: "2026-07-22",
    nextWeek: "2026-07-28",
  },
  overdue: [
    {
      id: "t-over",
      title: "Overdue task",
      parent: null,
      scheduledDate: "2026-07-19",
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  today: [
    {
      id: "t-a",
      title: "Task A",
      parent: null,
      scheduledDate: "2026-07-21",
      dueDate: null,
      completed: false,
      completedDate: null,
    },
    {
      id: "t-b",
      title: "Task B",
      parent: null,
      scheduledDate: "2026-07-21",
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  upcoming: [],
  anytime: [
    {
      id: "t-c",
      title: "Task C",
      parent: null,
      scheduledDate: null,
      dueDate: null,
      completed: false,
      completedDate: null,
    },
  ],
  completedToday: [],
};

let contextual: readonly AppAction[] = [];
function Observer() {
  contextual = useContextualActions();
  return null;
}

function renderInRouter(element: ReactElement, entries: readonly string[]) {
  const router = createMemoryRouter([{ path: "*", element }], {
    initialEntries: [...entries],
  });
  return render(<RouterProvider router={router} />);
}

function renderToday(entries: readonly string[] = ["/today"]) {
  return renderInRouter(
    <FeedbackProvider>
      <CommandContextProvider>
        <Observer />
        <DrawerProvider
          renderDrawer={createTodayDrawerRenderer(TODAY_FIXTURE, new Map())}
        >
          <TodayDashboard
            data={TODAY_FIXTURE}
            date="Tuesday 21 July 2026"
            todayIso="2026-07-21"
            planning={PLANNING}
          />
        </DrawerProvider>
      </CommandContextProvider>
    </FeedbackProvider>,
    entries,
  );
}

/** The primary open control (a link) of a task card by its accessible name. */
function taskLink(name: string): HTMLElement {
  return screen.getByRole("link", { name });
}

describe("TODAY-05 roving focus", () => {
  it("makes the collection ONE tab stop: only the first task is tabbable", () => {
    renderToday();
    expect(taskLink("Overdue task")).toHaveAttribute("tabindex", "0");
    expect(taskLink("Task A")).toHaveAttribute("tabindex", "-1");
    expect(taskLink("Task C")).toHaveAttribute("tabindex", "-1");
  });

  it("Arrow Down moves the tab stop to the next task across sections", () => {
    renderToday();
    // From the last overdue task, Arrow Down crosses into the Today section.
    fireEvent.keyDown(taskLink("Overdue task"), { key: "ArrowDown" });
    expect(taskLink("Task A")).toHaveAttribute("tabindex", "0");
    expect(taskLink("Overdue task")).toHaveAttribute("tabindex", "-1");
  });

  it("Arrow Up clamps at the first task", () => {
    renderToday();
    fireEvent.keyDown(taskLink("Overdue task"), { key: "ArrowUp" });
    expect(taskLink("Overdue task")).toHaveAttribute("tabindex", "0");
  });

  it("End moves to the last task within the current section", () => {
    renderToday();
    fireEvent.keyDown(taskLink("Task A"), { key: "End" });
    // Today section is A, B → End lands on B.
    expect(taskLink("Task B")).toHaveAttribute("tabindex", "0");
  });

  it("Enter on the focused task opens it in the Drawer", () => {
    renderToday();
    fireEvent.keyDown(taskLink("Task A"), { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Space on the focused task toggles its selection", () => {
    renderToday();
    const checkbox = screen.getByRole("checkbox", { name: "Select Task A" });
    expect(checkbox).not.toBeChecked();
    fireEvent.keyDown(taskLink("Task A"), { key: " " });
    expect(checkbox).toBeChecked();
  });

  it("does not steal arrow keys carrying a command modifier", () => {
    renderToday();
    fireEvent.keyDown(taskLink("Overdue task"), {
      key: "ArrowDown",
      metaKey: true,
    });
    // Focus is unchanged — the modified arrow was left to the browser.
    expect(taskLink("Overdue task")).toHaveAttribute("tabindex", "0");
  });
});

describe("TODAY-05 contextual commands", () => {
  it("registers the global keyboard commands on Today", () => {
    renderToday();
    const ids = contextual.map((a) => a.id);
    expect(ids).toContain("today.cmd.focus_task_list");
    expect(ids).toContain("today.cmd.keyboard_help");
    expect(ids).toContain("today.cmd.select_all");
  });

  it("exposes the focused task's commands after it gains focus", () => {
    renderToday();
    // No task command before anything is focused.
    expect(contextual.some((a) => a.id.startsWith("today.task."))).toBe(false);
    fireEvent.focus(taskLink("Task A"));
    const toggle = contextual.find((a) => a.id === "today.task.t-a.toggle");
    const planToday = contextual.find(
      (a) => a.id === "today.task.t-a.plan_today",
    );
    expect(toggle?.shortcut).toEqual({ key: "c" });
    expect(planToday?.shortcut).toEqual({ key: "p" });
  });

  it("exposes the open task's commands (Close) while its Drawer is open", async () => {
    renderToday(["/today?drawer=task:t-a"]);
    // The Drawer content owns the open task's commands; they register once it loads.
    await waitFor(() =>
      expect(contextual.some((a) => a.id === "today.task.t-a.close")).toBe(
        true,
      ),
    );
    expect(contextual.some((a) => a.id === "today.task.t-a.toggle")).toBe(true);
  });

  it("Select all then Clear selection are registered and reversible", () => {
    renderToday();
    const selectAll = contextual.find((a) => a.id === "today.cmd.select_all")!;
    act(() => {
      if (selectAll.kind === "run") selectAll.run();
    });
    // Every open task's checkbox is now checked.
    expect(
      screen.getByRole("checkbox", { name: "Select Task A" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Task C" }),
    ).toBeChecked();
    // Clear selection is now registered (selection is non-empty).
    const clear = contextual.find((a) => a.id === "today.cmd.clear_selection")!;
    act(() => {
      if (clear.kind === "run") clear.run();
    });
    expect(
      screen.getByRole("checkbox", { name: "Select Task A" }),
    ).not.toBeChecked();
  });

  it("opens the keyboard help in the Drawer via the help command", async () => {
    renderToday();
    const help = contextual.find((a) => a.id === "today.cmd.keyboard_help")!;
    await act(async () => {
      if (help.kind === "run") help.run();
    });
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/fully operable from the keyboard/i),
    ).toBeInTheDocument();
  });
});
