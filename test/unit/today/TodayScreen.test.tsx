/**
 * TODAY-DAY — the Today screen, exercised as behaviour.
 *
 * The contract these tests hold is CONDITIONAL RENDERING: every chip, the
 * progress indicator, each timeline section and each rail row appears exactly
 * when its condition is true and is absent otherwise. A zero never paints.
 *
 * Rendered inside a data router + DrawerProvider — the frame the route provides.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrawerProvider } from "~/shared/drawer";
import { TodayScreen } from "~/modules/today/day/TodayScreen";
import type { TodayDayData } from "~/modules/today/day/load";

const TODAY = "2026-08-08";

function task(
  id: string,
  title: string,
  overrides: Partial<TodayDayData["today"][number]> = {},
) {
  return {
    id,
    title,
    parent: null,
    dueDate: TODAY,
    scheduledDate: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

/** A quiet day, so each test opts INTO the thing it is asserting about. */
function day(overrides: Partial<TodayDayData> = {}): TodayDayData {
  return {
    todayIso: TODAY,
    dateLong: "Saturday 8 August 2026",
    hour: 9,
    ownerName: "Aidan",
    overdue: [],
    today: [],
    completedToday: [],
    meetings: [],
    attention: [],
    // GOAL-02 — a quiet day has no measurable Goals and no workload trend.
    goals: [],
    activityTrend: null,
    continueProjects: [],
    ...overrides,
  };
}

function renderScreen(
  data: TodayDayData,
  onCompleteTask?: (id: string, complete: boolean) => void,
) {
  const element: ReactElement = (
    <DrawerProvider renderDrawer={() => null}>
      <TodayScreen data={data} onCompleteTask={onCompleteTask} />
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

/** The rail section that holds "Needs attention", located by its heading. */
function attentionSection() {
  return screen
    .getByRole("heading", { name: "Needs attention" })
    .closest("section")!;
}

describe("the header block", () => {
  it("greets the owner by name and states the date once", () => {
    renderScreen(day());
    expect(
      screen.getByRole("heading", { level: 1, name: "Good morning, Aidan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Saturday 8 August 2026")).toBeInTheDocument();
  });

  it("moves the greeting with the owner-local hour", () => {
    renderScreen(day({ hour: 17 }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Good evening, Aidan" }),
    ).toBeInTheDocument();
  });

  it("shows no progress indicator before anything is done", () => {
    renderScreen(day({ today: [task("a", "Alpha"), task("b", "Beta")] }));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/done today/)).not.toBeInTheDocument();
  });

  it("states progress over everything on today once one is done", () => {
    const done = task("c", "Gamma", { completed: true, completedDate: TODAY });
    renderScreen(
      day({
        today: [task("a", "Alpha"), task("b", "Beta"), done],
        completedToday: [done],
      }),
    );
    expect(screen.getByText("1 of 3 done today")).toBeInTheDocument();
  });
});

/*
 * M3X replaced the assist-chip row with the expressive summary. The RULES the
 * chips held are unchanged and are what these assert: a zero never paints, the
 * surface does not render at all when it would have nothing to say, every
 * figure links to the canonical view that holds it, and slipped work is the one
 * thing given a tone.
 */
describe("the summary", () => {
  it("does not render at all on a quiet day", () => {
    const { container } = renderScreen(day());
    expect(container.querySelector(".dh-today__summary")).toBeNull();
  });

  it("renders only the figures whose counts are non-zero", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.getByRole("link", { name: "1 task" })).toBeInTheDocument();
    expect(screen.queryByText(/meeting/)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });

  it("gives the tone to slipped work and to nothing else", () => {
    const { container } = renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
        meetings: [
          { id: "m1", title: "Standup", timeLabel: "09:30", context: null },
        ],
      }),
    );
    const toned = container.querySelectorAll(
      '.dh-summary__stat-value[data-tone="attention"]',
    );
    expect(toned).toHaveLength(1);
    expect(toned[0].closest(".dh-summary__stat")?.textContent).toContain(
      "overdue",
    );
  });

  it("navigates each chip to the filtered view that holds its number", () => {
    renderScreen(
      day({
        today: [task("a", "Alpha")],
        meetings: [
          { id: "m1", title: "Standup", timeLabel: "09:30", context: null },
        ],
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
      }),
    );
    expect(screen.getByRole("link", { name: "1 task" })).toHaveAttribute(
      "href",
      "/tasks?system=today",
    );
    expect(screen.getByRole("link", { name: "1 meeting" })).toHaveAttribute(
      "href",
      "/meetings",
    );
    expect(screen.getByRole("link", { name: "1 overdue" })).toHaveAttribute(
      "href",
      "/tasks?system=overdue",
    );
  });
});

describe("the day timeline", () => {
  it("shows a compact empty line — not a card — when nothing is on", () => {
    renderScreen(day());
    expect(screen.getByText(/Nothing planned today/)).toBeInTheDocument();
    // No section labels, because there are no sections.
    expect(screen.queryByText("Meetings")).not.toBeInTheDocument();
    expect(screen.queryByText("Due today")).not.toBeInTheDocument();
  });

  it("omits the Meetings section entirely when there are none", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.queryByText("Meetings")).not.toBeInTheDocument();
  });

  it("renders meetings in time order, with a time and no checkbox", () => {
    renderScreen(
      day({
        meetings: [
          {
            id: "m1",
            title: "Design review",
            timeLabel: "09:30",
            context: "Studio",
          },
          { id: "m2", title: "1:1", timeLabel: "11:00", context: null },
        ],
      }),
    );
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Design review" })).toHaveAttribute(
      "href",
      "/meetings/m1",
    );
    expect(
      screen.queryByRole("checkbox", { name: /Design review/ }),
    ).not.toBeInTheDocument();
  });

  it("never prints a time beside a task", () => {
    const { container } = renderScreen(day({ today: [task("a", "Alpha")] }));
    const row = screen.getByText("Alpha").closest("li")!;
    expect(row.querySelector(".dh-day-row__time")).toBeNull();
    expect(container.textContent).not.toMatch(/Morning|Afternoon/);
  });

  it("labels an overdue row with WHICH date slipped and how long ago", () => {
    renderScreen(
      day({ overdue: [task("o", "Late", { dueDate: "2026-08-05" })] }),
    );
    expect(screen.getByText("Due 3 days ago")).toBeInTheDocument();
  });

  it("caps overdue at three and links the remainder to the overdue view", () => {
    renderScreen(
      day({
        overdue: Array.from({ length: 6 }, (_, index) =>
          task(`o${index}`, `Late ${index}`, { dueDate: "2026-08-01" }),
        ),
      }),
    );
    expect(screen.getAllByText(/^Late /)).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: "+3 more overdue" }),
    ).toHaveAttribute("href", "/tasks?system=overdue");
  });

  it("shows no remainder row when nothing is hidden", () => {
    renderScreen(
      day({ overdue: [task("o", "Late", { dueDate: "2026-08-01" })] }),
    );
    expect(screen.queryByText(/more overdue/)).not.toBeInTheDocument();
  });

  it("keeps overdue OUT of the rail — it belongs to the timeline", () => {
    renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        attention: [
          {
            id: "waiting",
            kind: "waiting",
            label: "Waiting",
            detail: "1 waiting item",
            href: "/today/waiting",
          },
        ],
      }),
    );
    expect(within(attentionSection()).queryByText("Late")).toBeNull();
    expect(within(attentionSection()).queryByText(/overdue/i)).toBeNull();
  });

  it("carries the day's first actionable row above the laptop fold", () => {
    /*
     * A position guard, not a pixel test. The header block, the summary and the
     * panel heading are everything above the first row; if a band is ever added
     * back between them the count changes and this fails.
     */
    const { container } = renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
      }),
    );
    const surface = container.querySelector(".dh-today")!;
    // The summary composes the shared card classes, so this compares the ROLE
    // each block plays rather than its whole class list.
    const blocks = [...surface.children].map((child) =>
      ["dh-today__head", "dh-today__summary", "dh-today__body"].find((role) =>
        child.classList.contains(role),
      ),
    );
    expect(blocks).toEqual([
      "dh-today__head",
      "dh-today__summary",
      "dh-today__body",
    ]);
    /*
     * GOAL-02 — progress lives INSIDE the body, after the day and the rail, so
     * it can never come between the summary and the first actionable row. The
     * DOM order is what the phone layout stacks, so this is the hierarchy guard.
     */
    const body = surface.querySelector(".dh-today__body")!;
    const regions = [...body.children].map((child) => child.className);
    expect(regions[0]).toContain("dh-today__timeline");
    expect(regions.at(-1)).toContain("dh-today__progress");
    // The first row inside the day column is the overdue one.
    const firstRow = container.querySelector(".dh-today__timeline .dh-day-row");
    expect(firstRow?.textContent).toContain("Late");
  });
});

describe("completing a task from the timeline", () => {
  it("writes through the existing completion path and updates progress", () => {
    const onCompleteTask = vi.fn();
    const done = task("c", "Gamma", { completed: true, completedDate: TODAY });
    renderScreen(
      day({
        today: [task("a", "Alpha"), task("b", "Beta"), done],
        completedToday: [done],
      }),
      onCompleteTask,
    );

    expect(screen.getByText("1 of 3 done today")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Alpha" }));

    expect(onCompleteTask).toHaveBeenCalledWith("a", true);
    // Optimistic: the figure moves before any revalidation.
    expect(screen.getByText("2 of 3 done today")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Reopen Alpha" }),
    ).toBeChecked();
  });

  it("reopens a completed task through the same path", () => {
    const onCompleteTask = vi.fn();
    const done = task("c", "Gamma", { completed: true, completedDate: TODAY });
    renderScreen(
      day({ today: [done], completedToday: [done] }),
      onCompleteTask,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Reopen Gamma" }));
    expect(onCompleteTask).toHaveBeenCalledWith("c", false);
  });
});

describe("the rail", () => {
  it("renders one quiet 'All clear' row when nothing qualifies", () => {
    renderScreen(day());
    expect(within(attentionSection()).getByText("All clear")).toBeVisible();
    expect(within(attentionSection()).queryAllByRole("listitem")).toHaveLength(
      0,
    );
  });

  it("never shows 'All clear' beside a real item", () => {
    renderScreen(
      day({
        attention: [
          {
            id: "inbox",
            kind: "inbox",
            label: "Inbox",
            detail: "2 unfiled tasks",
            href: "/tasks?system=inbox",
          },
        ],
      }),
    );
    expect(within(attentionSection()).queryByText("All clear")).toBeNull();
    expect(
      within(attentionSection()).getByRole("link", { name: "Inbox" }),
    ).toHaveAttribute("href", "/tasks?system=inbox");
  });

  it("omits 'Continue working' entirely when no project has open work", () => {
    renderScreen(day());
    expect(
      screen.queryByRole("heading", { name: "Continue working" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "All projects" }),
    ).not.toBeInTheDocument();
  });

  it("states each project's open work, status and progress", () => {
    renderScreen(
      day({
        continueProjects: [
          {
            id: "p1",
            title: "Kitchen renovation",
            openCount: 2,
            taskTotal: 6,
            taskCompleted: 4,
            statusLabel: "On track",
            needsAttention: false,
            lastActivityIso: "2026-08-07T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(screen.getByText("2 open tasks · On track")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Kitchen renovation progress" }),
    ).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("singularises a project with exactly one open task", () => {
    renderScreen(
      day({
        continueProjects: [
          {
            id: "p1",
            title: "Solo",
            openCount: 1,
            taskTotal: 2,
            taskCompleted: 1,
            statusLabel: "Stale",
            needsAttention: true,
            lastActivityIso: null,
          },
        ],
      }),
    );
    expect(screen.getByText("1 open task · Stale")).toBeInTheDocument();
  });
});

describe("what is NOT on this screen any more", () => {
  it("offers no capture control of its own — the global + is the only one", () => {
    const { container } = renderScreen(day());
    expect(
      screen.queryByRole("button", { name: /capture/i }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-testid^='today-capture-']"),
    ).toBeNull();
  });

  it("offers no Customise affordance and no collapsible section", () => {
    const { container } = renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(
      screen.queryByRole("button", { name: /customise/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });

  it("has no search field of its own", () => {
    renderScreen(day());
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
