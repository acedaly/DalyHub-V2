/**
 * The Project record's Tasks tab, as behaviour.
 *
 * V2.8 CONV-01 — the tab renders the SHARED `TaskRow` inside the shared
 * `TaskList`, hosted by the shared `useTaskSurfaceActions`, selected through the
 * shared reducer and acted on in bulk through the shared bar. What this file
 * proves, in order:
 *
 *   1. the rows are the shared row's anatomy — and carry NO drag grip, because
 *      the Project scope draws no destination and stores no order (DEBT-188);
 *   2. the facts the old Card path lacked appear with no per-surface code: the
 *      recurrence signal, the parent mark, the checklist figure;
 *   3. completion is ADR-086's optimistic patch through the canonical record
 *      route — painted before the answer, rolled back on a refusal, announced
 *      exactly once on success;
 *   4. three selected rows and one bulk action are ONE request to `/tasks/bulk`
 *      carrying three ids — the tab has no private bulk path;
 *   5. an archived Project's rows are the row's own read-only form;
 *   6. everything PROJ-01 already proved about pagination and reconciliation
 *      still holds on the new anatomy.
 *
 * The canonical posters are mocked at the module boundary, exactly as
 * `TodayScreen.test.tsx` mocks them, so each journey can decide the server's
 * answer; nothing about the tab's own reconciliation is stubbed.
 */

import type { ReactElement } from "react";
import {
  RouterProvider,
  createMemoryRouter,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTasksTab } from "~/modules/projects/ProjectTasksTab";
import type { SerializedProjectTask } from "~/modules/projects/project-view";
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import {
  postTaskRecordActionOffline,
  postTaskBulkAction,
} from "~/shared/task-record/task-inline-edit";

vi.mock("~/shared/task-record/task-inline-edit", () => ({
  postTaskRecordActionOffline: vi.fn(async () => ({
    kind: "server" as const,
    data: { kind: "completion" as const, ok: true as const },
  })),
  postTaskRecordAction: vi.fn(async () => ({
    kind: "update" as const,
    status: "success" as const,
  })),
  postTaskBulkAction: vi.fn(async () => ({ ok: true as const, changed: 1 })),
  saveTaskRecordField: vi.fn(async () => ({ ok: true as const })),
  saveTaskBulkField: vi.fn(async () => ({ ok: true as const })),
}));

const TODAY = "2026-07-21";

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
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    recurrence: null,
    parent: { kind: "project", id: "p1", title: "Kitchen fit-out" },
    waiting: null,
    ...over,
  };
}

/** The frame the record route provides, plus a `/tasks/bulk` action to receive the bar's POST. */
function frame(
  element: ReactElement,
  extraRoutes: Parameters<typeof createMemoryRouter>[0] = [],
  bulk?: (form: FormData) => unknown,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId",
        element: (
          <FeedbackProvider>
            <DrawerProvider renderDrawer={() => null}>{element}</DrawerProvider>
          </FeedbackProvider>
        ),
      },
      {
        path: "/tasks/bulk",
        action: async ({ request }) =>
          bulk?.(await request.formData()) ?? {
            kind: "bulk",
            ok: true,
            changed: 0,
            unchanged: 0,
          },
      },
      ...extraRoutes,
    ],
    { initialEntries: ["/projects/p1"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function renderTab(
  props: {
    tasks: readonly SerializedProjectTask[];
    nextCursor: string | null;
    archived?: boolean;
    taskState?: "open" | "completed" | "all";
  },
  tasksLoader: (request: Request) => unknown = () => ({
    tasks: [],
    nextCursor: null,
  }),
  bulk?: (form: FormData) => unknown,
) {
  return frame(
    <ProjectTasksTab
      projectId="p1"
      tasks={props.tasks}
      nextCursor={props.nextCursor}
      parents={[
        { id: "p1", kind: "project", title: "Kitchen fit-out" },
        { id: "p2", kind: "project", title: "Bathroom" },
      ]}
      taskState={props.taskState ?? "open"}
      todayIso={TODAY}
      archived={props.archived}
    />,
    [
      {
        path: "/projects/:projectId/tasks",
        loader: ({ request }) => tasksLoader(request),
      },
    ],
    bulk,
  );
}

beforeEach(() => {
  vi.mocked(postTaskRecordActionOffline).mockClear();
  vi.mocked(postTaskBulkAction).mockClear();
});

describe("CONV-01 — the tab renders the shared Task row", () => {
  it("draws every task as the shared row, inside the shared list, with no drag grip", () => {
    renderTab({
      tasks: [
        task({ id: "t1", title: "Alpha task" }),
        task({ id: "t2", title: "Bravo task" }),
      ],
      nextCursor: null,
    });
    const list = screen.getByRole("list", { name: "Project tasks" });
    expect(list.closest(".dh-tasklist")).not.toBeNull();
    const rows = within(list).getAllByTestId("task-row");
    expect(rows).toHaveLength(2);
    // The old anatomy is gone: no Card, and no grip — the Project scope draws no
    // destination and stores no order, so the row's `dragHandle` slot is unpassed.
    expect(document.querySelector(".dh-card")).toBeNull();
    expect(document.querySelector("[data-dh-drag-item]")).toBeNull();
    expect(document.querySelector(".dh-taskrow__handle")).toBeNull();
    // The row's own controls, at rest: one completion control, an open link,
    // the inline editors and the overflow.
    const alpha = rows[0]!;
    expect(
      within(alpha).getByRole("checkbox", { name: "Complete Alpha task" }),
    ).toBeInTheDocument();
    expect(
      within(alpha).getByRole("link", { name: "Open Alpha task" }),
    ).toBeInTheDocument();
    expect(within(alpha).getByTestId("task-row-priority")).toBeInTheDocument();
    expect(within(alpha).getByTestId("task-row-due-date")).toBeInTheDocument();
    expect(within(alpha).getByTestId("task-row-parent")).toBeInTheDocument();
    expect(
      within(alpha).getByRole("button", {
        name: "More actions for Alpha task",
      }),
    ).toBeInTheDocument();
    // …and only ONE checkbox-like control per row at rest.
    expect(within(alpha).getAllByRole("checkbox")).toHaveLength(1);
  });

  it("shows the facts the Card path lacked, with no per-surface code: repeat, parent, checklist", () => {
    renderTab({
      tasks: [
        task({
          id: "t1",
          title: "Weekly repeat",
          recurrence: {
            frequency: "week",
            interval: 1,
            dateKind: "scheduled",
            mode: "fixed",
            weekdays: [],
            ordinal: null,
            weekendRule: "allow",
            endsAfterCount: null,
            endsOnDate: null,
            anchorDay: null,
            anchorMonth: null,
          },
          scheduledDate: "2026-07-28",
          checklist: { total: 3, completed: 1 },
        }),
      ],
      nextCursor: null,
    });
    const row = screen.getByTestId("task-row");
    expect(within(row).getByTestId("task-row-repeat")).toHaveTextContent(
      "Repeats: Every week",
    );
    expect(within(row).getByTestId("task-row-checklist")).toHaveTextContent(
      "1 of 3",
    );
    expect(within(row).getByTestId("task-row-parent")).toHaveTextContent(
      "Kitchen fit-out",
    );
  });

  it("offers every action valid in the Project scope from the row's overflow", () => {
    renderTab({
      tasks: [
        task({
          id: "t1",
          title: "Alpha task",
          recurrence: {
            frequency: "day",
            interval: 1,
            dateKind: "due",
            mode: "fixed",
            weekdays: [],
            ordinal: null,
            weekendRule: "allow",
            endsAfterCount: null,
            endsOnDate: null,
            anchorDay: null,
            anchorMonth: null,
          },
          dueDate: "2026-07-22",
        }),
      ],
      nextCursor: null,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Alpha task" }),
    );
    for (const name of [
      "Plan for today",
      "Rename",
      "Move to Project or Area…",
      "Move to Someday / Maybe",
      "Skip this occurrence",
      "Stop repeating",
      "Open task",
    ]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }
  });
});

describe("CONV-01 — completion is the shared optimistic path", () => {
  it("paints the completion before the server answers, then announces it once", async () => {
    let release: () => void = () => {};
    vi.mocked(postTaskRecordActionOffline).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              kind: "server",
              data: { kind: "completion", ok: true },
            } as never);
        }),
    );
    renderTab({
      tasks: [task({ id: "t1", title: "Alpha task" })],
      nextCursor: null,
    });
    const row = screen.getByTestId("task-row");
    fireEvent.click(
      within(row).getByRole("checkbox", { name: "Complete Alpha task" }),
    );
    // The row leads the server (ADR-086)…
    expect(row).toHaveAttribute("data-completed", "true");
    // …through the canonical record route, with the canonical intent…
    expect(postTaskRecordActionOffline).toHaveBeenCalledWith(
      "t1",
      { intent: "complete" },
      { operation: "complete" },
    );
    // …and nothing has claimed success yet.
    expect(screen.getByRole("status")).toHaveTextContent("");

    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Completed Alpha task.",
      ),
    );
    // Exactly one live region on the tab, so the sentence is said once.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("puts a refused completion back exactly as it was", async () => {
    vi.mocked(postTaskRecordActionOffline).mockResolvedValueOnce({
      kind: "refused",
      message: "That task couldn’t be completed.",
    } as never);
    renderTab({
      tasks: [task({ id: "t1", title: "Alpha task" })],
      nextCursor: null,
    });
    const row = screen.getByTestId("task-row");
    fireEvent.click(
      within(row).getByRole("checkbox", { name: "Complete Alpha task" }),
    );
    expect(row).toHaveAttribute("data-completed", "true");
    await waitFor(() => expect(row).not.toHaveAttribute("data-completed"));
    expect(
      within(row).getByRole("checkbox", { name: "Complete Alpha task" }),
    ).not.toBeChecked();
    // A refusal never reaches the success channel.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("CONV-01 — a rename queued offline is painted and said to be waiting", () => {
  it("keeps the queued title on the row and announces it as waiting to sync", async () => {
    // The editor's own poster reports the rename was QUEUED (DalyHub could not
    // be reached), so it calls `onQueued` rather than `onSaved`.
    vi.mocked(postTaskRecordActionOffline).mockResolvedValueOnce({
      kind: "queued",
    } as never);
    renderTab({
      tasks: [task({ id: "t1", title: "Alpha task" })],
      nextCursor: null,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Alpha task" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Rename Alpha task" });
    fireEvent.change(input, { target: { value: "Alpha task, queued" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The row shows the owner's change, and the words say it is not confirmed.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Open Alpha task, queued" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Renamed to Alpha task, queued. Waiting to sync.",
    );
  });
});

describe("CONV-01 — selection and bulk through the one /tasks/bulk contract", () => {
  it("selects three rows and completes them with ONE request carrying three ids", async () => {
    const posted: FormData[] = [];
    renderTab(
      {
        tasks: [
          task({ id: "t1", title: "Alpha task" }),
          task({ id: "t2", title: "Bravo task" }),
          task({ id: "t3", title: "Charlie task" }),
          task({ id: "t4", title: "Delta task" }),
        ],
        nextCursor: null,
      },
      undefined,
      (form) => {
        posted.push(form);
        return { kind: "bulk", ok: true, changed: 3, unchanged: 0 };
      },
    );
    // Entering is deliberate: the toolbar's toggle.
    fireEvent.click(screen.getByTestId("project-tasks-select"));
    // In selection mode the selection control REPLACES completion (one control).
    const rows = screen.getAllByTestId("task-row");
    for (const row of rows) {
      expect(within(row).getAllByRole("checkbox")).toHaveLength(1);
      expect(
        within(row).queryByRole("checkbox", { name: /^Complete / }),
      ).toBeNull();
    }
    for (const title of ["Alpha task", "Bravo task", "Charlie task"]) {
      fireEvent.click(
        screen.getByRole("checkbox", { name: `Select ${title}` }),
      );
    }
    const bar = screen.getByRole("group", { name: "Bulk task actions" });
    expect(bar).toHaveTextContent("3 selected");

    fireEvent.click(within(bar).getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    const form = posted[0]!;
    expect(form.get("intent")).toBe("complete");
    expect(form.getAll("id")).toEqual(["t1", "t2", "t3"]);
    // The tab has no bulk path of its own: the shared single-id poster was
    // never used for the selection, and the outcome is announced once.
    expect(postTaskBulkAction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "3 tasks completed, 0 unchanged.",
      ),
    );
    // The selection is cleared by the same commit, and completion returns.
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Bulk task actions" }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("checkbox", { name: "Complete Delta task" }),
    ).toBeInTheDocument();
  });
});

describe("CONV-01 — an archived Project's rows are the row's read-only form", () => {
  it("draws no completion control, no selection toggle and one door to the record", () => {
    renderTab({
      tasks: [task({ id: "t1", title: "Only task" })],
      nextCursor: null,
      archived: true,
    });
    const row = screen.getByTestId("task-row");
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("project-tasks-select")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Only task" }),
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", { name: /Open task/ }),
    ).toHaveTextContent("Read-only until it is restored.");
  });
});

describe("Project Tasks tab pagination", () => {
  it("appends the next task page without duplicating rows, then exhausts", async () => {
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
    renderTab({
      tasks: [task({ id: "t1", title: "Only task" })],
      nextCursor: null,
    });
    expect(screen.getByText("Only task")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more tasks" }),
    ).not.toBeInTheDocument();
  });
});

describe("Project Tasks tab — archived project (PROJ-05 §5)", () => {
  it("hides 'Add task' — creating a task under an archived project always fails server-side", () => {
    renderTab({
      tasks: [task({ id: "t1", title: "Only task" })],
      nextCursor: null,
      archived: true,
    });
    expect(
      screen.queryByRole("link", { name: "Add task" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add task" }),
    ).not.toBeInTheDocument();
  });

  it("hides 'Add task' in the empty state too, with calm archived-aware copy", () => {
    renderTab({ tasks: [], nextCursor: null, archived: true });
    expect(
      screen.queryByRole("link", { name: "Add task" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/archived project has no tasks/),
    ).toBeInTheDocument();
  });
});

/**
 * PROJ-01 — reconciling the accumulated pages after a task MUTATION.
 *
 * A task completed / edited / created from a row, the shared Drawer or the
 * create form triggers a revalidation of the record loader (the URL is
 * unchanged). The tab must DROP its accumulated later pages so the fresh,
 * authoritative first page reconciles the change (no stale row lingers) — while
 * a drawer-only navigation must NOT reset, so pagination and drawer state stay
 * independent.
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
      <FeedbackProvider>
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
            parents={[]}
            taskState="open"
            todayIso={TODAY}
          />
        </DrawerProvider>
      </FeedbackProvider>
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

/**
 * HARDEN-06E (F-09) — the checklist figure, in the ONE wording the product uses.
 *
 * It was the finding that motivated DEBT-175: the figure was added to the shared
 * row and this tab, being a second implementation, did not have it. The tab now
 * IS the shared row, so the figure is the row's own `task-row-checklist`.
 */
describe("checklist progress on a project's task row", () => {
  it("shows the same '1 of 3' the other surfaces show", () => {
    renderTab({
      tasks: [task({ checklist: { total: 3, completed: 1 } })],
      nextCursor: null,
    });
    expect(screen.getByTestId("task-row-checklist").textContent).toBe("1 of 3");
  });

  it("draws nothing for a Task with no checklist, and nothing for one the loader did not project", () => {
    renderTab({
      tasks: [
        task({
          id: "t1",
          title: "Empty",
          checklist: { total: 0, completed: 0 },
        }),
        task({ id: "t2", title: "Unprojected" }),
      ],
      nextCursor: null,
    });
    // The absence rule: a dimension that was not used prints nothing, and
    // "0 of 0" is never shown.
    expect(screen.queryByTestId("task-row-checklist")).toBeNull();
  });
});
