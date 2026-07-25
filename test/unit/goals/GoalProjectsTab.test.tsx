import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GoalProjectsTab } from "~/modules/goals/GoalProjectsTab";
import type { SerializedGoalProjectItem } from "~/modules/goals/goal-view";
import { DrawerProvider } from "~/shared/drawer";

/**
 * DEBT-22 — the Goal record's Projects tab as behaviour: it reaches EVERY
 * contributing Project through a real "Load more" that appends the next keyset page
 * WITHOUT navigating (so the record's tab/drawer state is untouched), de-duplicates
 * a Project sitting on a page boundary, and retires the affordance when exhausted.
 */

function project(
  over: Partial<SerializedGoalProjectItem> = {},
): SerializedGoalProjectItem {
  return {
    id: "p1",
    title: "Alpha project",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    taskTotal: 0,
    taskCompleted: 0,
    ...over,
  };
}

function renderTab(
  props: {
    projects: readonly SerializedGoalProjectItem[];
    nextCursor: string | null;
  },
  projectsLoader: (request: Request) => unknown = () => ({
    projects: [],
    nextCursor: null,
  }),
) {
  const router = createMemoryRouter(
    [
      {
        path: "/goals/:goalId",
        element: (
          <DrawerProvider renderDrawer={() => null}>
            <GoalProjectsTab
              goalId="g1"
              projects={props.projects}
              nextCursor={props.nextCursor}
              onOpenProject={vi.fn()}
            />
          </DrawerProvider>
        ),
      },
      {
        path: "/goals/:goalId/projects",
        loader: ({ request }) => projectsLoader(request),
      },
    ],
    { initialEntries: ["/goals/g1"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Goal Projects tab pagination (DEBT-22)", () => {
  it("appends the next Project page without duplicating cards, then exhausts", async () => {
    const router = renderTab(
      {
        projects: [project({ id: "p1", title: "Alpha project" })],
        nextCursor: "GCURSOR_1",
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === "GCURSOR_1") {
          return {
            // Overlaps p1 to prove de-duplication at the boundary.
            projects: [
              project({ id: "p1", title: "Alpha project" }),
              project({ id: "p2", title: "Bravo project" }),
            ],
            nextCursor: null,
          };
        }
        return { projects: [], nextCursor: null };
      },
    );

    expect(screen.getByText("Alpha project")).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more Projects" }),
    );

    await screen.findByText("Bravo project");

    const list = screen.getByRole("list", { name: "Goal Projects" });
    expect(within(list).getAllByText("Alpha project")).toHaveLength(1);
    // The URL never changed — loading more did not navigate away from the record.
    expect(router.state.location.pathname).toBe("/goals/g1");
    expect(
      screen.queryByRole("button", { name: "Load more Projects" }),
    ).not.toBeInTheDocument();
  });

  it("shows no affordance when the first page is already the last", () => {
    renderTab({
      projects: [project({ id: "p1", title: "Only project" })],
      nextCursor: null,
    });
    expect(screen.getByText("Only project")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more Projects" }),
    ).not.toBeInTheDocument();
  });

  it("shows the honest empty state (complete result empty, not just this page)", () => {
    renderTab({ projects: [], nextCursor: null });
    expect(
      screen.getByText("No Projects advancing this Goal"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more Projects" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a calm retry when a page load fails", async () => {
    renderTab(
      {
        projects: [project({ id: "p1", title: "Alpha project" })],
        nextCursor: "GCURSOR_1",
      },
      // A 4xx-style body without `projects` → treated as a retryable failure.
      () => ({ error: "invalid_cursor" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more Projects" }),
    );
    // The affordance stays reachable to retry (and the loaded cards remain).
    expect(await screen.findByText("Alpha project")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /Load more Projects|Try again/,
      }),
    ).toBeInTheDocument();
  });
});
