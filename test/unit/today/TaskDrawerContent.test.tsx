/**
 * TODAY-02 — the task Drawer content, exercised as behaviour.
 *
 * Renders TaskDrawerContent inside the same frame the route provides (a data
 * router + FeedbackProvider + DrawerProvider) with `fetch` stubbed to a task
 * resource route, and asserts what the owner experiences: the record renders,
 * fields edit and validate, Save persists, completion toggles, relationships show,
 * and the loading / not-found / error states are calm.
 */

import { useState, type ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
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
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import { TaskDrawerContent } from "~/modules/today/task/TaskDrawerContent";
import type { SerializedTaskView } from "~/shared/task-record/task-view";

const TASK: SerializedTaskView = {
  id: "t1",
  title: "Write the ADR",
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  deletedAt: null,
  completedAt: null,
  status: "todo",
  priority: "p1",
  dueDate: "2026-08-01",
  scheduledDate: null,
  timeSector: null,
  commitmentState: "active",
  delegation: null,
  description: "The plan is documented here.",
  tags: [],
  project: { kind: "project", id: "p1", title: "Ship V2" },
  goal: { kind: "goal", id: "g1", title: "Promotion" },
  area: { kind: "area", id: "a1", title: "Career" },
  waiting: null,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface StubOptions {
  readonly detailStatus?: number;
  readonly detail?: unknown;
  readonly updateResult?: unknown;
  readonly onPost?: (intent: string, body: FormData) => void;
  /** Every POST, with its URL — the bulk field endpoint is not the record's. */
  readonly onPostUrl?: (url: string, body: FormData) => void;
}

function stubFetch(options: StubOptions = {}) {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/activity")) {
      return jsonResponse({ items: [], nextCursor: null, hasMore: false });
    }
    if (url.includes("/link-targets")) {
      return jsonResponse({ options: [] });
    }
    if (method === "POST") {
      const body = init?.body as FormData;
      const intent = String(body.get("intent"));
      options.onPost?.(intent, body);
      options.onPostUrl?.(url, body);
      if (url.includes("/tasks/bulk")) {
        return jsonResponse({
          kind: "bulk",
          ok: true,
          changed: 1,
          unchanged: 0,
        });
      }
      // The real route answers BOTH `update` and the focused `rename` with a
      // `kind: "update"` payload, so the stub does too — otherwise an inline
      // rename would appear to succeed here while failing against the server.
      if (intent === "update" || intent === "rename") {
        return jsonResponse(
          options.updateResult ?? {
            kind: "update",
            status: "success",
            task: TASK,
          },
        );
      }
      if (intent === "complete" || intent === "reopen") {
        return jsonResponse({ kind: "completion", ok: true, task: TASK });
      }
      return jsonResponse({ kind: "link", ok: true });
    }
    return jsonResponse(
      options.detail ?? {
        task: TASK,
        links: [],
        // TASKS-13 — the record's loader payload carries its checklist. Empty
        // here: these specs are about the drawer's Task behaviour, and the
        // checklist has its own.
        checklist: [],
        todayIso: "2026-07-20",
      },
      options.detailStatus ?? 200,
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDrawer(element: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <FeedbackProvider>
            <DrawerProvider renderDrawer={() => null}>{element}</DrawerProvider>
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: ["/today?drawer=task:t1"] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task record rendering", () => {
  beforeEach(() => stubFetch());

  it("renders the task with its derived status and metadata", async () => {
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByRole("heading", { name: "Write the ADR" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".record-status")).toHaveTextContent(
      "Unscheduled",
    );
    expect(screen.getByText("1 Aug 2026")).toBeInTheDocument();
    // Priority is the shared PriorityFlag: the full label is shown in detail
    // contexts and exposed as the accessible name.
    expect(screen.getByText("Priority 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority 1")).toBeInTheDocument();
    /*
     * CONTROL-01 §4 — the parent is a searchable PICKER on the record now, not a
     * printed value, so the assertion moves from "the words Ship V2 appear" to
     * "the parent control holds this task's parent". That is the stronger claim:
     * the option is synthesised from the record itself when the bounded
     * `/tasks/parent-options` page has not returned it, so a task whose Project
     * is deep in a large workspace still shows its Project rather than a blank.
     */
    expect(await screen.findByDisplayValue("Ship V2")).toBe(
      screen.getByRole("combobox", { name: /Project or Area/ }),
    );
  });

  it("shows the completion control", async () => {
    /*
     * CONTROL-01 §4 — completion is the record HEADER's action, not a checkbox
     * in the summary column. It is two named commands rather than one toggle,
     * in the same slot and the same words a Project's lifecycle act uses, so an
     * open task offers "Complete task" and a finished one offers "Reopen task".
     */
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByRole("button", { name: "Complete task" }),
    ).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("edits the title on the RECORD, not through the details form (EDIT-02)", async () => {
    const posts: Array<{ intent: string; body: FormData }> = [];
    stubFetch({ onPost: (intent, body) => posts.push({ intent, body }) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);

    const trigger = await screen.findByRole("button", {
      name: "Task title: Write the ADR",
    });
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", { name: "Task title" });
    fireEvent.change(input, { target: { value: "Write the persistence ADR" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(posts.some((post) => post.intent === "rename")).toBe(true),
    );
    // A FOCUSED intent, carrying only the field it edits.
    const rename = posts.find((post) => post.intent === "rename")!;
    expect(rename.body.get("title")).toBe("Write the persistence ADR");
    expect(rename.body.get("status")).toBeNull();
  });

  it("saves the remaining details form, carrying only the fields it still owns", async () => {
    const posts: Array<{ intent: string; body: FormData }> = [];
    stubFetch({ onPost: (intent, body) => posts.push({ intent, body }) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );

    // The title, the priority and the two dates have left this form — they are
    // edited where they are shown, and a whole-record submit here would revert
    // an inline change made while the form was open. Scoped to the form, since
    // the record's own inline fields for those values are on screen too.
    const form = within(screen.getByRole("form", { name: "Edit task" }));
    expect(form.queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(form.queryByLabelText(/^Priority/)).not.toBeInTheDocument();
    expect(form.queryByLabelText(/^Due date/)).not.toBeInTheDocument();
    expect(form.queryByLabelText(/^Scheduled date/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(posts.some((post) => post.intent === "update")).toBe(true),
    );
    const update = posts.find((post) => post.intent === "update")!;
    expect(update.body.get("title")).toBeNull();
    expect(update.body.get("priority")).toBeNull();
    expect(update.body.get("dueDate")).toBeNull();
    expect(update.body.get("status")).toBe("todo");
  });

  it("cancels edit mode without saving", async () => {
    const fetchMock = stubFetch();
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    // Back to the read view; no POST was made.
    expect(
      await screen.findByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });

  it("surfaces a server field error without losing input", async () => {
    stubFetch({
      updateResult: {
        kind: "update",
        status: "error",
        fieldErrors: { description: "That content is too large." },
      },
    });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    const description = await screen.findByRole("textbox", {
      name: "Description",
    });
    fireEvent.change(description, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      (await screen.findAllByText("That content is too large.")).length,
    ).toBeGreaterThan(0);
    // The entered value is preserved.
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Changed",
    );
  });

  it("EDIT-02: keeps a refused inline rename in the field, with the server's message", async () => {
    stubFetch({
      updateResult: {
        kind: "update",
        status: "error",
        fieldErrors: { title: "A title is required." },
      },
    });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Task title: Write the ADR" }),
    );
    const input = screen.getByRole("textbox", { name: "Task title" });
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A title is required.",
    );
    // The editor is still open, still holding exactly what was typed.
    expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue(
      "  ",
    );
  });
});

describe("priority and dates, changed on the record (EDIT-02)", () => {
  it("changes one priority directly to another, with no clearing step", async () => {
    const posts: Array<{ url: string; body: FormData }> = [];
    stubFetch({ onPostUrl: (url, body) => posts.push({ url, body }) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);

    // The current value IS the control, and it names its field.
    fireEvent.click(
      await screen.findByRole("button", { name: "Priority: Priority 1" }),
    );
    expect(
      screen.getByRole("menuitemradio", { name: "Priority 1" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Priority 3" }));

    await waitFor(() =>
      expect(posts.some((post) => post.url.includes("/tasks/bulk"))).toBe(true),
    );
    const bulk = posts.find((post) => post.url.includes("/tasks/bulk"))!;
    expect(bulk.body.get("intent")).toBe("set_priority");
    expect(bulk.body.get("priority")).toBe("p3");
    expect(bulk.body.get("id")).toBe("t1");
  });

  it("sets normal priority through the same priority list", async () => {
    const posts: Array<{ url: string; body: FormData }> = [];
    stubFetch({ onPostUrl: (url, body) => posts.push({ url, body }) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Priority: Priority 1" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Priority 4" }));
    await waitFor(() =>
      expect(posts.some((post) => post.url.includes("/tasks/bulk"))).toBe(true),
    );
    expect(
      posts
        .find((post) => post.url.includes("/tasks/bulk"))!
        .body.get("priority"),
    ).toBe("p4");
  });

  it("sets the due date without opening the details form", async () => {
    const posts: Array<{ url: string; body: FormData }> = [];
    stubFetch({ onPostUrl: (url, body) => posts.push({ url, body }) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);

    fireEvent.click(await screen.findByRole("button", { name: /^Due date: / }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Edit due date" }),
    );
    /*
     * CONTROL-01 — DalyHub's own month grid, not a native `<input type="date">`,
     * and a day commits on selection. `PageDown` walks the month, which is the
     * keyboard contract the grid publishes.
     */
    const grid = dialog.getByRole("grid", { name: "Due date" });
    fireEvent.keyDown(grid, { key: "PageDown" });
    fireEvent.click(
      within(grid).getByRole("button", { name: "Wednesday 30 September 2026" }),
    );

    await waitFor(() =>
      expect(posts.some((post) => post.body.get("intent") === "set_due")).toBe(
        true,
      ),
    );
    expect(
      posts
        .find((post) => post.body.get("intent") === "set_due")!
        .body.get("dueDate"),
    ).toBe("2026-09-30");
  });
});

describe("completion", () => {
  it("leaves the checklist EDITABLE on a completed Task, and locks it on a deleted one", async () => {
    /*
     * TASKS-13 — completion is a fact about the COMMITMENT, not an archive of
     * the work. "Finished it, forgot to tick the last one" is an ordinary
     * correction, and a mis-ticked step in a completed occurrence of a recurring
     * Task would otherwise be permanent. Every other control in this record
     * behaves the same way; the one thing completion disables is the repeat
     * rule, which has already produced its successor.
     *
     * Deletion is the read-only case, and this pins both halves so the two can
     * never quietly swap.
     */
    const completed = { ...TASK, completedAt: "2026-07-21T09:00:00.000Z" };
    stubFetch({
      detail: {
        task: completed,
        links: [],
        checklist: [
          {
            id: "c1",
            taskId: "t1",
            title: "Check tyre pressures",
            position: 0,
            completed: false,
            createdAt: "2026-07-18T09:00:00.000Z",
            updatedAt: "2026-07-18T09:00:00.000Z",
          },
        ],
        todayIso: "2026-07-20",
      },
    });
    const { unmount } = renderDrawer(<TaskDrawerContent taskId="t1" />);
    // The Task is completed…
    await screen.findByRole("button", { name: "Reopen task" });
    /*
     * …and its step is still a live control, with its menu. Awaited rather than
     * read synchronously: the checklist is seeded from the loaded record in an
     * effect, so it paints one render after the header the record's own state
     * produces.
     */
    expect(
      await screen.findByRole("checkbox", { name: "Check tyre pressures" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: /More actions for Check tyre pressures/,
      }),
    ).toBeInTheDocument();
    unmount();

    const deleted = {
      ...completed,
      deletedAt: "2026-07-22T09:00:00.000Z",
    };
    stubFetch({
      detail: {
        task: deleted,
        links: [],
        checklist: [
          {
            id: "c1",
            taskId: "t1",
            title: "Check tyre pressures",
            position: 0,
            completed: false,
            createdAt: "2026-07-18T09:00:00.000Z",
            updatedAt: "2026-07-18T09:00:00.000Z",
          },
        ],
        todayIso: "2026-07-20",
      },
    });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByRole("checkbox", { name: "Check tyre pressures" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: /More actions for Check tyre pressures/,
      }),
    ).toBeNull();
  });

  it("posts a completion when the control is toggled", async () => {
    const posts: string[] = [];
    stubFetch({ onPost: (intent) => posts.push(intent) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    const action = await screen.findByRole("button", {
      name: "Complete task",
    });
    fireEvent.click(action);
    await waitFor(() => expect(posts).toContain("complete"));
  });
});

describe("links", () => {
  beforeEach(() => stubFetch());

  it("shows the real project, goal and area relationships", async () => {
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    await screen.findByRole("heading", { name: "Write the ADR" });
    fireEvent.click(screen.getByRole("tab", { name: "Linked" }));
    const relationships = await screen.findByRole("region", {
      name: "Relationships",
    });
    expect(within(relationships).getByText("Ship V2")).toBeInTheDocument();
    expect(within(relationships).getByText("Promotion")).toBeInTheDocument();
    expect(within(relationships).getByText("Career")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("renders a calm not-found for a missing task", async () => {
    stubFetch({ detail: { error: "not_found" }, detailStatus: 404 });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByText("We couldn’t find that task"),
    ).toBeInTheDocument();
  });

  it("renders an error with retry when the load fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByText("We couldn’t load this task"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* TODAY-05 — task-shortcut ownership gated on the interactive top drawer      */
/* -------------------------------------------------------------------------- */

let observed: readonly AppAction[] = [];
function Observer() {
  observed = useContextualActions();
  return null;
}

/** A harness that renders the task drawer with a togglable `isTop`, so we can prove
 *  the lower (non-top) task drawer keeps its state but not its shortcuts. */
function IsTopHarness() {
  const [isTop, setIsTop] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsTop((t) => !t)}>
        toggle-top
      </button>
      <TaskDrawerContent taskId="t1" isTop={isTop} />
    </>
  );
}

function renderWithCommands(element: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <FeedbackProvider>
            <CommandContextProvider>
              <Observer />
              <DrawerProvider renderDrawer={() => null}>
                {element}
              </DrawerProvider>
            </CommandContextProvider>
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: ["/today?drawer=task:t1"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("TODAY-05 task drawer shortcut ownership (isTop)", () => {
  it("registers task commands only while it is the top drawer, preserving state", async () => {
    const fetchMock = stubFetch();
    renderWithCommands(<IsTopHarness />);

    // Loaded and top: its task commands (complete/plan/…) are registered.
    await screen.findByRole("heading", { name: "Write the ADR" });
    await waitFor(() =>
      expect(observed.some((a) => a.id === "today.task.t1.toggle")).toBe(true),
    );
    expect(observed.some((a) => a.id === "today.task.t1.plan_today")).toBe(
      true,
    );
    const loadsAfterMount = fetchMock.mock.calls.length;

    // Stack another drawer above it → no longer top: task commands are removed…
    fireEvent.click(screen.getByRole("button", { name: "toggle-top" }));
    await waitFor(() =>
      expect(observed.some((a) => a.id.startsWith("today.task.t1."))).toBe(
        false,
      ),
    );
    // …but local state is intact (still mounted, not re-fetched, heading present).
    expect(
      screen.getByRole("heading", { name: "Write the ADR" }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(loadsAfterMount);

    // Becomes top again → task commands return.
    fireEvent.click(screen.getByRole("button", { name: "toggle-top" }));
    await waitFor(() =>
      expect(observed.some((a) => a.id === "today.task.t1.toggle")).toBe(true),
    );
  });
});
