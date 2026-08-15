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
    priority: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

/**
 * A meeting on the day. `upcoming` defaults to FALSE so a fixture that does not
 * care about "what is next" does not accidentally opt into the Next up surface —
 * every test that asserts about it says so.
 */
function meeting(
  id: string,
  title: string,
  timeLabel: string,
  overrides: Partial<TodayDayData["meetings"][number]> = {},
): TodayDayData["meetings"][number] {
  return { id, title, timeLabel, context: null, upcoming: false, ...overrides };
}

/**
 * CAL-01 — one row of the day's unified Schedule.
 *
 * The Schedule panel now draws the schedule read model rather than the
 * `meetings` array: an entry is either an imported calendar occurrence or a
 * DalyHub Meeting no occurrence represents. `meetings` survives as the input to
 * the "Meetings today" FIGURE and to `nextUp`, which is what these fixtures keep
 * separate.
 */
function scheduleEntry(
  id: string,
  title: string,
  timeLabel: string,
  overrides: Partial<TodayDayData["schedule"]["timed"][number]> = {},
): TodayDayData["schedule"]["timed"][number] {
  return {
    id,
    kind: "meeting",
    title,
    startsAtIso: `${TODAY}T00:00:00.000Z`,
    endsAtIso: `${TODAY}T01:00:00.000Z`,
    allDay: false,
    timeLabel,
    endTimeLabel: null,
    timeRangeLabel: timeLabel,
    timeAccessibleLabel: timeLabel,
    crossesDay: false,
    dayTransitionLabel: null,
    spanLabel: null,
    location: null,
    meetingUrl: null,
    cancelled: false,
    tentative: false,
    sourceId: null,
    sourceName: null,
    sourceRank: null,
    meetingId: id,
    relative: "upcoming",
    ...overrides,
  };
}

/** A day whose Schedule panel holds `timed`. */
function scheduleOf(
  timed: readonly TodayDayData["schedule"]["timed"][number][],
): TodayDayData["schedule"] {
  return { dateIso: TODAY, allDay: [], timed, count: timed.length };
}

/** A project with open work, as the rail's focus surface and panel read it. */
function project(
  overrides: Partial<TodayDayData["continueProjects"][number]> = {},
): TodayDayData["continueProjects"][number] {
  return {
    id: "p1",
    title: "Kitchen renovation",
    openCount: 2,
    taskTotal: 6,
    taskCompleted: 4,
    statusLabel: "On track",
    needsAttention: false,
    lastActivityIso: "2026-08-07T00:00:00.000Z",
    iconKey: null,
    colourRank: 0,
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
    // CAL-01 — a quiet day has no external calendar schedule either.
    schedule: { dateIso: TODAY, allDay: [], timed: [], count: 0 },
    scheduleHasSources: false,
    scheduleStale: false,
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

/** The day column ("Focus"), located by its heading. */
function timelineSection() {
  return screen.getByRole("heading", { name: "Focus" }).closest("section")!;
}

/** The rail panel that holds the day's timed events. */
function scheduleSection() {
  return screen.getByRole("heading", { name: "Schedule" }).closest("section")!;
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
 * The day's FIGURES.
 *
 * The hero is gone — the approved direction states the day as a row of quiet
 * stat cards on the canvas rather than as one tinted band. What these assert is
 * that the rules survived the move, because they are the reason the surface was
 * worth keeping: a zero never paints, the row does not render at all when it
 * would have nothing to say, every figure links to the canonical view that holds
 * it, and slipped work is the one thing given a tone.
 */
describe("the day's figures", () => {
  it("does not render at all on a quiet day", () => {
    const { container } = renderScreen(day());
    expect(container.querySelector(".dh-stat-row")).toBeNull();
  });

  it("renders only the figures whose counts are non-zero", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.getByTestId("today-stat-tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("today-stat-meetings")).toBeNull();
    expect(screen.queryByTestId("today-stat-overdue")).toBeNull();
  });

  it("names each figure as a heading over its number", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    const card = screen.getByTestId("today-stat-tasks");
    expect(within(card).getByText("Tasks for today")).toBeInTheDocument();
    expect(within(card).getByText("1")).toBeInTheDocument();
  });

  it("counts only unfinished work in the Tasks figure, while progress keeps the full day", () => {
    const done = task("b", "Beta", { completed: true, completedDate: TODAY });
    renderScreen(
      day({ today: [task("a", "Alpha"), done], completedToday: [done] }),
    );
    expect(
      within(screen.getByTestId("today-stat-tasks")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("today-stat-progress")).getByText(
        "1 of 2 done today",
      ),
    ).toBeInTheDocument();
  });

  it("gives the tone to slipped work and to nothing else", () => {
    const { container } = renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
        meetings: [meeting("m1", "Standup", "09:30")],
      }),
    );
    const toned = container.querySelectorAll(
      '.dh-stat__value[data-tone="attention"]',
    );
    expect(toned).toHaveLength(1);
    expect(toned[0].closest(".dh-stat")).toBe(
      screen.getByTestId("today-stat-overdue"),
    );
  });

  it("navigates each figure to the filtered view that holds its number", () => {
    renderScreen(
      day({
        today: [task("a", "Alpha")],
        meetings: [meeting("m1", "Standup", "09:30")],
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
      }),
    );
    expect(screen.getByTestId("today-stat-tasks")).toHaveAttribute(
      "href",
      "/tasks?system=today",
    );
    expect(screen.getByTestId("today-stat-meetings")).toHaveAttribute(
      "href",
      "/meetings",
    );
    expect(screen.getByTestId("today-stat-overdue")).toHaveAttribute(
      "href",
      "/tasks?system=overdue",
    );
  });

  /*
   * The day's "what next?" is answered ON the figure it belongs to. A meeting
   * that has already started is not next, which is the whole reason the flag is
   * decided on the server against the request instant.
   */
  it("states the next START TIME on the meetings figure", () => {
    renderScreen(
      day({
        meetings: [
          meeting("m0", "Already started", "08:00"),
          meeting("m1", "Ops planning", "09:30", { upcoming: true }),
        ],
      }),
    );
    expect(
      within(screen.getByTestId("today-stat-meetings")).getByText(
        "Next: 09:30",
      ),
    ).toBeInTheDocument();
  });

  it("states no next time when every meeting has already started", () => {
    renderScreen(
      day({ meetings: [meeting("m0", "Already started", "08:00")] }),
    );
    expect(
      within(screen.getByTestId("today-stat-meetings")).queryByText(/^Next:/),
    ).toBeNull();
  });

  it("shows the progress figure only once something is done", () => {
    renderScreen(day({ today: [task("a", "Alpha"), task("b", "Beta")] }));
    expect(screen.queryByTestId("today-stat-progress")).toBeNull();

    const done = task("c", "Gamma", { completed: true, completedDate: TODAY });
    renderScreen(
      day({ today: [task("a", "Alpha"), done], completedToday: [done] }),
    );
    const card = screen.getByTestId("today-stat-progress");
    expect(within(card).getByText("50%")).toBeInTheDocument();
    expect(within(card).getByText("1 of 2 done today")).toBeInTheDocument();
  });
});

describe("the day timeline", () => {
  it("shows a compact empty line — not a card — when nothing is on", () => {
    renderScreen(day());
    expect(screen.getByText(/Nothing planned today/)).toBeInTheDocument();
    // No section labels, because there are no sections.
    expect(screen.queryByText("Meetings")).not.toBeInTheDocument();
    expect(screen.queryByText("Due today")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned today")).not.toBeInTheDocument();
  });

  it("omits the Meetings section entirely when there are none", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(
      within(timelineSection()).getByText("Due today"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Meetings")).not.toBeInTheDocument();
  });

  it("renders the day's schedule in time order, with a time and no checkbox", () => {
    renderScreen(
      day({
        meetings: [
          meeting("m1", "Design review", "09:30", { context: "Studio" }),
          meeting("m2", "1:1", "11:00"),
        ],
        // CAL-01 — the Schedule panel draws the schedule read model. The
        // `meetings` array is now the "Meetings today" FIGURE's input alone.
        schedule: scheduleOf([
          scheduleEntry("m1", "Design review", "09:30", { location: "Studio" }),
          scheduleEntry("m2", "1:1", "11:00"),
        ]),
      }),
    );
    expect(screen.getByText("09:30")).toBeInTheDocument();
    // The Meeting RECORD route is `/meeting/:id` (singular); `/meetings` is the
    // collection. This row used to link to the collection path with an id
    // appended and therefore 404ed — fixed when the row moved into the shared
    // `ScheduleList` (CAL-01).
    expect(screen.getByRole("link", { name: "Design review" })).toHaveAttribute(
      "href",
      "/meeting/m1",
    );
    // A meeting happens TO you: the row has no completion control.
    expect(
      screen.queryByRole("checkbox", { name: /Design review/ }),
    ).not.toBeInTheDocument();
  });

  it("never prints a time beside a task", () => {
    const { container } = renderScreen(day({ today: [task("a", "Alpha")] }));
    const row = within(timelineSection()).getByText("Alpha").closest("li")!;
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
    expect(within(timelineSection()).getAllByText(/^Late /)).toHaveLength(3);
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
     * A position guard, not a pixel test. The reading order is the greeting, the
     * DAY, and only then the day's figures — at every width, because nothing on
     * this screen is moved by CSS `order`. If a band is ever added between the
     * greeting and the first task the sequence changes and this fails.
     *
     * FINAL-UI swapped the last two. §45 of the brief is the rule the concepts
     * state ("do not put decorative stats before actionable content") and
     * concept 1's Today is drawn that way: the day's tasks and its schedule
     * open the page, and the two small measures sit at the bottom. The figures
     * cost the fold ~110px of the owner's actual work, which is the opposite of
     * what a test named for the laptop fold should be protecting.
     */
    const { container } = renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
      }),
    );
    const surface = container.querySelector(".dh-today")!;
    const roles = ["dh-today__head", "dh-today__timeline", "dh-stat-row"];
    const blocks = [...surface.querySelectorAll("*")]
      .map((node) => roles.find((role) => node.classList.contains(role)))
      .filter((role): role is string => role !== undefined);
    expect(blocks).toEqual(roles);
    /*
     * GOAL-02 / UIX-01 — progress is the LAST block on the screen, so it can
     * never come between the figures and the first actionable row. The DOM order
     * is what the phone layout stacks, so this is the hierarchy guard.
     *
     * UIX-01 moved it OUT of the day's own column (which no longer exists — the
     * body is three sibling regions) and made it a full-width row under the
     * whole body. The guard is the same claim about the same order, read off the
     * screen root rather than off a column that has been replaced.
     */
    expect(surface.lastElementChild?.className).toContain("dh-today__progress");
    const focusColumn = surface.querySelector(".dh-today__col--focus")!;
    expect(focusColumn.firstElementChild?.className).toContain(
      "dh-today__timeline",
    );
    // The first row inside the day column is the overdue one.
    const firstRow = container.querySelector(".dh-today__timeline .dh-day-row");
    expect(firstRow?.textContent).toContain("Late");
  });
});

/* -------------------------------------------------------------------------- */
/* TODAY-10 — the Focus bands                                                  */
/* -------------------------------------------------------------------------- */

describe("TODAY-10: the Focus panel says WHY each task is there", () => {
  it("names the three bands, in the order the day happens in", () => {
    renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [
          task("d", "Deadline"),
          task("p", "Intention", { dueDate: null, scheduledDate: TODAY }),
        ],
      }),
    );
    const labels = [
      ...timelineSection().querySelectorAll(".dh-day-section__label"),
    ].map((node) => node.textContent);
    expect(labels).toEqual(["Overdue", "Due today", "Planned today"]);
  });

  it("draws only the bands that hold work — no empty heading", () => {
    renderScreen(day({ today: [task("d", "Deadline")] }));
    const labels = [
      ...timelineSection().querySelectorAll(".dh-day-section__label"),
    ].map((node) => node.textContent);
    expect(labels).toEqual(["Due today"]);
  });

  it("puts a task that is BOTH due and planned today in ONE band, once", () => {
    renderScreen(day({ today: [task("b", "Both", { scheduledDate: TODAY })] }));
    const panel = timelineSection();
    expect(within(panel).getAllByText("Both")).toHaveLength(1);
    expect(within(panel).queryByText("Planned today")).not.toBeInTheDocument();
  });

  it("keeps the Project on the row — the band carries the date meaning", () => {
    renderScreen(
      day({
        today: [
          task("d", "Deadline", {
            parent: { kind: "project", id: "p1", title: "Kitchen renovation" },
          }),
        ],
      }),
    );
    const row = within(timelineSection()).getByText("Deadline").closest("li")!;
    expect(within(row).getByText("Kitchen renovation")).toBeInTheDocument();
  });

  it("shows priority only where there IS one, using the shared indicator", () => {
    const { container } = renderScreen(
      day({
        today: [
          task("a", "Urgent", { priority: "p1" }),
          task("b", "Untriaged"),
        ],
      }),
    );
    const urgent = within(timelineSection()).getByText("Urgent").closest("li")!;
    expect(within(urgent).getByText("P1")).toBeInTheDocument();
    // Not colour alone: the indicator carries the priority in words for AT.
    expect(urgent.textContent).toContain("priority");
    const plain = within(timelineSection())
      .getByText("Untriaged")
      .closest("li")!;
    expect(plain.querySelector(".dh-priority")).toBeNull();
    // And the whole panel draws exactly one, so nothing gained a placeholder.
    expect(container.querySelectorAll(".dh-day-row .dh-priority")).toHaveLength(
      1,
    );
  });

  it("orders a band by priority rather than alphabetically", () => {
    renderScreen(
      day({
        today: [task("a", "Aardvark"), task("z", "Zebra", { priority: "p1" })],
      }),
    );
    const titles = [
      ...timelineSection().querySelectorAll(".dh-day-row__title"),
    ].map((node) => node.textContent);
    expect(titles).toEqual(["Zebra", "Aardvark"]);
  });

  it("bounds the day's rows, states the true total and routes to Tasks", () => {
    renderScreen(
      day({
        today: Array.from({ length: 14 }, (_, index) =>
          task(`t${index}`, `Task ${String(index).padStart(2, "0")}`),
        ),
      }),
    );
    expect(
      timelineSection().querySelectorAll(".dh-day-row__title"),
    ).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "View all 14 tasks for today" }),
    ).toHaveAttribute("href", "/tasks?system=today");
  });

  it("keeps a ticked row on screen even when the band is at its bound", () => {
    const onCompleteTask = vi.fn();
    renderScreen(
      day({
        today: Array.from({ length: 9 }, (_, index) =>
          task(`t${index}`, `Task ${String(index).padStart(2, "0")}`),
        ),
      }),
      onCompleteTask,
    );
    expect(screen.getByText(/View all 9 tasks for today/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Task 02" }));

    // It moved to the end of its band, dimmed — but it is still on the screen.
    // The bound counts what is left to do, so the ninth task takes its slot and
    // the remainder honestly falls to nothing.
    expect(
      screen.getByRole("checkbox", { name: "Reopen Task 02" }),
    ).toBeChecked();
    expect(screen.queryByText(/View all/)).not.toBeInTheDocument();
  });

  it("says nothing about a remainder when the whole day fits", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.queryByText(/View all/)).not.toBeInTheDocument();
  });

  it("distinguishes 'overdue but nothing on today' from an empty day", () => {
    renderScreen(
      day({ overdue: [task("o", "Late", { dueDate: "2026-08-01" })] }),
    );
    expect(screen.getByText("Nothing else planned today.")).toBeInTheDocument();
    // Not the empty-day line, which would deny the overdue row above it.
    expect(screen.queryByText(/Capture anything new/)).not.toBeInTheDocument();
  });

  it("counts the canonical today set on the figure, not the rows drawn", () => {
    renderScreen(
      day({
        // Due today but its PLAN slipped: filed under Overdue here, and counted
        // by `/tasks?system=today`, which the figure links to.
        overdue: [
          task("slipped", "Slipped plan", { scheduledDate: "2026-08-01" }),
        ],
        today: [task("a", "Alpha")],
      }),
    );
    const card = screen.getByTestId("today-stat-tasks");
    expect(within(card).getByText("2")).toBeInTheDocument();
    expect(card.closest("a") ?? card.querySelector("a")).toHaveAttribute(
      "href",
      "/tasks?system=today",
    );
  });

  it("does not move a row between bands when it is ticked", () => {
    const onCompleteTask = vi.fn();
    renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
      }),
      onCompleteTask,
    );
    const bandOf = (title: string) =>
      within(timelineSection())
        .getByText(title)
        .closest(".dh-day-section")!
        .querySelector(".dh-day-section__label")!.textContent;

    expect(bandOf("Late")).toBe("Overdue");
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Late" }));
    expect(onCompleteTask).toHaveBeenCalledWith("o", true);
    // Still under Overdue, dimmed — not fifteen rows down under "Due today".
    expect(bandOf("Late")).toBe("Overdue");
    // And the overdue FIGURE stops counting it, because it is done.
    expect(screen.queryByTestId("today-stat-overdue")).not.toBeInTheDocument();
  });
});

/*
 * The day's timed events, in their own rail panel.
 */
describe("the Schedule panel", () => {
  it("is absent when the day holds no meetings", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(
      screen.queryByRole("heading", { name: "Schedule" }),
    ).not.toBeInTheDocument();
  });

  it("renders meetings in time order, with a time and no checkbox", () => {
    renderScreen(
      day({
        meetings: [
          meeting("m1", "Design review", "09:30", { context: "Studio" }),
          meeting("m2", "1:1", "11:00"),
        ],
        schedule: scheduleOf([
          scheduleEntry("m1", "Design review", "09:30", {
            location: "Studio",
          }),
          scheduleEntry("m2", "1:1", "11:00"),
        ]),
      }),
    );
    const panel = scheduleSection();
    expect(within(panel).getByText("09:30")).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Design review" }),
    ).toHaveAttribute("href", "/meeting/m1");
    expect(
      within(panel).queryByRole("checkbox", { name: /Design review/ }),
    ).not.toBeInTheDocument();
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

  it("renders Asset obligations as ordinary attention rows", () => {
    renderScreen(
      day({
        attention: [
          {
            id: "asset",
            kind: "asset",
            label: "Hilux",
            detail: "Registration expires tomorrow",
            href: "/asset/a1?tab=obligations",
          },
        ],
      }),
    );
    const panel = attentionSection();
    expect(within(panel).getByRole("link", { name: "Hilux" })).toHaveAttribute(
      "href",
      "/asset/a1?tab=obligations",
    );
    expect(
      within(panel).getByText("Registration expires tomorrow"),
    ).toBeInTheDocument();
  });

  it("shows no project surface at all when no project has open work", () => {
    renderScreen(day());
    expect(
      screen.queryByRole("heading", { name: "Continue working" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "All projects" }),
    ).not.toBeInTheDocument();
  });

  it("states each project's open work and status in one line", () => {
    renderScreen(day({ continueProjects: [project()] }));
    const panel = screen
      .getByRole("heading", { name: "Continue working" })
      .closest("section")!;
    expect(
      within(panel).getByText("2 open tasks · On track"),
    ).toBeInTheDocument();
    /*
     * UIX-01 — no per-row completion BAR.
     *
     * The rail answers "which project needs a look?", and it answers it with
     * the open count and the health word above. "How far through is it?" is a
     * different question that the Projects gallery and the Project record both
     * answer properly; a 6px bar under each of three rows in a 21rem column
     * answered it badly and cost the rail a third of its height.
     */
    expect(within(panel).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("singularises a project with exactly one open task", () => {
    renderScreen(
      day({
        continueProjects: [
          project({
            id: "p9",
            title: "Solo",
            openCount: 1,
            statusLabel: "Stale",
          }),
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
