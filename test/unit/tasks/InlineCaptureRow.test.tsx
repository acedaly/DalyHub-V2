/**
 * The SHARED inline capture row — what makes it shared rather than moved.
 *
 * `TasksQuickAdd.test.tsx` already covers the capture BEHAVIOUR in full (the
 * canonical route, the parser, the field surviving a recoverable failure,
 * refocus) and it still exercises this component, because `TasksQuickAdd` is now
 * a six-line adapter over it. This file covers only what became true when the row
 * gained three more hosts:
 *
 *   - a host's own classification is FOLDED INTO the view's, so a board column
 *     that stands for "Priority 1" creates a Priority 1 while the view's own
 *     session defaults still apply;
 *   - a host that already announces its outcomes lends its announcer, and the
 *     row then draws no second `role="status"` — the one thing four capture rows
 *     on one screen would otherwise break;
 *   - a host with no full form to hand off to gets no dead "More options".
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InlineCaptureRow } from "~/shared/task-record/InlineCaptureRow";

const PROJECT = {
  id: "p-1",
  kind: "project" as const,
  title: "Kitchen fit-out",
};

function renderRow(
  over: Partial<React.ComponentProps<typeof InlineCaptureRow>> = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/tasks",
        element: (
          <InlineCaptureRow
            destination={PROJECT}
            todayIso="2026-07-30"
            inputTestId="capture-input"
            {...over}
          />
        ),
      },
    ],
    { initialEntries: ["/tasks"] },
  );
  render(<RouterProvider router={router} />);
}

const input = () => screen.getByTestId("capture-input") as HTMLInputElement;

function mockFetch(response: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createBody(fetchMock: ReturnType<typeof vi.fn>): FormData {
  const call = fetchMock.mock.calls.find(
    (entry) => entry[0] === "/tasks/new",
  ) as [string, RequestInit] | undefined;
  expect(call, "no POST to /tasks/new").toBeDefined();
  return call![1].body as FormData;
}

async function capture(fetchMock: ReturnType<typeof vi.fn>, title: string) {
  fireEvent.change(input(), { target: { value: title } });
  fireEvent.submit(input().closest("form")!);
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some((entry) => entry[0] === "/tasks/new"),
    ).toBe(true),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the shared inline capture row", () => {
  it("folds the HOST's classification into the view's, and lets the typed line beat both", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    // A board column standing for Priority 1, inside a view already scoped to a
    // sector and a day: the column's field is the one the column promises.
    renderRow({
      defaults: {
        priority: "p1",
        timeSector: "this_week",
        scheduledDate: "2026-07-30",
      },
    });

    await capture(fetchMock, "Order the splashback tile");
    const body = createBody(fetchMock);
    expect(body.get("priority")).toBe("p1");
    expect(body.get("timeSector")).toBe("this_week");
    expect(body.get("scheduledDate")).toBe("2026-07-30");
    expect(body.get("parentId")).toBe("p-1");
    expect(body.get("parentKind")).toBe("project");
  });

  it("still lets the typed line override what the surface is carrying", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({ defaults: { priority: "p4" } });

    // The owner typed `p1` on a row whose column stands for P4. The words win:
    // a default is what the surface knows, not what the owner just said.
    await capture(fetchMock, "Chase the plumber p1");
    const body = createBody(fetchMock);
    expect(body.get("priority")).toBe("p1");
    expect(body.get("title")).toBe("Chase the plumber");
  });

  it("draws its own live region when the host has none", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();

    expect(screen.getAllByRole("status")).toHaveLength(1);
    await capture(fetchMock, "Template the benchtop");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Added “Template the benchtop”.",
      ),
    );
  });

  it("lends the announcement to a host that already has one, and adds no second region", async () => {
    const fetchMock = mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    const announce = vi.fn();
    renderRow({ announce });

    // The whole point: four capture rows on one board must not put four polite
    // live regions on the page for one screen's worth of outcomes.
    expect(screen.queryAllByRole("status")).toHaveLength(0);

    await capture(fetchMock, "Install the base cabinets");
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        "Added “Install the base cabinets”.",
      ),
    );
  });

  it("omits More options where there is no full form to hand off to", () => {
    mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow();
    // A board column has no drawer of its own; a control that opens nothing is
    // worse than an absent one.
    expect(
      screen.queryByRole("button", { name: "More options" }),
    ).not.toBeInTheDocument();
  });

  it("names the destination the way the SURFACE names it", () => {
    mockFetch({ kind: "create", ok: true, taskId: "t-1" });
    renderRow({
      destinationLabel: "Priority 1",
      label: "Add a task to Priority 1",
    });

    // A board column says where the task will APPEAR, which is not always the
    // same sentence as where it is filed.
    expect(input().placeholder).toContain("Priority 1");
    expect(
      screen.getByRole("form", { name: "Add a task to Priority 1" }),
    ).toBeInTheDocument();
  });
});
