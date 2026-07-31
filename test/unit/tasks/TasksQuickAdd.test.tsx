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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
    expect(body.get("priority")).toBe("p1");
    expect(body.get("timeSector")).toBe("this_week");
    expect(body.get("scheduledDate")).toBe("2026-07-25");
  });

  it("clears and REFOCUSES after a save, so the next task is one keystroke away", async () => {
    mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    fireEvent.change(input(), { target: { value: "First" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() => expect(input().value).toBe(""));
    expect(document.activeElement).toBe(input());
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
    // Focus stays put so a retry needs no hunting.
    expect(document.activeElement).toBe(input());
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an Inbox task when there is no capture parent", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({ defaultParent: null });
    expect(input().disabled).toBe(false);
    expect(input().placeholder).toContain("Inbox");

    fireEvent.change(input(), { target: { value: "Capture this" } });
    fireEvent.submit(input().closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
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
