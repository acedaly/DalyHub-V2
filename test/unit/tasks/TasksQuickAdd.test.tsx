/**
 * TASKS-03 — the in-workspace quick add row.
 *
 * What makes adding several tasks in succession quick is entirely behavioural, so
 * it is asserted behaviourally: the field survives the save, clears, refocuses, and
 * NEVER discards entered text after a recoverable failure. Every outcome is
 * announced, and the row posts to the canonical creation route.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TasksQuickAdd } from "~/modules/tasks/TasksQuickAdd";

const PARENT = {
  id: "a-1",
  kind: "area" as const,
  title: "Work",
  context: "Area",
};

function renderRow(
  over: Partial<React.ComponentProps<typeof TasksQuickAdd>> = {},
) {
  const onOpenFullForm = vi.fn();
  // A DATA router: the row revalidates the /tasks loader after a save, which is how
  // a newly added task appears in the list without a navigation.
  const router = createMemoryRouter(
    [
      {
        path: "/tasks",
        element: (
          <TasksQuickAdd
            defaultParent={PARENT}
            sessionDefaults={{}}
            todayIso="2026-07-30"
            onOpenFullForm={onOpenFullForm}
            {...over}
          />
        ),
      },
    ],
    { initialEntries: ["/tasks"] },
  );
  render(<RouterProvider router={router} />);
  return { onOpenFullForm };
}

const input = () =>
  screen.getByTestId("tasks-quickadd-input") as HTMLInputElement;

function mockFetch(response: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * The CREATE call, found by its path rather than by its position.
 *
 * V2.6 FIND-04 — the row also reads the shared tag vocabulary when it mounts
 * (`GET /tags`), so the create is no longer the first `fetch`. These assertions
 * were always about what was POSTED to `/tasks/new`; naming the path says so.
 */
function createCall(
  fetchMock: ReturnType<typeof vi.fn>,
): [string, RequestInit] {
  const call = fetchMock.mock.calls.find(
    (entry) => entry[0] === "/tasks/new",
  ) as [string, RequestInit] | undefined;
  expect(call, "no POST to /tasks/new").toBeDefined();
  return call!;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quick add", () => {
  it("posts a title to the CANONICAL creation route with the resolved parent", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), { target: { value: "Draft the brief" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const [url, init] = createCall(fetchMock);
    // There is NO list-only create path: this is the same endpoint the Drawer's
    // capture form posts to.
    expect(url).toBe("/tasks/new");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("title")).toBe("Draft the brief");
    expect(body.get("parentId")).toBe("a-1");
    expect(body.get("parentKind")).toBe("area");
  });

  it("carries the session's classification so a task lands where the user is looking", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({
      sessionDefaults: {
        priority: "p1",
        timeSector: "this_week",
        scheduledDate: "2026-07-25",
      },
    });

    fireEvent.change(input(), { target: { value: "Urgent thing" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const body = createCall(fetchMock)[1].body as FormData;
    expect(body.get("priority")).toBe("p1");
    expect(body.get("timeSector")).toBe("this_week");
    expect(body.get("scheduledDate")).toBe("2026-07-25");
  });

  it("submits a TASKS-11 after-completion phrase as the structured rule, mode included", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), {
      target: { value: "Service Hilux every 6 months after completion" },
    });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const body = createCall(fetchMock)[1].body as FormData;
    expect(body.get("title")).toBe("Service Hilux");
    expect(body.get("recurrenceFrequency")).toBe("month");
    expect(body.get("recurrenceInterval")).toBe("6");
    expect(body.get("recurrenceMode")).toBe("after_completion");
    expect(body.get("recurrenceDateKind")).toBe("scheduled");
    // The first occurrence is the owner's day — the anchor an interval measured from
    // completion has to start from.
    expect(body.get("scheduledDate")).toBe("2026-07-30");
  });

  it("submits an ordinary repeat as a FIXED schedule", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), {
      target: { value: "Pay rent tomorrow every month" },
    });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const body = createCall(fetchMock)[1].body as FormData;
    expect(body.get("title")).toBe("Pay rent");
    expect(body.get("recurrenceFrequency")).toBe("month");
    expect(body.get("recurrenceMode")).toBe("fixed");
  });

  it("clears and REFOCUSES after a save, so the next task is one keystroke away", async () => {
    mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), { target: { value: "First" } });
    fireEvent.submit(input().closest("form")!);

    // TWO eventual outcomes, so two waits. The field is cleared by a state update
    // and refocused by an EFFECT gated on the save no longer being in flight, so
    // focus returns one effect after the value empties. Awaiting only the clear and
    // then asserting focus synchronously is a race the component always eventually
    // wins — it just had not won yet, which is how this failed on CI while the
    // behaviour was correct.
    await waitFor(() => expect(input().value).toBe(""));
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("announces a save politely", async () => {
    mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), { target: { value: "Announce me" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Announce me"),
    );
  });

  it("NEVER discards entered text after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderRow();

    fireEvent.change(input(), { target: { value: "Precious text" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(input().value).toBe("Precious text");
    expect(screen.getByRole("alert").textContent).toContain("safe");
    /*
     * Focus stays put so a retry needs no hunting — awaited, for the same reason
     * the save-and-refocus test above already awaits it, and this is the second
     * half of that same defect.
     *
     * The component returns focus from an EFFECT gated on the error state
     * (`TasksQuickAdd.tsx` — `useEffect(() => { if (error) inputRef.current?.focus(); }, [error])`),
     * and the `waitFor` above resolves as soon as the alert EXISTS, which is the
     * render that sets `error` — one commit before that effect flushes. Asserting
     * focus synchronously there is a race the component always eventually wins,
     * so it passes locally and fails on a slower machine.
     *
     * It duly did: `main` @ `acbad51` (run 31675715619), 1 failed / 5267 passed,
     * `expected <body> to be <input>` — on a documentation-only diff whose
     * previous commit had passed this very step. Identical code, opposite result,
     * which is what identifies it as a test defect rather than a product one.
     */
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("NEVER discards entered text after a server-side rejection, and says why", async () => {
    mockFetch({
      kind: "create",
      ok: false,
      formError: "That Project or Area is no longer available.",
    });
    renderRow();

    fireEvent.change(input(), { target: { value: "Still here" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "no longer available",
      ),
    );
    expect(input().value).toBe("Still here");
  });

  it("clears the error as soon as the user edits again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderRow();
    fireEvent.change(input(), { target: { value: "x" } });
    fireEvent.submit(input().closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    fireEvent.change(input(), { target: { value: "xy" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits nothing for an empty or whitespace-only title", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();
    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.submit(input().closest("form")!);
    // Nothing was CREATED. The row's own read of the shared tag vocabulary is a
    // GET and is not a submission, so the assertion names the create path.
    expect(fetchMock.mock.calls.map((entry) => entry[0])).not.toContain(
      "/tasks/new",
    );
  });

  it("creates an Inbox task when there is no capture parent", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({ defaultParent: null });
    expect(input().disabled).toBe(false);
    expect(input().placeholder).toContain("Inbox");

    fireEvent.change(input(), { target: { value: "Capture this" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const body = createCall(fetchMock)[1].body as FormData;
    expect(body.get("title")).toBe("Capture this");
    expect(body.has("parentId")).toBe(false);
    expect(body.has("parentKind")).toBe(false);
  });

  it("applies deterministic calendar and priority tokens before save", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({ defaultParent: null });

    fireEvent.change(input(), {
      target: { value: "Prepare OpO slides tomorrow p1" },
    });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
      ).toBe(true),
    );
    const body = createCall(fetchMock)[1].body as FormData;
    expect(body.get("title")).toBe("Prepare OpO slides");
    expect(body.get("scheduledDate")).toBe("2026-07-31");
    expect(body.get("priority")).toBe("p1");
  });

  it("keeps the full capture form one click away", () => {
    const { onOpenFullForm } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(onOpenFullForm).toHaveBeenCalledTimes(1);
  });

  it("labels the field for assistive technology", () => {
    renderRow();
    expect(screen.getByLabelText("Task title")).toBe(input());
  });
});
