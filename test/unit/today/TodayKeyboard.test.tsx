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
import { CommandShortcutLayer } from "~/shared/commands/CommandShortcutLayer";
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

/** The roving task-collection container. */
function taskList(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-today-tasklist]");
  if (!el) throw new Error("task collection not found");
  return el;
}

describe("TODAY-05 roving focus", () => {
  it("makes the collection ONE tab stop: only the first task is tabbable", () => {
    renderToday();
    expect(taskLink("Overdue task")).toHaveAttribute("tabindex", "0");
    expect(taskLink("Task A")).toHaveAttribute("tabindex", "-1");
    expect(taskLink("Task C")).toHaveAttribute("tabindex", "-1");
  });

  it("has exactly ONE element with tabindex=0 across the whole collection", () => {
    renderToday();
    const list = taskList();
    const tabbable = list.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    // The single tab stop is a task's primary open control — never a checkbox/button.
    expect(tabbable[0].classList.contains("dh-card__open")).toBe(true);
    // The count holds after arrowing to a different task.
    fireEvent.keyDown(taskLink("Overdue task"), { key: "ArrowDown" });
    expect(list.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("never makes a checkbox or quick-action button an extra tab stop", () => {
    renderToday();
    const list = taskList();
    // Focus a task so its actions are rendered/visible.
    fireEvent.focus(taskLink("Task A"));
    for (const control of list.querySelectorAll(
      'input[type="checkbox"], button',
    )) {
      expect(control.getAttribute("tabindex")).toBe("-1");
    }
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

  it("Go to <section> is a NAVIGATE command with the today-nav target", () => {
    renderToday();
    const go = contextual.find(
      (a) => a.id === "today.cmd.focus_section.anytime",
    )!;
    expect(go.kind).toBe("navigate");
    if (go.kind === "navigate") {
      expect(go.target).toEqual({
        kind: "route",
        to: "/today?today-nav=anytime",
      });
    }
  });

  it("arriving with ?today-nav establishes that section as the navigation context", () => {
    // The navigate command lands here; the effect moves focus + sets the roving
    // target to the section's first task, THEN cleans the param.
    renderToday(["/today?today-nav=anytime"]);
    expect(taskLink("Task C")).toHaveAttribute("tabindex", "0");
    expect(taskLink("Task A")).toHaveAttribute("tabindex", "-1");
    expect(taskLink("Task C")).toHaveFocus();
    // Exactly one tab stop remains.
    expect(taskList().querySelectorAll('[tabindex="0"]')).toHaveLength(1);

    // Arrow navigation now continues from Anytime (Task C), not the previous section.
    fireEvent.keyDown(taskLink("Task C"), { key: "ArrowUp" });
    expect(taskLink("Task B")).toHaveAttribute("tabindex", "0");
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

  it("exposes the open task's commands (Close) while its Drawer is open, with no dashboard duplicate", async () => {
    renderToday(["/today?drawer=task:t-a"]);
    // The Drawer content (isOpen: true) owns the open task's commands — it emits
    // "Close task", never "Open task". They register once the task loads.
    await waitFor(() =>
      expect(contextual.some((a) => a.id === "today.task.t-a.close")).toBe(
        true,
      ),
    );
    expect(contextual.some((a) => a.id === "today.task.t-a.toggle")).toBe(true);
    // The dashboard is NOT simultaneously registering a second copy: a dashboard
    // registration would use isOpen: false and emit "Open task" (never "Close").
    expect(contextual.some((a) => a.id === "today.task.t-a.open")).toBe(false);
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

/* -------------------------------------------------------------------------- */
/* Shortcut ownership — the stale-task defect (C / P / Shift+P scope)          */
/* -------------------------------------------------------------------------- */

/** Dispatch a global keydown, as the real shared dispatcher receives it. */
function pressKey(key: string, opts: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...opts,
      }),
    );
  });
}

/**
 * Render Today WITH the real shared shortcut dispatcher (CommandShortcutLayer), so a
 * global keypress actually flows through the one dispatcher against the registered
 * contextual commands — the faithful path for proving shortcut scope. Returns the
 * router (to open Drawers) and the persistence spies the task shortcuts would hit.
 */
function renderWithDispatcher() {
  const onCompleteTask = vi.fn();
  const onPlan = vi.fn();
  const element = (
    <FeedbackProvider>
      <CommandContextProvider>
        <Observer />
        <CommandShortcutLayer
          reserved={[]}
          catalogue={async () => ({ commands: [] })}
        />
        <DrawerProvider
          renderDrawer={createTodayDrawerRenderer(TODAY_FIXTURE, new Map())}
        >
          <TodayDashboard
            data={TODAY_FIXTURE}
            date="Tuesday 21 July 2026"
            todayIso="2026-07-21"
            planning={PLANNING}
            onCompleteTask={onCompleteTask}
            onPlan={onPlan}
          />
        </DrawerProvider>
      </CommandContextProvider>
    </FeedbackProvider>
  );
  const router = createMemoryRouter([{ path: "*", element }], {
    initialEntries: ["/today"],
  });
  render(<RouterProvider router={router} />);
  return { router, onCompleteTask, onPlan };
}

/** Move real DOM focus (fires the container's focusin/focusout), flushed in act. */
function focusEl(el: HTMLElement) {
  act(() => el.focus());
}

describe("TODAY-05 shortcut ownership", () => {
  it("C completes the focused task while focus is inside the collection (control)", () => {
    const { onCompleteTask } = renderWithDispatcher();
    focusEl(taskLink("Task A"));
    pressKey("c");
    expect(onCompleteTask).toHaveBeenCalledWith("t-a", true);
  });

  it("does NOT complete or replan a task from behind the keyboard-help Drawer", async () => {
    const { onCompleteTask, onPlan } = renderWithDispatcher();
    focusEl(taskLink("Task A"));
    // Open the keyboard-help Drawer (the exact defect scenario).
    const help = contextual.find((a) => a.id === "today.cmd.keyboard_help")!;
    await act(async () => {
      if (help.kind === "run") help.run();
    });
    pressKey("c");
    pressKey("p");
    pressKey("p", { shiftKey: true });
    expect(onCompleteTask).not.toHaveBeenCalled();
    expect(onPlan).not.toHaveBeenCalled();
  });

  it("does NOT complete a task from behind a non-task record Drawer", async () => {
    const { router, onCompleteTask } = renderWithDispatcher();
    focusEl(taskLink("Task A"));
    await act(async () => {
      await router.navigate("/today?drawer=note:n1");
    });
    pressKey("c");
    pressKey("p");
    expect(onCompleteTask).not.toHaveBeenCalled();
  });

  it("does NOT act on the last task after focus leaves the collection", () => {
    const { onCompleteTask, onPlan } = renderWithDispatcher();
    focusEl(taskLink("Task A"));
    // Move focus OUT of the collection to a non-input control (the pane-header button).
    focusEl(screen.getByRole("button", { name: "Quick capture" }));
    pressKey("c");
    pressKey("p");
    expect(onCompleteTask).not.toHaveBeenCalled();
    expect(onPlan).not.toHaveBeenCalled();
  });
});
