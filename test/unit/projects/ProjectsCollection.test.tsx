import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

import { ProjectsCollectionView } from "~/modules/projects/ProjectsCollection";
import type { SerializedProjectListItem } from "~/modules/projects/project-view";

import { stubHealth } from "../../support/project-health";

/**
 * PROJ-01 — the Projects collection as behaviour: cards render with Area/Goal and
 * roll-up progress, the state segment is present, the empty vs filtered-empty
 * states are calm and distinct, and the keyset "Load more" affordance appends the
 * next page without duplicating cards or claiming a false total.
 */

type LoaderData = {
  projects: readonly SerializedProjectListItem[];
  nextCursor: string | null;
  parentOptions: readonly { value: string; label: string }[];
  parentOptionsFailed?: boolean;
  state: "open" | "completed" | "archived" | "all";
  failed: boolean;
};

function project(
  over: Partial<SerializedProjectListItem> = {},
): SerializedProjectListItem {
  return {
    id: "p1",
    title: "DalyHub V2",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    areaColourRank: 0,
    iconKey: null,
    taskTotal: 4,
    taskCompleted: 1,
    health: stubHealth({ taskTotal: 4, taskCompleted: 1 }),
    healthVisible: true,
    ...over,
  };
}

function renderCollection(
  data: LoaderData,
  loader?: (request: Request) => unknown,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/projects",
        ...(loader ? { loader: ({ request }) => loader(request) } : {}),
        element: (
          <ProjectsCollectionView
            projects={data.projects}
            nextCursor={data.nextCursor}
            parentOptions={data.parentOptions as never}
            parentOptionsFailed={data.parentOptionsFailed}
            state={data.state}
            failed={data.failed}
          />
        ),
      },
    ],
    { initialEntries: ["/projects"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("Projects collection", () => {
  it("renders project cards with Area context and roll-up progress", () => {
    renderCollection({
      projects: [
        project(),
        project({
          id: "p2",
          title: "Half-marathon plan",
          goal: { kind: "goal", id: "g1", title: "Run a half" },
          taskTotal: 0,
          taskCompleted: 0,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    expect(screen.getByText("DalyHub V2")).toBeInTheDocument();
    expect(screen.getAllByText("Career").length).toBeGreaterThan(0);
    // The empty project shows "No tasks yet" rather than a 0% bar.
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    // The subtitle reflects the count.
    expect(screen.getByText("2 projects")).toBeInTheDocument();
    // The state segment and the New Project affordance are present.
    expect(
      screen.getByRole("group", { name: "Filter projects by state" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New Project").length).toBeGreaterThan(0);
  });

  it("keeps project cards as honest links with no mobile swipe accelerator", () => {
    const { container } = renderCollection({
      projects: [
        project({
          id: "long",
          title:
            "A very long translated-like project title that should wrap without needing a gesture",
          area: {
            kind: "area",
            id: "a-long",
            title:
              "An unusually long Area name that still belongs in card context",
          },
          goal: {
            kind: "goal",
            id: "g-long",
            title:
              "A deeply specific Goal title that is allowed to wrap across lines",
          },
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    const card = screen.getByRole("article", {
      name: /A very long translated-like project title/,
    });
    expect(
      within(card).getByRole("link", {
        name: /Open A very long translated-like project title/,
      }),
    ).toHaveAttribute("href", "/projects/long");
    expect(
      within(card).queryByRole("button", { name: /archive|complete/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".dh-card-swipe")).toBeNull();
  });

  it("shows the derived health state and its primary reason on a card", () => {
    renderCollection({
      projects: [
        project({
          id: "at-risk",
          title: "Overdue project",
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByText("At risk")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("2 tasks past their due date")).toBeInTheDocument();
  });

  it("does not falsely label a completed project as actively at risk", () => {
    renderCollection({
      projects: [
        project({
          id: "done",
          title: "Shipped",
          completedAt: "2026-07-20T00:00:00.000Z",
          taskTotal: 4,
          taskCompleted: 4,
          healthVisible: false,
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 4,
            completedAt: new Date("2026-07-20T00:00:00.000Z"),
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
    // A completed project never shows an active-work health pill (PROJ-05 §8).
    expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
  });

  it("hides the Health metadata for Planned, On-hold and Archived cards", () => {
    renderCollection({
      projects: [
        project({ id: "planned", title: "Planned", healthVisible: false }),
        project({ id: "on-hold", title: "On hold", healthVisible: false }),
        project({
          id: "archived",
          title: "Archived one",
          archivedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
  });

  it("carries ONE status treatment, never a lifecycle chip beside a health chip", () => {
    renderCollection({
      projects: [
        project({
          id: "at-risk",
          title: "Overdue project",
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Overdue project" });
    // Exactly one pill on the card, and it is the health state — the workflow
    // word it replaces must not also be present.
    expect(card.querySelectorAll(".dh-pill")).toHaveLength(1);
    expect(within(card).getByText("At risk")).toBeInTheDocument();
    expect(within(card).queryByText("Active")).not.toBeInTheDocument();
  });

  it("keeps the workflow word when health has nothing to say", () => {
    renderCollection({
      projects: [
        project({
          id: "healthy",
          title: "Healthy project",
          health: stubHealth({ taskTotal: 4, taskCompleted: 2 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Healthy project" });
    expect(card.querySelectorAll(".dh-pill")).toHaveLength(1);
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  it("states progress once, with the bar and the text agreeing", () => {
    renderCollection({
      projects: [
        project({
          id: "partial",
          title: "Partial",
          taskTotal: 4,
          taskCompleted: 1,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Partial" });
    const bar = within(card).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    // The accessible value says more than the visible "25%", and both are
    // derived from the same completed/total pair.
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      "25% — 1 of 4 tasks complete",
    );
    expect(within(card).getByText("25%")).toBeInTheDocument();
    // DS-16 — the run-on "1 of 4 tasks complete" sentence became a compact fact
    // group. The complete phrasing survives where it is genuinely needed: on the
    // progress bar's `aria-valuetext`, which is what assistive tech reads.
    expect(within(card).getByText("3")).toBeInTheDocument();
    expect(within(card).getByText("open tasks")).toBeInTheDocument();
    expect(within(card).getByText("done")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "25% — 1 of 4 tasks complete",
    );
  });

  it("never implies 0% progress for a Project with no tasks", () => {
    renderCollection({
      projects: [
        project({
          id: "empty",
          title: "Nothing planned",
          taskTotal: 0,
          taskCompleted: 0,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Nothing planned" });
    expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(card).getByText("No tasks yet")).toBeInTheDocument();
  });

  it("shows a fully completed roll-up accurately", () => {
    renderCollection({
      projects: [
        project({
          id: "done",
          title: "All done",
          taskTotal: 6,
          taskCompleted: 6,
          completedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
          health: stubHealth({ taskTotal: 6, taskCompleted: 6 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "All done" });
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    // Nothing outstanding: the "open tasks" fact is OMITTED rather than
    // rendered as "0 open tasks", and the completed count carries the story.
    expect(within(card).queryByText("open tasks")).not.toBeInTheDocument();
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).getByText("done")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "100% — 6 of 6 tasks complete",
    );
  });

  it("names the Area first so it stays discoverable, then the Goal", () => {
    renderCollection({
      projects: [
        project({
          id: "via-goal",
          title: "Goal-backed",
          area: { kind: "area", id: "a1", title: "DalyHub V2" },
          goal: { kind: "goal", id: "g1", title: "Launch the site" },
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Goal-backed" });
    expect(
      within(card).getByText("DalyHub V2 · Launch the site"),
    ).toBeInTheDocument();
  });

  it("renders a chosen icon on the Area's accent, and the default without one", () => {
    const { container } = renderCollection({
      projects: [
        project({
          id: "with-icon",
          title: "Has icon",
          iconKey: "travel",
          areaColourRank: 2,
        }),
        project({
          id: "no-icon",
          title: "No icon",
          iconKey: null,
          areaColourRank: null,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(container.querySelector('[data-icon-key="travel"]')).not.toBeNull();
    // Rank 2 -> accent 3 (0-based rank, 1-based accent).
    expect(
      container.querySelector('.dh-accent-icon[data-accent="3"]'),
    ).not.toBeNull();
    // No Area means the neutral container, never an invented colour.
    const plain = screen
      .getByRole("article", { name: "No icon" })
      .querySelector(".dh-accent-icon");
    expect(plain?.getAttribute("data-accent")).toBeNull();
  });

  it("derives the muted treatment from the archived FACT, not the chip's word", () => {
    renderCollection({
      projects: [
        project({
          id: "archived",
          title: "Put away",
          archivedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
        }),
        project({ id: "live", title: "Still going" }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByRole("article", { name: "Put away" })).toHaveClass(
      "dh-ecard--muted",
    );
    expect(
      screen.getByRole("article", { name: "Still going" }),
    ).not.toHaveClass("dh-ecard--muted");
  });

  it("gives each lifecycle and health state exactly one chip", () => {
    const cases = [
      {
        id: "planned",
        title: "Planned one",
        over: { status: "planned" as const, healthVisible: false },
        label: "Planned",
      },
      {
        id: "onhold",
        title: "On-hold one",
        over: { status: "on_hold" as const, healthVisible: false },
        label: "On hold",
      },
      { id: "active", title: "Active one", over: {}, label: "Active" },
      {
        id: "completed",
        title: "Completed one",
        over: {
          completedAt: "2026-07-20T00:00:00.000Z",
          healthVisible: false,
        },
        label: "Completed",
      },
      {
        id: "archived",
        title: "Archived one",
        over: { archivedAt: "2026-07-21T00:00:00.000Z", healthVisible: false },
        label: "Archived",
      },
      {
        id: "warning",
        title: "Warning one",
        over: {
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        },
        label: "At risk",
      },
    ];

    renderCollection({
      projects: cases.map((c) =>
        project({ id: c.id, title: c.title, ...c.over }),
      ),
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    for (const c of cases) {
      const card = screen.getByRole("article", { name: c.title });
      // Exactly ONE status treatment per card, and it says the right thing.
      expect(card.querySelectorAll(".dh-pill")).toHaveLength(1);
      expect(within(card).getByText(c.label)).toBeInTheDocument();
    }
  });

  it("navigates from the title link through the router, not a full page load", async () => {
    /*
     * Only the LINK's own activation can be proven here. Whether a click on the
     * status chip or the metadata row reaches that link is CSS hit-testing —
     * stacking order against the link's `::after` overlay — which jsdom does
     * not do at all: `fireEvent.click` dispatches on the node you name, so this
     * file would report a pass whatever the z-index said. That contract is
     * asserted in the browser, in `e2e/projects.spec.ts`.
     */
    const seen: string[] = [];
    const router = createMemoryRouter(
      [
        {
          path: "/projects",
          element: (
            <ProjectsCollectionView
              projects={[project({ id: "p1", title: "Website relaunch" })]}
              nextCursor={null}
              parentOptions={[]}
              state="all"
              failed={false}
            />
          ),
        },
        {
          path: "/projects/:id",
          element: <p>record</p>,
          loader: ({ params }) => {
            seen.push(params.id ?? "");
            return null;
          },
        },
      ],
      { initialEntries: ["/projects"] },
    );
    render(
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>,
    );

    const card = screen.getByRole("article", { name: "Website relaunch" });
    const link = within(card).getByRole("link", {
      name: "Open Website relaunch",
    });
    // A real href, so command-click, middle-click and copy-link-address all
    // behave; the router handles the ordinary click.
    expect(link).toHaveAttribute("href", "/projects/p1");
    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(seen).toEqual(["p1"]));
  });

  it("shows a genuinely-empty state when there are no projects at all", () => {
    renderCollection({
      projects: [],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByText("No Projects yet")).toBeInTheDocument();
  });

  it("distinguishes a filtered-empty state from genuinely empty", () => {
    renderCollection({
      projects: [],
      nextCursor: null,
      parentOptions: [],
      state: "open",
      failed: false,
    });
    expect(screen.getByText("No open projects")).toBeInTheDocument();
  });

  describe("Archived collection (PROJ-05 §7)", () => {
    it("offers Archived as a fourth, dedicated segment (Open/Completed/All unchanged)", () => {
      renderCollection({
        projects: [],
        nextCursor: null,
        parentOptions: [],
        state: "all",
        failed: false,
      });
      const group = screen.getByRole("group", {
        name: "Filter projects by state",
      });
      expect(
        within(group)
          .getAllByRole("link")
          .map((link) => link.textContent?.trim()),
      ).toEqual(["All", "Open", "Completed", "Archived"]);
    });

    it("renders archived cards with the Archived state and no health metadata", () => {
      renderCollection({
        projects: [
          project({
            id: "archived-1",
            title: "Sunset project",
            archivedAt: "2026-07-21T00:00:00.000Z",
            healthVisible: false,
          }),
        ],
        nextCursor: null,
        parentOptions: [],
        state: "archived",
        failed: false,
      });
      expect(screen.getByText("Sunset project")).toBeInTheDocument();
      expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
      expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
      // A real link to the canonical record, like every other card.
      const link = screen.getByRole("link", { name: "Open Sunset project" });
      expect(link).toHaveAttribute("href", "/projects/archived-1");
    });

    it("shows a distinct, honest empty state for the Archived filter with no 'New Project' CTA", () => {
      renderCollection({
        projects: [],
        nextCursor: null,
        parentOptions: [],
        state: "archived",
        failed: false,
      });
      expect(screen.getByText("No archived projects")).toBeInTheDocument();
      // Only the persistent header "New Project" trigger renders — the
      // Archived empty state deliberately omits a SECOND create CTA (creating
      // a project doesn't address "no archived projects").
      expect(screen.getAllByText("New Project")).toHaveLength(1);
    });
  });

  it("opens a project via a real link (accessible, not a div onClick)", () => {
    renderCollection({
      projects: [project()],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const link = screen.getByRole("link", { name: "Open DalyHub V2" });
    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  it("distinguishes a parent-options load failure from a confirmed-empty workspace in the create form", () => {
    renderCollection({
      projects: [project()],
      nextCursor: null,
      parentOptions: [],
      parentOptionsFailed: true,
      state: "all",
      failed: false,
    });

    fireEvent.click(screen.getAllByText("New Project")[0]!);

    // The load-failure message renders, never the false "no Areas or Goals
    // exist" domain claim a generic empty-array fallback would otherwise show.
    expect(
      screen.getByText("Couldn’t load Areas and Goals."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/doesn.t have either yet/),
    ).not.toBeInTheDocument();
  });

  it("does not claim a total, then appends the next keyset page without duplicates", async () => {
    renderCollection(
      {
        projects: [project({ id: "p1", title: "Alpha" })],
        nextCursor: "CURSOR_1",
        parentOptions: [],
        state: "all",
        failed: false,
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        // The second page. It overlaps p1 defensively to prove de-duplication.
        if (cursor === "CURSOR_1") {
          return {
            projects: [
              project({ id: "p1", title: "Alpha" }),
              project({ id: "p2", title: "Bravo" }),
            ],
            nextCursor: null,
            parentOptions: [],
            state: "all",
            failed: false,
          };
        }
        return {
          projects: [],
          nextCursor: null,
          parentOptions: [],
          state: "all",
          failed: false,
        };
      },
    );

    // While a page remains, the subtitle must NOT present the loaded count as total.
    await screen.findByText("1 project loaded");
    expect(screen.queryByText("1 project")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more projects" }));

    await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());

    // p1 (Alpha) appears exactly once despite the overlapping page boundary.
    const list = screen.getByRole("list", { name: "Projects" });
    expect(within(list).getAllByText("Alpha")).toHaveLength(1);
    // The cursor is exhausted, so the affordance is gone and the count is final.
    expect(
      screen.queryByRole("button", { name: "Load more projects" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 projects")).toBeInTheDocument();
  });

  it("shows a retryable error when a page fails to load", async () => {
    let failedOnce = false;
    renderCollection(
      {
        projects: [project({ id: "p1", title: "Alpha" })],
        nextCursor: "CURSOR_1",
        parentOptions: [],
        state: "all",
        failed: false,
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        // Ignore the initial (cursor-less) route navigation entirely.
        if (cursor !== "CURSOR_1") {
          return {
            projects: [],
            nextCursor: null,
            parentOptions: [],
            state: "all",
            failed: false,
          };
        }
        // Fail the first load-more, succeed on retry.
        if (!failedOnce) {
          failedOnce = true;
          return {
            projects: [],
            nextCursor: "CURSOR_1",
            parentOptions: [],
            state: "all",
            failed: true,
          };
        }
        return {
          projects: [project({ id: "p2", title: "Bravo" })],
          nextCursor: null,
          parentOptions: [],
          state: "all",
          failed: false,
        };
      },
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more projects" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/We couldn.t load more\. Please try again\./),
      ).toBeInTheDocument(),
    );

    // The same control retries and recovers.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());
  });
});

/**
 * DS-16 — the Projects gallery, on the SAME shared grid foundation as Areas.
 *
 * The most important assertion in this block is the sparse one: a Project with
 * nothing filled in must still produce a polished card, because that is the
 * state a workspace is in for its first week.
 */
describe("Projects gallery grid (DS-16)", () => {
  it("renders the shared gallery grid, not a second implementation", () => {
    const { container } = renderCollection({
      projects: [project(), project({ id: "p2", title: "Second" })],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const grid = container.querySelector(".dh-ecard-grid");
    expect(grid?.tagName).toBe("UL");
    expect(grid?.getAttribute("aria-label")).toBe("Projects");
    expect(grid?.querySelectorAll(":scope > li").length).toBe(2);
  });

  it("stays polished for a Project with no Area, no tasks and no health", () => {
    renderCollection({
      projects: [
        project({
          id: "sparse",
          title: "Just started",
          area: null,
          goal: null,
          areaColourRank: null,
          taskTotal: 0,
          taskCompleted: 0,
          healthVisible: false,
          health: stubHealth({ taskTotal: 0, taskCompleted: 0 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Just started" });
    // Absent values are ABSENT — no empty placeholder rows, no 0% bar.
    expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      within(card).queryByTestId("entity-card-fact"),
    ).not.toBeInTheDocument();
    expect(within(card).getByText("No tasks yet")).toBeInTheDocument();
    // And it is still a complete, navigable card.
    expect(
      within(card).getByRole("link", { name: "Open Just started" }),
    ).toHaveAttribute("href", "/projects/sparse");
  });

  it("offers lifecycle actions from the card without navigating it", () => {
    renderCollection({
      projects: [project({ title: "DalyHub V2" })],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "DalyHub V2" });
    fireEvent.click(
      within(card).getByRole("button", { name: "More actions for DalyHub V2" }),
    );
    expect(
      within(card).getByRole("menuitem", { name: /Archive/ }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Open DalyHub V2" }),
    ).toHaveAttribute("href", "/projects/p1");
  });

  it("offers Restore rather than Archive on an archived Project", () => {
    renderCollection({
      projects: [
        project({
          id: "arch",
          title: "Old work",
          archivedAt: "2026-07-01T00:00:00.000Z",
          healthVisible: false,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "archived",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Old work" });
    fireEvent.click(
      within(card).getByRole("button", { name: "More actions for Old work" }),
    );
    expect(
      within(card).getByRole("menuitem", { name: /Restore/ }),
    ).toBeInTheDocument();
    expect(
      within(card).queryByRole("menuitem", { name: /^Archive/ }),
    ).not.toBeInTheDocument();
  });
});
