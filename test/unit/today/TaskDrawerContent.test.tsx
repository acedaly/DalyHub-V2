/**
 * TODAY-02 — the task Drawer content, exercised as behaviour.
 *
 * Renders TaskDrawerContent inside the same frame the route provides (a data
 * router + FeedbackProvider + DrawerProvider) with `fetch` stubbed to a task
 * resource route, and asserts what the owner experiences: the record renders,
 * fields edit and validate, Save persists, completion toggles, relationships show,
 * and the loading / not-found / error states are calm.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import { TaskDrawerContent } from "~/modules/today/task/TaskDrawerContent";
import type { SerializedTaskView } from "~/modules/today/task/task-view";

const TASK: SerializedTaskView = {
  id: "t1",
  title: "Write the ADR",
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  deletedAt: null,
  completedAt: null,
  status: "todo",
  priority: "high",
  dueDate: "2026-08-01",
  scheduledDate: null,
  description: "The plan is documented here.",
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
      if (intent === "update") {
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
      options.detail ?? { task: TASK, links: [] },
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
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(screen.getByText("1 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Ship V2")).toBeInTheDocument();
  });

  it("shows the completion control", async () => {
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByRole("checkbox", { name: /mark complete/i }),
    ).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("enters edit mode, validates, and saves", async () => {
    const fetchMock = stubFetch();
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );

    const title = await screen.findByLabelText(/Title/);
    expect(title).toHaveValue("Write the ADR");

    // Emptying the required title blocks the save with a validation error.
    fireEvent.change(title, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      (await screen.findAllByText("A title is required")).length,
    ).toBeGreaterThan(0);

    // A valid title saves and posts an update intent.
    fireEvent.change(title, { target: { value: "Write the persistence ADR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(posted).toBeDefined();
    });
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
        fieldErrors: { dueDate: "That date is in the past." },
      },
    });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    const title = await screen.findByLabelText(/Title/);
    fireEvent.change(title, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      (await screen.findAllByText("That date is in the past.")).length,
    ).toBeGreaterThan(0);
    // The entered value is preserved.
    expect(screen.getByLabelText(/Title/)).toHaveValue("Changed");
  });
});

describe("completion", () => {
  it("posts a completion when the control is toggled", async () => {
    const posts: string[] = [];
    stubFetch({ onPost: (intent) => posts.push(intent) });
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    const checkbox = await screen.findByRole("checkbox", {
      name: /mark complete/i,
    });
    fireEvent.click(checkbox);
    await waitFor(() => expect(posts).toContain("complete"));
  });
});

describe("links", () => {
  beforeEach(() => stubFetch());

  it("shows the real project, goal and area relationships", async () => {
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    await screen.findByRole("heading", { name: "Write the ADR" });
    fireEvent.click(screen.getByRole("tab", { name: "Links" }));
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
      await screen.findByText("We couldn't find that task"),
    ).toBeInTheDocument();
  });

  it("renders an error with retry when the load fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    renderDrawer(<TaskDrawerContent taskId="t1" />);
    expect(
      await screen.findByText("We couldn't load this task"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
