import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  state: "open" | "completed" | "all";
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
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    taskTotal: 4,
    taskCompleted: 1,
    health: stubHealth({ taskTotal: 4, taskCompleted: 1 }),
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
            state={data.state}
            failed={data.failed}
          />
        ),
      },
    ],
    { initialEntries: ["/projects"] },
  );
  return render(<RouterProvider router={router} />);
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
    // The state segment and the New project affordance are present.
    expect(
      screen.getByRole("group", { name: "Filter projects by state" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New project").length).toBeGreaterThan(0);
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
  });

  it("shows a genuinely-empty state when there are no projects at all", () => {
    renderCollection({
      projects: [],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
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
    await screen.findByText("1 projects loaded");
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
