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

import { CaptureProvider } from "~/shared/capture";
import { DrawerProvider } from "~/shared/drawer";
import { TodayScreen } from "~/modules/today/day/TodayScreen";
import { emptyDay, type TodayDayData } from "~/modules/today/day/load";
import {
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
  UNMEASURED_GOAL,
  type GoalProgressEvaluation,
} from "~/kernel/goals";

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
    colourSlot: null,
    colourRank: 0,
    ...overrides,
  };
}

/**
 * A quiet day, so each test opts INTO the thing it is asserting about.
 *
 * Built from the LOADER's own `emptyDay` rather than a hand-written literal:
 * that is the degradation path the route takes when a workspace read fails, so
 * basing the fixture on it means a field added to the payload cannot be
 * remembered in one place and forgotten in the other. A quiet day has no
 * schedule, no measurable Goals, no workload trend and no reflection.
 */
function day(overrides: Partial<TodayDayData> = {}): TodayDayData {
  return {
    ...emptyDay({
      todayIso: TODAY,
      dateLong: "Saturday 8 August 2026",
      hour: 9,
      ownerName: "Aidan",
    }),
    ...overrides,
  };
}

/**
 * TODAY-11 — the week the Schedule panel draws, with `timed` on ONE of its days.
 *
 * The strip is always seven days; what varies is which of them holds anything.
 * The helper keeps every test that only cares about today's rows from having to
 * describe a week.
 */
function weekWith(
  dateIso: string,
  timed: readonly TodayDayData["schedule"]["timed"][number][],
): TodayDayData["week"] {
  return emptyDay({
    todayIso: TODAY,
    dateLong: "Saturday 8 August 2026",
    hour: 9,
    ownerName: "Aidan",
  }).week.map((day_) =>
    day_.dateIso === dateIso
      ? {
          ...day_,
          itemCount: timed.length,
          schedule: {
            dateIso,
            allDay: [],
            timed,
            count: timed.length,
          },
        }
      : day_,
  );
}

/**
 * The frame the route provides.
 *
 * TODAY-11 added the `CaptureProvider`, because the screen now has capture
 * controls of its own (the header's "+ Add task", the Quick capture card, the
 * reflection invitation) and every one of them opens the SHARED sheet. Without
 * the provider `useCapture()` returns null and those controls deliberately
 * render nothing — which would make every assertion about them pass for the
 * wrong reason.
 */
function renderScreen(
  data: TodayDayData,
  onCompleteTask?: (id: string, complete: boolean) => void,
) {
  const element: ReactElement = (
    <CaptureProvider>
      <DrawerProvider renderDrawer={() => null}>
        <TodayScreen data={data} onCompleteTask={onCompleteTask} />
      </DrawerProvider>
    </CaptureProvider>
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

/** The day's own panel ("Today’s plan"), located by its heading. */
function timelineSection() {
  return screen
    .getByRole("heading", { name: "Today’s plan" })
    .closest("section")!;
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
});

/*
 * The WEEK's measures.
 *
 * REDESIGN-03 removed the day's stat-card row entirely. Every figure on it —
 * "Meetings today · Next 20:00", "Overdue 44", "Daily progress 68%" — counted
 * something the same page renders in full a few hundred pixels lower, so it was
 * a caption printed at headline size. The tests that pinned those cards down
 * went with them; what survives is the rule they existed to protect, asserted
 * against the one measure row that is left.
 *
 * The row is about the WEEK, which is what earns it a place above the day: a
 * figure that counts what is visible immediately below it is not a measure.
 */
describe("the week's measures", () => {
  it("does not render the removed stat-card row", () => {
    // The guard against the merge that put it back. Both classes are the shared
    // StatCard family's, so this fails if any of it returns to Today.
    const { container } = renderScreen(
      day({
        today: [task("a", "Alpha")],
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        meetings: [meeting("m1", "Standup", "09:30")],
      }),
    );
    expect(container.querySelector(".dh-stat-row")).toBeNull();
    expect(container.querySelector(".dh-stat")).toBeNull();
  });

  /*
   * DALYHUB_DESIGN_SYSTEM.md §5d — "no focus time, no 'daily progress'
   * percentage". Analytics has refused both since UIX-05 and states why in
   * `~/kernel/analytics/analytics.ts`; Today had quietly reintroduced the
   * second one as a green ring. This is the line, asserted on the surface that
   * crossed it.
   */
  it("states no daily-progress percentage", () => {
    const done = task("b", "Beta", { completed: true, completedDate: TODAY });
    const { container } = renderScreen(
      day({ today: [task("a", "Alpha"), done], completedToday: [done] }),
    );
    expect(screen.queryByText("Daily progress")).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
    expect(screen.queryByText(/done today/)).toBeNull();
    expect(container.querySelector(".dh-progress-ring")).toBeNull();
  });

  it("does not render at all when there is nothing real to measure", () => {
    // No trend and no Goals: three empty cards would be a row of noughts.
    const { container } = renderScreen(day({ activityTrend: null, goals: [] }));
    expect(container.querySelector(".dh-today__summary")).toBeNull();
  });

  it("measures the week rather than the day", () => {
    renderScreen(
      day({
        activityTrend: {
          days: [],
          totalCompleted: 21,
          totalCreated: 12,
          previousCompleted: 27,
        },
      }),
    );
    const summary = screen.getByTestId("today-summary");
    expect(within(summary).getByText("Tasks completed")).toBeInTheDocument();
    expect(within(summary).getByText("21")).toBeInTheDocument();
    expect(
      within(summary).getByText("Last 7 days · −6 on the previous 7"),
    ).toBeInTheDocument();
    expect(within(summary).getByText("Tasks captured")).toBeInTheDocument();
    expect(within(summary).getByText("12")).toBeInTheDocument();
  });

  /*
   * The rule every figure on this screen has always followed: a number the
   * owner cannot check is a number they have to trust. Removing the workload
   * chart made this one matter more, not less — Analytics is now the only place
   * the week has a shape, so the figure that used to sit beside the chart has
   * to point at it.
   */
  it("links the checkable measures to where the records are", () => {
    renderScreen(
      day({
        activityTrend: {
          days: [],
          totalCompleted: 4,
          totalCreated: 2,
          previousCompleted: null,
        },
      }),
    );
    const summary = screen.getByTestId("today-summary");
    expect(
      within(summary).getByRole("link", { name: /Tasks completed/ }),
    ).toHaveAttribute("href", "/analytics");
    // "Created in the last seven days" has no canonical view, so it does not
    // pretend to have one.
    expect(
      within(summary).queryByRole("link", { name: /Tasks captured/ }),
    ).toBeNull();
  });

  /*
   * The workload chart restated the summary's first two figures — its own
   * caption read "21 completed · 124 created" — and shared one linear scale, so
   * a single day of bulk capture flattened the other six to hairlines.
   */
  it("does not render the removed workload chart", () => {
    renderScreen(
      day({
        activityTrend: {
          days: [{ dateIso: TODAY, completed: 3, created: 5 }],
          totalCompleted: 3,
          totalCreated: 5,
          previousCompleted: 1,
        },
      }),
    );
    expect(screen.queryByTestId("today-activity-trend")).toBeNull();
    expect(screen.queryByText("This week")).toBeNull();
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
        // TODAY-11 — and the panel reads it out of the WEEK, so the day's slice
        // and the week's entry for that day are seeded from the same rows.
        schedule: scheduleOf([
          scheduleEntry("m1", "Design review", "09:30", { location: "Studio" }),
          scheduleEntry("m2", "1:1", "11:00"),
        ]),
        week: weekWith(TODAY, [
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
    /*
     * MOBILE-02 §7 — the row now carries the phrase TWICE on purpose: the full
     * one for assistive technology and a short one for the eye, because "Due
     * over a year ago" beside a task title ellipsises the title on a phone.
     *
     * `useCompactViewport` is desktop-first on the server and in jsdom (no
     * `matchMedia` match), so the drawn string here is the full one and both
     * spans read the same. What this asserts is the CONTRACT — the full phrase
     * is always present and always announced — not which of the two rungs the
     * test environment happens to be on.
     */
    const row = within(timelineSection()).getByText("Late").closest("li")!;
    const due = row.querySelector(".dh-day-row__due")!;
    expect(due.querySelector(".dh-visually-hidden")?.textContent).toBe(
      "Due 3 days ago",
    );
    expect(due.querySelector("[aria-hidden='true']")).not.toBeNull();
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
     * A position guard, not a pixel test. If a band is ever added between the
     * page heading and the first task, the sequence changes and this fails.
     *
     * ── The order this asserts, and who decided it ──────────────────────────
     * FINAL-UI put the day's figures BELOW the day, citing its own §45 ("do not
     * put decorative stats before actionable content"). REDESIGN-03 removed the
     * stat row outright and put ONE row of week measures above the day instead.
     * TODAY-11 keeps that position, because MOCKUP 5 draws four stat cards
     * directly under the greeting and the mockup is the owner's newer intent —
     * recorded as an explicit amendment in
     * `docs/design/TODAY_11_COMMAND_CENTRE_2026_08.md` §3.1 rather than swapped
     * in silence.
     *
     * CONVERGE-01 §1 put every band on ONE twelve-column grid, so the measures
     * and the plan are now siblings inside `.dh-today__grid` rather than a strip
     * above a "work rank". The rule this protects is unchanged and is stated in
     * the same terms: exactly TWO blocks may precede the grid (the header and
     * the day rail), the measures are the grid's first child, and the day's own
     * plan is its second. A block inserted above the work — a second figure row,
     * a banner, a hero — fails here whatever it is called.
     */
    const { container } = renderScreen(
      day({
        overdue: [task("o", "Late", { dueDate: "2026-08-01" })],
        today: [task("a", "Alpha")],
        // The measure row only paints when it has a real reading, so the
        // fixture has to give it one for the ORDER to be assertable at all.
        activityTrend: {
          days: [],
          totalCompleted: 4,
          totalCreated: 2,
          previousCompleted: 3,
        },
      }),
    );
    const surface = container.querySelector(".dh-today")!;
    const roles = ["dh-today__head", "dh-today__summary", "dh-today__timeline"];
    const blocks = [...surface.querySelectorAll("*")]
      .map((node) => roles.find((role) => node.classList.contains(role)))
      .filter((role): role is string => role !== undefined);
    expect(blocks).toEqual(roles);

    const grid = surface.querySelector(".dh-today__grid")!;
    const beforeGrid = [...surface.children].slice(
      0,
      [...surface.children].indexOf(grid),
    );
    expect(beforeGrid).toHaveLength(2); // head, day rail

    // The measures are the grid's first cell and the day's own plan its second,
    // ahead of Schedule.
    expect(grid.children[0]?.className).toContain("dh-today__summary");
    expect(grid.children[1]?.className).toContain("dh-today__timeline");
    // The first row inside it is the overdue one.
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

  it("shows every row's priority through the shared indicator", () => {
    const { container } = renderScreen(
      day({
        today: [
          task("a", "Urgent", { priority: "p1" }),
          task("b", "Untriaged"),
        ],
      }),
    );
    const urgent = within(timelineSection()).getByText("Urgent").closest("li")!;
    expect(urgent.querySelector(".dh-priority")).toHaveAttribute(
      "aria-label",
      "Priority 1",
    );
    /*
     * An untriaged task draws a grey Priority 4 rather than a blank.
     *
     * This used to assert the opposite. The visual references show all four
     * levels in the list, and the reason holds up: an empty cell is ambiguous
     * between "normal" and "not looked at yet", and the gaps left the priority
     * column ragged down a panel whose whole value is that it scans in one
     * pass. Grey on grey is quiet enough that P4 does not compete.
     */
    const plain = within(timelineSection())
      .getByText("Untriaged")
      .closest("li")!;
    expect(plain.querySelector(".dh-priority")).toHaveAttribute(
      "aria-label",
      "Priority 4",
    );
    // Still exactly one indicator per row — nothing gained a second marker.
    expect(container.querySelectorAll(".dh-day-row .dh-priority")).toHaveLength(
      2,
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
    // Scoped to the PLAN's own remainder link. "View all" is also the Goal
    // progress panel's trailing action, and a bare /View all/ would match it.
    expect(screen.queryByTestId("today-focus-view-all")).toBeNull();
  });

  it("says nothing about a remainder when the whole day fits", () => {
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.queryByTestId("today-focus-view-all")).toBeNull();
  });

  it("distinguishes 'overdue but nothing on today' from an empty day", () => {
    renderScreen(
      day({ overdue: [task("o", "Late", { dueDate: "2026-08-01" })] }),
    );
    expect(screen.getByText("Nothing else planned today.")).toBeInTheDocument();
    // Not the empty-day line, which would deny the overdue row above it.
    expect(
      screen.queryByText("Nothing planned today."),
    ).not.toBeInTheDocument();
  });

  it("counts the canonical today set on the bound, not the rows drawn", () => {
    /*
     * The claim survives the stat card that used to carry it. "View all N tasks
     * for today" links to `/tasks?system=today`, so N has to be THAT view's
     * number: a task due today whose plan has also slipped is filed under
     * Overdue here and counted by the system view there, and deriving the
     * figure from the membership rule rather than from the drawn rows is what
     * stops the link and its own destination disagreeing.
     */
    renderScreen(
      day({
        overdue: [
          task("slipped", "Slipped plan", { scheduledDate: "2026-08-01" }),
        ],
        today: Array.from({ length: 12 }, (_, index) =>
          task(`t${index}`, `Task ${index}`),
        ),
      }),
    );
    const link = screen.getByTestId("today-focus-view-all");
    // 12 on today + the one due today whose plan slipped = the system view's 13.
    expect(link).toHaveTextContent("View all 13 tasks for today");
    expect(link).toHaveAttribute("href", "/tasks?system=today");
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
  /*
   * TODAY-11 — the panel is now PERMANENT, and this reverses a rule.
   *
   * It used to disappear on a day with nothing on it, because "a Schedule
   * heading over nothing is chrome". MOCKUP 5 draws the panel as one of the two
   * halves of the day's working rank, and it is no longer over nothing: the week
   * strip is a real control over real data (which days of this week hold
   * anything), and it is exactly as useful on a quiet Saturday as on a full
   * Tuesday. What must not come back is a SILENT empty panel — the day says
   * "Nothing scheduled" in words, and says something different when no calendar
   * is connected at all, because those are two different facts.
   */
  it("keeps its strip on a day with nothing on it, and says so", () => {
    renderScreen(
      day({ today: [task("a", "Alpha")], scheduleHasSources: true }),
    );
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(
      within(scheduleSection()).getByText("Nothing scheduled."),
    ).toBeInTheDocument();
  });

  it("distinguishes an empty day from a workspace with no calendar", () => {
    renderScreen(day({ scheduleHasSources: false }));
    expect(
      within(scheduleSection()).getByText(/Connect a calendar in Settings/),
    ).toBeInTheDocument();
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
        week: weekWith(TODAY, [
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
  it("writes through the existing completion path and ticks optimistically", () => {
    const onCompleteTask = vi.fn();
    const done = task("c", "Gamma", { completed: true, completedDate: TODAY });
    renderScreen(
      day({
        today: [task("a", "Alpha"), task("b", "Beta"), done],
        completedToday: [done],
      }),
      onCompleteTask,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Alpha" }));

    expect(onCompleteTask).toHaveBeenCalledWith("a", true);
    /*
     * Optimistic: the ROW changes state before any revalidation. This used to
     * watch the daily-progress figure move from "1 of 3" to "2 of 3"; that
     * figure is gone (see "the week's measures"), so the assertion is made on
     * the thing the owner actually pressed. The row also stays in its band —
     * completion changes how a row is DRAWN, never where it sits.
     */
    expect(
      screen.getByRole("checkbox", { name: "Reopen Alpha" }),
    ).toBeChecked();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
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

describe("the support rank", () => {
  /*
   * TODAY-11 — "All clear" moved OFF the attention panel and became the page's
   * own last line.
   *
   * MOCKUP 5 has no attention panel at all, and the reason this screen keeps one
   * is capability, not composition: it is the only surface where an Asset
   * obligation with no open Task reaches the owner. A panel that exists for what
   * it CARRIES has no business drawing a heading and a green tick when it
   * carries nothing — so on a clear day the whole rank is absent, and the page
   * ends on one quiet line instead. Still one line, still never a green card,
   * and still never beside real items.
   */
  it("draws no attention panel at all when nothing qualifies", () => {
    renderScreen(day());
    expect(
      screen.queryByRole("heading", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("All clear.")).toBeVisible();
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
    expect(screen.queryByText("All clear.")).toBeNull();
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

describe("what is NOT on this screen", () => {
  /*
   * TODAY-11 reversed the rule this used to assert ("Today offers no capture
   * control of its own — the global + is the only one"). MOCKUP 5 draws a Quick
   * capture card and a "+ Add task" in the page header, and both are real: every
   * control on them opens the SHARED sheet, so what the removal was protecting —
   * one capture implementation — is still true. The assertion that replaces it is
   * in "the Quick capture card" below.
   */
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

/* -------------------------------------------------------------------------- */
/* Goal fixtures for the summary strip                                         */
/* -------------------------------------------------------------------------- */

function todayGoal(
  id: string,
  title: string,
  progress: GoalProgressEvaluation,
) {
  return {
    id,
    title,
    areaTitle: "Health",
    areaColourRank: 0,
    areaIconKey: null,
    areaColourSlot: null,
    iconKey: null,
    colourSlot: null,
    progress,
    changeInWindow: null,
    windowDays: 30,
  };
}

/** A Goal with a real configuration and real readings — measurable, moving. */
function measuredGoal() {
  return todayGoal(
    "g1",
    "Reach 70 kg",
    evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({
          type: "target_value",
          unit: "kg",
          baselineValue: 85,
          targetValue: 70,
        }),
        targetDate: "2026-12-31",
        measurements: [{ value: 72, measuredOn: TODAY }],
        startedOn: "2026-06-10",
      },
      { todayIso: TODAY },
    ),
  );
}

/** A Goal that was never told how to measure itself. Status: not_measured. */
function unmeasuredGoal() {
  return todayGoal(
    "g2",
    "Never measured",
    evaluateGoalProgress(
      { config: UNMEASURED_GOAL, targetDate: null, measurements: [] },
      { todayIso: TODAY },
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* The summary strip                                                           */
/* -------------------------------------------------------------------------- */

describe("Today's summary strip states only what was actually measured", () => {
  const trend = {
    days: [{ dateIso: TODAY, created: 3, completed: 4 }],
    totalCreated: 12,
    totalCompleted: 24,
    previousCompleted: 16,
  };

  it("names a rolling seven-day window rather than calling it 'this week'", () => {
    /*
     * The window ends today and runs back seven days; it is not the calendar
     * week. Read on a Wednesday, "this week" would mean three days to the owner
     * and seven to the query — and the comparison beneath it would be measuring
     * a full week against a partial one.
     */
    renderScreen(day({ activityTrend: trend }));
    const strip = screen.getByTestId("today-summary");
    expect(within(strip).getByText("24")).toBeInTheDocument();
    expect(
      within(strip).getByText("Last 7 days · +8 on the previous 7"),
    ).toBeInTheDocument();
    expect(within(strip).queryByText(/this week/i)).toBeNull();
    expect(within(strip).queryByText(/last week/i)).toBeNull();
  });

  it("omits the comparison entirely when there is no earlier window", () => {
    // Never a fabricated "+24": no reading and a zero reading are different
    // facts, and only one of them is a change.
    renderScreen(day({ activityTrend: { ...trend, previousCompleted: null } }));
    const strip = screen.getByTestId("today-summary");
    expect(within(strip).getAllByText("Last 7 days").length).toBeGreaterThan(0);
    expect(within(strip).queryByText(/on the previous/)).toBeNull();
  });

  it("does not count an unmeasured Goal as on track", () => {
    /*
     * The bug this replaces: the count was `!goalNeedsAttention(status)`, and
     * only two of the evaluator's nine statuses need attention — so a Goal that
     * was never told how to measure itself, or has gone a month without a
     * reading, was reported as healthy. With one measured Goal and one
     * unmeasured one the answer cannot be two, whatever the measured one
     * evaluates to.
     */
    renderScreen(day({ goals: [measuredGoal(), unmeasuredGoal()] }));
    const strip = screen.getByTestId("today-summary");
    expect(
      within(strip).getByText("of 2 measurable goals"),
    ).toBeInTheDocument();
    expect(within(strip).queryByText("2")).toBeNull();
  });

  it("renders nothing at all on a day with no real readings", () => {
    renderScreen(day());
    expect(screen.queryByTestId("today-summary")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* TODAY-11 — the command centre                                              */
/* -------------------------------------------------------------------------- */

describe("TODAY-11: the week strip", () => {
  it("draws the owner's whole week, marking only the days that hold something", () => {
    renderScreen(
      day({
        week: weekWith(TODAY, [scheduleEntry("m1", "Standup", "09:30")]),
      }),
    );
    const strip = screen.getByTestId("today-week-strip");
    const days = within(strip).getAllByRole("tab");
    expect(days).toHaveLength(7);
    // The dot is a MARK; the count is in the control's own accessible name, so
    // nothing about which days are busy depends on seeing a colour.
    expect(
      days.filter((node) => node.textContent?.includes("1 scheduled")),
    ).toHaveLength(1);
    expect(
      days.filter((node) => node.textContent?.includes("nothing scheduled")),
    ).toHaveLength(6);
  });

  it("opens on today, and says which day it is showing", () => {
    renderScreen(day({ week: weekWith(TODAY, []) }));
    const selected = within(screen.getByTestId("today-week-strip")).getByRole(
      "tab",
      { selected: true },
    );
    expect(selected).toHaveAttribute("data-date", TODAY);
    expect(
      within(scheduleSection()).getByText("Today · Saturday 8 August"),
    ).toBeInTheDocument();
  });

  it("shows the SELECTED day's items, and never calls that day today", () => {
    const other = "2026-08-06";
    renderScreen(
      day({
        week: weekWith(other, [scheduleEntry("e1", "Dentist", "14:00")]),
      }),
    );
    const panel = scheduleSection();
    // Today is selected first, and today holds nothing.
    expect(within(panel).queryByText("Dentist")).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("today-week-strip")).getByRole("tab", {
        name: /Thursday 6 August/,
      }),
    );
    expect(within(panel).getByText("Dentist")).toBeInTheDocument();
    // The heading names the selected day WITHOUT borrowing the word "Today".
    const heading = panel.querySelector(".dh-today__schedule-date")!;
    expect(heading).toHaveTextContent("Thursday 6 August");
    expect(heading).not.toHaveTextContent(/Today/);
    // Saturday's own button in the strip still says "Today", because Saturday
    // still IS today — the word belongs to the calendar, not to the selection.
    expect(
      within(screen.getByTestId("today-week-strip")).getByRole("tab", {
        name: /^Today · Saturday 8 August/,
      }),
    ).toBeInTheDocument();
  });

  it("is arrow-navigable, with one tab stop for the whole strip", () => {
    renderScreen(day({ week: weekWith(TODAY, []) }));
    const strip = screen.getByTestId("today-week-strip");
    const tabs = within(strip).getAllByRole("tab");
    // Exactly one day is in the tab order: tabbing past the strip costs one
    // stop rather than seven.
    expect(
      tabs.filter((node) => node.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);

    const selected = within(strip).getByRole("tab", { selected: true });
    fireEvent.keyDown(selected, { key: "ArrowLeft" });
    expect(within(strip).getByRole("tab", { selected: true })).toHaveAttribute(
      "data-date",
      "2026-08-07",
    );

    fireEvent.keyDown(within(strip).getByRole("tab", { selected: true }), {
      key: "Home",
    });
    expect(within(strip).getByRole("tab", { selected: true })).toHaveAttribute(
      "data-date",
      "2026-08-03",
    );
  });

  it("offers ONE schedule link, and it goes to the forward agenda", () => {
    renderScreen(day());
    const panel = scheduleSection();
    expect(
      within(panel).getByRole("link", { name: "View full schedule" }),
    ).toHaveAttribute("href", "/today/upcoming");
    /*
     * MOCKUP 5 draws a second link, "View full calendar". There is no calendar
     * view distinct from this one and none is being built (CAL-01 §21, §45), and
     * `/today/schedule` is CAL-03's POST-only resource route with no GET at all —
     * so a second link would either 405 or point at the same place under another
     * name.
     */
    expect(within(panel).queryByRole("link", { name: /calendar/i })).toBeNull();
  });
});

describe("CONVERGE-01 §1: the Insights panel is deleted", () => {
  const trend = {
    days: [
      { dateIso: "2026-08-07", created: 5, completed: 4 },
      { dateIso: TODAY, created: 3, completed: 6 },
    ],
    totalCreated: 30,
    totalCompleted: 24,
    previousCompleted: 16,
  };

  it("is GONE — the ring said a third time what the cards already state", () => {
    /*
     * CONVERGE-01 §1 deletes Insights, and the audit is explicit that it must
     * not be replaced by another decorative widget: its information is already
     * on the page, directly above it. The ring read "24 of 30 captured" over the
     * same seven days, from the same single read, as the two stat cards that say
     * 24 and 30.
     *
     * This asserts the deletion is REAL rather than merely visually hidden, and
     * that nothing has taken the slot: no ring, no donut, no percentage.
     */
    renderScreen(day({ activityTrend: trend }));
    expect(screen.queryByTestId("today-insights")).toBeNull();
    expect(screen.queryByText("Insights")).toBeNull();
    expect(screen.queryByText("24 of 30 captured")).toBeNull();
    expect(screen.queryByText("80%")).toBeNull();
    expect(screen.queryByRole("img", { name: /tasks completed against/ })).toBeNull();

    // The facts themselves stay, in the one place that owns them.
    const summary = screen.getByTestId("today-summary");
    expect(within(summary).getByText("24")).toBeVisible();
    expect(within(summary).getByText("30")).toBeVisible();
  });

  it("draws no focus time and no productivity score", () => {
    renderScreen(day({ activityTrend: trend }));
    // Two of the mockup's four figures do not exist in this product, and this
    // is the line: neither may return under any label.
    expect(screen.queryByText(/Focus time/i)).toBeNull();
    expect(screen.queryByText(/Productivity/i)).toBeNull();
    expect(screen.queryByText(/6h 45m/)).toBeNull();
  });

  it("is absent on a quiet week too — there is no panel to be absent from", () => {
    renderScreen(day());
    expect(screen.queryByTestId("today-insights")).toBeNull();
  });
});

describe("TODAY-11: the Quick capture card", () => {
  it("offers the REAL capture kinds, and no invented ones", () => {
    renderScreen(day());
    const panel = screen.getByTestId("today-capture");
    for (const label of ["Task", "Note", "Diary", "Meeting"]) {
      expect(within(panel).getByRole("button", { name: label })).toBeVisible();
    }
    /*
     * The mockup's other two chips are not capture types at all. "Reminder" has
     * no field and no delivery channel (DEBT-57); "Upload" has no attachments
     * (DEBT-35). Neither is drawn, and neither may appear later without the
     * capability arriving first.
     */
    expect(
      within(panel).queryByRole("button", { name: /reminder/i }),
    ).toBeNull();
    expect(within(panel).queryByRole("button", { name: /upload/i })).toBeNull();
  });

  it("is a control that LOOKS like a field, not a second capture form", () => {
    renderScreen(day());
    // A real input here would be a second capture implementation beside the
    // shared sheet that already owns parsing, validation and error recovery.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-capture-field").tagName).toBe("BUTTON");
    // Its label is real text and is its accessible name.
    expect(
      screen.getByRole("button", { name: "Capture a task, note or idea" }),
    ).toBeVisible();
  });

  it("still has no search field of its own — the shell carries search", () => {
    renderScreen(day());
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("offers '+ Add task' ONCE, at the foot of the plan", () => {
    /*
     * CONVERGE-01 §1 A9 / MOBILE-02 §5. Today had two "+ Add task" buttons —
     * one filled in the page header, one quiet at the foot of the list — and
     * both opened the same shared capture sheet on the same Task panel with the
     * same context. The header's copy was pure duplication and, on a phone, a
     * full-width primary button sitting between the greeting and the first task.
     *
     * The contextual one stays. Global capture is untouched and is NOT this
     * control: the shell's `+`, the `C` shortcut and the phone bottom bar all
     * still reach the same sheet.
     */
    renderScreen(day({ today: [task("a", "Alpha")] }));
    expect(screen.getByTestId("today-plan-add")).toBeVisible();
    expect(screen.queryByTestId("today-add-task")).toBeNull();
    expect(screen.getAllByRole("button", { name: /add task/i })).toHaveLength(1);
  });
});

describe("TODAY-11: the Daily reflection card", () => {
  it("asks the question when the day holds no entry", () => {
    renderScreen(day());
    const panel = screen.getByTestId("today-reflection");
    expect(within(panel).getByText("What went well today?")).toBeVisible();
    expect(within(panel).getByTestId("today-reflection-write")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "View all reflections" }),
    ).toHaveAttribute("href", "/diary");
  });

  it("shows the opening of today's entry, and judges nothing about it", () => {
    renderScreen(
      day({
        reflection: {
          id: "d1",
          title: "A good Saturday",
          excerpt: "Shipped the Q3 plan and walked the long way home.",
          entryTypeLabel: "Reflection",
        },
      }),
    );
    const panel = screen.getByTestId("today-reflection");
    expect(
      within(panel).getByRole("link", { name: "A good Saturday" }),
    ).toHaveAttribute("href", "/diary/d1");
    expect(within(panel).getByText(/Shipped the Q3 plan/)).toBeInTheDocument();
    // A doorway, never a judge: no score, no sentiment, no streak.
    expect(within(panel).queryByText(/great|positive|streak/i)).toBeNull();
    expect(within(panel).queryByText("What went well today?")).toBeNull();
  });
});

describe("TODAY-11: the plan's rows", () => {
  it("never prints a time on a task — a task is a date", () => {
    /*
     * MOCKUP 5 draws "9:00 AM" on every plan row. Verified at the schema:
     * `task_details.due_date` and `scheduled_date` are
     * `CHECK (… GLOB '????-??-??')`. There is no time to print, and printing one
     * would be the plainest possible fabrication on this screen.
     */
    const { container } = renderScreen(
      day({
        today: [task("a", "Alpha")],
        week: weekWith(TODAY, [scheduleEntry("m1", "Standup", "09:30")]),
      }),
    );
    const row = within(timelineSection()).getByText("Alpha").closest("li")!;
    expect(row.querySelector(".dh-day-row__time")).toBeNull();
    expect(row.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    // The time that IS real — a meeting's — is in the Schedule panel beside it.
    expect(container.textContent).toContain("09:30");
  });

  it("ends a row with the parent as a linked pill, naming its kind", () => {
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
    const pill = within(row).getByRole("link", {
      name: "Project: Kitchen renovation",
    });
    expect(pill).toHaveAttribute("href", "/projects/p1");
    expect(pill).toHaveTextContent("Kitchen renovation");
  });

  it("states the day's canonical count beside the plan's heading", () => {
    renderScreen(
      day({
        today: Array.from({ length: 3 }, (_, index) =>
          task(`t${index}`, `Task ${index}`),
        ),
      }),
    );
    expect(within(timelineSection()).getByText("3 tasks")).toBeInTheDocument();
  });
});
