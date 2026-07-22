import {
  RouterProvider,
  createMemoryRouter,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more tasks" }),
    );

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

/**
 * PROJ-01 — reconciling the accumulated pages after a task MUTATION.
 *
 * A task completed / edited / created through the shared Drawer or the create form
 * triggers a revalidation of the record loader (the URL is unchanged). The tab must
 * DROP its accumulated later pages so the fresh, authoritative first page reconciles
 * the change (no stale row lingers) — while a drawer-only navigation must NOT reset,
 * so pagination and drawer state stay independent.
 *
 * The harness drives those transitions through a REAL record loader (so loaderData
 * and location update atomically, exactly as React Router does in the app): the
 * record loader returns a fresh copy of a mutable page (a new array identity every
 * run, as the real projection does). "simulate-mutation" submits to an action (as
 * the shared Task Drawer / create form do), whose fetcher submission reliably
 * auto-revalidates the record loader with the URL UNCHANGED; "open-drawer" performs
 * a `?drawer=` navigation (loader re-runs, URL changed).
 */
type ControllablePage = {
  tasks: readonly SerializedProjectTask[];
  cursor: string | null;
};

function renderControllable(props: {
  initial: ControllablePage;
  mutated: ControllablePage;
  tasksLoader: (request: Request) => unknown;
}) {
  // Mutable source the record loader reads; a fresh copy is returned each run.
  const source = { current: props.initial };

  function RecordHarness() {
    const data = useLoaderData() as ControllablePage;
    const navigate = useNavigate();
    // A mutation submits to an action (as the shared Task Drawer / create form do);
    // a fetcher submission reliably auto-revalidates this record loader.
    const mutateFetcher = useFetcher();
    return (
      <DrawerProvider renderDrawer={() => null}>
        <button
          type="button"
          onClick={() =>
            mutateFetcher.submit(
              {},
              { method: "post", action: "/projects/p1/mutate" },
            )
          }
        >
          simulate-mutation
        </button>
        <button type="button" onClick={() => navigate("?drawer=task:x")}>
          open-drawer
        </button>
        <ProjectTasksTab
          projectId="p1"
          tasks={data.tasks}
          nextCursor={data.cursor}
          taskState="open"
          todayIso="2026-07-21"
        />
      </DrawerProvider>
    );
  }

  const router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId",
        // A fresh array identity every run — as the real read projection produces.
        loader: () => ({
          tasks: [...source.current.tasks],
          cursor: source.current.cursor,
        }),
        Component: RecordHarness,
      },
      {
        path: "/projects/:projectId/tasks",
        loader: ({ request }) => props.tasksLoader(request),
      },
      {
        // The mutation action: applies the change, then RR auto-revalidates.
        path: "/projects/:projectId/mutate",
        action: () => {
          source.current = props.mutated;
          return { ok: true };
        },
      },
    ],
    { initialEntries: ["/projects/p1"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Project Tasks tab — reconcile after a mutation", () => {
  const secondPage = (request: Request) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor === "C1") {
      return {
        tasks: [
          task({ id: "t2", title: "Bravo task" }),
          task({ id: "t3", title: "Charlie task" }),
        ],
        nextCursor: null,
      };
    }
    return { tasks: [], nextCursor: null };
  };

  it("drops a completed page-two task from Open after the revalidation (steps 1–4)", async () => {
    const router = renderControllable({
      // 1) A first page with more to load; page two contains t2/t3.
      initial: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: "C1",
      },
      // 3–4) After completing t2, the fresh Open first page no longer contains it.
      mutated: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: null,
      },
      tasksLoader: secondPage,
    });

    // 2) Load page two and open a page-two task there.
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more tasks" }),
    );
    await screen.findByText("Bravo task");
    fireEvent.click(screen.getByRole("button", { name: "open-drawer" }));
    // Let the drawer navigation settle; the drawer-only nav keeps the loaded pages.
    await waitFor(() =>
      expect(router.state.location.search).toBe("?drawer=task:x"),
    );
    expect(screen.getByText("Bravo task")).toBeInTheDocument();

    // 3) Complete it → 4) it disappears from Open (the stale page is reconciled away).
    fireEvent.click(screen.getByRole("button", { name: "simulate-mutation" }));
    await waitFor(() =>
      expect(screen.queryByText("Bravo task")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Charlie task")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    // The affordance is gone because the reconciled page is the last one.
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).not.toBeInTheDocument();
  });

  it("reflects an edited page-two task after the revalidation (step 5)", async () => {
    renderControllable({
      initial: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: "C1",
      },
      // The edit renamed t2; the fresh page carries the new title (t2 now on page 1).
      mutated: {
        tasks: [
          task({ id: "t1", title: "Alpha task" }),
          task({ id: "t2", title: "Bravo task (edited)" }),
        ],
        cursor: null,
      },
      tasksLoader: secondPage,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more tasks" }),
    );
    await screen.findByText("Bravo task");

    fireEvent.click(screen.getByRole("button", { name: "simulate-mutation" }));
    // The stale "Bravo task" row is replaced by the reconciled, edited title.
    await screen.findByText("Bravo task (edited)");
    expect(screen.queryByText("Bravo task")).not.toBeInTheDocument();
  });

  it("surfaces a newly created task after all pages were loaded (step 6)", async () => {
    renderControllable({
      initial: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: "C1",
      },
      // A create revalidation returns the fresh page including the new task.
      mutated: {
        tasks: [
          task({ id: "t1", title: "Alpha task" }),
          task({ id: "t2", title: "Bravo task" }),
          task({ id: "t3", title: "Charlie task" }),
          task({ id: "t4", title: "Delta task (new)" }),
        ],
        cursor: null,
      },
      tasksLoader: secondPage,
    });

    // Load ALL pages first.
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more tasks" }),
    );
    await screen.findByText("Charlie task");
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).not.toBeInTheDocument();

    // Create a task → the new task becomes visible via the reconciled page.
    fireEvent.click(screen.getByRole("button", { name: "simulate-mutation" }));
    await screen.findByText("Delta task (new)");
    // No duplicates of the carried-over rows.
    const list = screen.getByRole("list", { name: "Project tasks" });
    expect(within(list).getAllByText("Alpha task")).toHaveLength(1);
  });

  it("keeps accumulated pages across a drawer-only navigation (no reset)", async () => {
    renderControllable({
      initial: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: "C1",
      },
      mutated: {
        tasks: [task({ id: "t1", title: "Alpha task" })],
        cursor: null,
      },
      tasksLoader: secondPage,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more tasks" }),
    );
    await screen.findByText("Bravo task");

    // Opening the drawer (a `?drawer=` navigation) must NOT reset the loaded pages.
    fireEvent.click(screen.getByRole("button", { name: "open-drawer" }));
    // Give any (incorrect) reset a chance to flush, then assert the pages survived.
    await screen.findByText("Charlie task");
    expect(screen.getByText("Bravo task")).toBeInTheDocument();
  });
});
