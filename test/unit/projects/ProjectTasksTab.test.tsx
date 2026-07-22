import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectTasksTab } from "~/modules/projects/ProjectTasksTab";
import type { SerializedProjectTask } from "~/modules/projects/project-view";
import { DrawerProvider } from "~/shared/drawer";

/**
 * PROJ-01 — the project Tasks tab as behaviour: it appends the next keyset page
 * behind "Load more" WITHOUT navigating (so the record route's `?drawer=` state is
 * never disturbed), de-duplicates across a page boundary, and stops when the cursor
 * is exhausted.
 */

function task(
  over: Partial<SerializedProjectTask> = {},
): SerializedProjectTask {
  return {
    id: "t1",
    title: "Alpha task",
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    waiting: null,
    ...over,
  };
}

function renderTab(
  props: {
    tasks: readonly SerializedProjectTask[];
    nextCursor: string | null;
  },
  tasksLoader: (request: Request) => unknown,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId",
        element: (
          <DrawerProvider renderDrawer={() => null}>
            <ProjectTasksTab
              projectId="p1"
              tasks={props.tasks}
              nextCursor={props.nextCursor}
              taskState="open"
              todayIso="2026-07-21"
            />
          </DrawerProvider>
        ),
      },
      {
        path: "/projects/:projectId/tasks",
        loader: ({ request }) => tasksLoader(request),
      },
    ],
    { initialEntries: ["/projects/p1"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Project Tasks tab pagination", () => {
  it("appends the next task page without duplicating cards, then exhausts", async () => {
    const router = renderTab(
      {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        nextCursor: "TCURSOR_1",
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === "TCURSOR_1") {
          return {
            // Overlaps t1 to prove de-duplication at the boundary.
            tasks: [
              task({ id: "t1", title: "Alpha task" }),
              task({ id: "t2", title: "Bravo task" }),
            ],
            nextCursor: null,
          };
        }
        return { tasks: [], nextCursor: null };
      },
    );

    expect(screen.getByText("Alpha task")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more tasks" }));

    await screen.findByText("Bravo task");

    const list = screen.getByRole("list", { name: "Project tasks" });
    expect(within(list).getAllByText("Alpha task")).toHaveLength(1);
    // The URL never changed — loading more did not navigate away from the record.
    expect(router.state.location.pathname).toBe("/projects/p1");
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).not.toBeInTheDocument();
  });

  it("shows no affordance when the first page is already the last", () => {
    renderTab(
      { tasks: [task({ id: "t1", title: "Only task" })], nextCursor: null },
      () => ({ tasks: [], nextCursor: null }),
    );
    expect(screen.getByText("Only task")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).not.toBeInTheDocument();
  });
});
